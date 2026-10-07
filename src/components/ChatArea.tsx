import React, {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path } from 'react-native-svg';
import Markdown, {
  renderRules,
  RenderRules,
  hasParents,
} from 'react-native-markdown-display';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import {
  CHAT_INVERSION_STYLE,
  INVERTED_CHAT_LIST,
  chatDistanceFromBottom,
  scrollChatToBottom,
} from '../utils/chatScroll';
import MessageActions from './MessageActions';
import ImageViewer from './ImageViewer';
import { useChat } from '../context/appContexts';
import { IconCopy } from './Icons';
import { playText, stopSpeech } from '../services/speechPlayer';
import { api } from '../services/api';
import { MyToast } from './GlobalToast';

// ===================== SSR 安全的 useLayoutEffect =====================
/**
 * Web 端贴底必须用 layout effect（DOM commit 之后、浏览器 paint 之前同步执行），
 * 但 expo web 静态导出会在 Node 里预渲染 —— 那里没有 DOM、也没有 layout 阶段，
 * React 会对 useLayoutEffect 发警告，所以服务端降级成 useEffect。
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Web 专用：给每条消息行做布局隔离（contain: layout style）。
 * 某条气泡自己长高时，不让浏览器把「同一条滚动内容里的其它块」也拉进布局计算，
 * 重排范围就锁在这一条消息里。原生样式表没有这个属性，仅 Web 生效。
 */
const WEB_ROW_CONTAINMENT =
  Platform.OS === 'web' ? ({ contain: 'layout style' } as any) : null;

/**
 * 原生端聊天列表的贴底策略（2026-01 定稿）：**inverted 布局**。
 *
 * ⚠️ 之前试过「普通列表 + 底部锚点 onLayout worklet，在 UI 线程贴底」
 * （src/hooks/useUiThreadBottomPin.ts，已废弃）。真机日志显示锚点 worklet
 * **一次都没触发过**，根因在框架侧，不是我们的写法问题：
 *   1. Fabric 只在节点带「JS 函数的 onLayout prop」时才发射布局事件
 *      （react-native/ReactCommon/react/renderer/mounting/ShadowTree.cpp:574），
 *      而 reanimated 的 useEvent 返回对象 `{ workletEventHandler}`，不是函数 → 事件不发射；
 *   2. reanimated 4 的 raw event 监听器还会丢掉布局事件
 *      （apple/reanimated/apple/ReanimatedModule.mm：非主队列 return，注释原话
 *       "we don't care about topLayout events"）；
 *   3. RN 的 onContentSizeChange 只是 ScrollView.js 用内容容器 JS onLayout 合成的，
 *      天生晚一帧 —— 吐字期每帧补一发就是「先长高 → 再滚一下」的抖动本身；
 *   4. UI 线程唯一可靠的信号 onScroll 在「贴底 + 内容变高」时不触发（offset 没变）。
 *   ⇒ 普通列表要贴底就**必须**每帧下发滚动命令，晚一帧就是抖，JS 线程做不到同帧。
 *
 * 而 inverted（原生端）把**滚动原点换到了内容末尾**：吐字期内容往上长，offset 保持 0
 * 就一直贴在底部，**零滚动命令、零抖动**，不需要任何逐帧对齐。见 utils/chatScroll.ts。
 * ⚠️ 因此 messages **必须保持自然顺序**（最旧 → 最新，落在底部的是数组末尾那条），
 *    不要照抄官方 inverted FlatList 的「反转 data」—— 两种写法锚的是内容的两端。
 */

// ===================== 类型定义 =====================
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  isStreaming?: boolean;
  /** 系统类标记行（如「用户中止对话」），渲染为居中哥倩文本，不走气泡 */
  systemNote?: boolean;
  images?: string[];
}

interface ThemeType {
  isDark: boolean;
  textMain: string;
  textMuted: string;
  border: string;
  bubbleUserBg: string;
  bubbleUserText: string;
  bubbleAiBg: string;
  historyActiveText: string;
}

interface StreamingRenderMsg {
  msgId: string;
  thought: string;
  content: string;
}

interface ChatAreaProps {
  messages: Message[];
  theme: ThemeType;
  isMobile?: boolean;
  isKeyboardUp?: boolean;
  activeId: string;
  streamingRenderMsg?: StreamingRenderMsg | null;
  autoRead?: boolean; // 💡 新增：自动朗读开关
  isDrawerOpen?: boolean; // 抽屉打开时禁用文本选择，防止误触
}

interface ThoughtCollapsibleProps {
  thought: string;
  theme: ThemeType;
}

// ===================== ThoughtCollapsible =====================
const ThoughtCollapsible = memo(
  function ThoughtCollapsible({ thought, theme }: ThoughtCollapsibleProps) {
    const [isOpen, setIsOpen] = useState(true);
    const progress = useSharedValue(1);

    const scrollRef = useRef<any>(null);
    const didMountRef = useRef(false);
    const scrollRafRef = useRef<number | null>(null);

    const toggleOpen = () => {
      const nextState = !isOpen;
      setIsOpen(nextState);
      progress.value = withTiming(nextState ? 1 : 0, {
        duration: 250,
        easing: Easing.bezier(0.25, 0.1, 0.5, 1),
      });
    };

    // 思考内容流式增长时，自动把框内滚动条贴到底部。
    // 跳过首次挂载：历史消息展开时应停在顶部，让用户从头看。
    // 合并到每帧最多一次 rAF：thought 每帧都变，避免重复排队与多次强制回流。
    useEffect(() => {
      if (!didMountRef.current) {
        didMountRef.current = true;
        return;
      }
      if (scrollRafRef.current != null) return;

      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const node = scrollRef.current;
        if (!node) return;
        if (typeof node.scrollToEnd === 'function') {
          node.scrollToEnd({ animated: false });
          return;
        }
        const el =
          typeof node.getScrollableNode === 'function'
            ? node.getScrollableNode()
            : node;
        if (el && typeof el.scrollTop === 'number') {
          el.scrollTop = el.scrollHeight;
        }
      });
    }, [thought]);

    // 卸载时取消在途 rAF
    useEffect(
      () => () => {
        if (scrollRafRef.current != null) {
          cancelAnimationFrame(scrollRafRef.current);
          scrollRafRef.current = null;
        }
      },
      [],
    );

    const bodyAnimatedStyle = useAnimatedStyle(() => ({
      opacity: progress.value,
      transform: [{ translateY: (1 - progress.value) * -8 }],
      maxHeight: progress.value * 300,
      overflow: 'hidden' as const,
    }));

    const arrowAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ rotate: `${progress.value * 180}deg` }],
    }));

    return (
      <View
        style={[
          styles.thoughtBox,
          {
            borderColor: theme.border,
            backgroundColor: theme.isDark
              ? 'rgba(255,255,255,0.03)'
              : 'rgba(0,0,0,0.03)',
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={toggleOpen}
          style={styles.thoughtHeader}
        >
          <Text style={[styles.thoughtTitle, { color: theme.textMuted }]}>
            🧠 已深度思考
          </Text>
          <View style={styles.thoughtRightAction}>
            <Text
              style={{ color: theme.textMuted, fontSize: 12, marginRight: 4 }}
            >
              {isOpen ? '收起' : '展开'}
            </Text>
            <Animated.View style={arrowAnimatedStyle}>
              <Svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <Path
                  d="M6 9l6 6 6-6"
                  stroke={theme.textMuted}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Animated.View>
          </View>
        </TouchableOpacity>
        <Animated.View style={bodyAnimatedStyle}>
          {Platform.OS === 'web' ? (
            <View
              ref={scrollRef}
              style={[styles.thoughtScroll, { maxHeight: 300 }]}
            >
              <Text
                style={[
                  styles.thoughtContent,
                  { color: theme.textMuted, marginTop: 4 },
                ]}
              >
                {thought}
              </Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 300 }}
              nestedScrollEnabled
            >
              <Text
                style={[
                  styles.thoughtContent,
                  { color: theme.textMuted, marginTop: 4 },
                ]}
              >
                {thought}
              </Text>
            </ScrollView>
          )}
        </Animated.View>
      </View>
    );
  },
  (prev, next) => prev.thought === next.thought && prev.theme === next.theme,
);

// ===================== BouncingDot =====================
const BouncingDot = memo(function BouncingDot({ color }: { color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * -4 }],
    opacity: 0.4 + progress.value * 0.6,
  }));

  return (
    <Animated.View style={[styles.bouncingDot, dotStyle]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </Animated.View>
  );
});

// ===================== MessageActions（复制 + 喇叭） =====================
// 见 ./MessageActions.tsx：抽成独立组件，行高固定，吐字完成前后布局不变

// ===================== Markdown 文本可选中 =====================
// react-native-markdown-display 默认把 block 元素渲染为 View，且不透传 selectable，
// 导致「同一个气泡内跨段落」无法连续选择。这里把所有 block 元素也改渲染为 Text，
// 让整个气泡合并成一棵可选中的文本树：H5 与 App 都能长按拖动，跨段落选词/句/段后复制。
// （PC 端鼠标本就能跨段落选择，不受影响。）
// selectable=false 时（例如抽屉打开，防止误触）关闭选择，顺带清掉已有的蓝色选择框。
// 等宽字体：项目未内置 JetBrains Mono，直接用各端系统等宽字体，避免代码块回退成普通字体
const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

// 复制代码到剪贴板并提示
const copyCodeToClipboard = async (code: string) => {
  await Clipboard.setStringAsync(code);
  MyToast.show('已复制');
};

const createMarkdownRules = (selectable: boolean): RenderRules => ({
  ...renderRules,
  // 根容器：把「连续的文本块」合并进同一个可选文本树（原生保证跨段选择）；
  // 代码块单独抽成 View 盒子 —— 原生 Text 内不能嵌 View，抽出来后代码块才有
  // web 同款的圆角/内边距/背景块样式（见 codeBox / codeText）。
  body: (node, children, _parent, styles) => {
    const isCode = (t: string) => t === 'fence' || t === 'code_block';
    const blocks: React.ReactNode[] = [];
    let run: React.ReactNode[] = [];
    let runKey = 0;
    (node.children || []).forEach((child: any, i: number) => {
      if (isCode(child.type)) {
        if (run.length) {
          blocks.push(
            <Text
              key={`run-${runKey++}`}
              selectable={selectable}
              style={styles.body}
            >
              {run}
            </Text>,
          );
          run = [];
        }
        blocks.push(children[i]);
      } else {
        run.push(children[i]);
      }
    });
    if (run.length) {
      blocks.push(
        <Text
          key={`run-${runKey++}`}
          selectable={selectable}
          style={styles.body}
        >
          {run}
        </Text>,
      );
    }
    return <View key={node.key}>{blocks}</View>;
  },
  // 段落：非首块才在前面补换行（不在末尾补，避免气泡底部多出一行空白）
  paragraph: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.paragraph}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading1: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading1}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading2: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading2}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading3: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading3}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading4: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading4}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading5: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading5}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  heading6: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.heading6}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  // 引用块
  blockquote: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.blockquote}>
      {/* {node.index > 0 ? '\n' : null} */}
      {/* {'\n'} */}
      {children}
    </Text>
  ),
  // 列表：非首块才在前面补换行；符号与内容放进同一个可选文本
  bullet_list: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.bullet_list}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  ordered_list: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.ordered_list}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  list_item: (node, children, parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.list_item}>
      {node.index > 0 ? '\n' : null}
      {hasParents(parent, 'bullet_list') ? '• ' : `${node.index + 1}. `}
      {children}
    </Text>
  ),
  // 水平线：用文本代替（View 无法进入可选文本树）
  hr: (node, _children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.hr}>
      {'\n'}――――――――――――――――――――{'\n'}
    </Text>
  ),
  // 表格：转为文本
  table: (node, children, _parent, _styles) => (
    <Text key={node.key} selectable={selectable}>
      {node.index > 0 ? '\n' : null}
      {children}
    </Text>
  ),
  thead: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.thead}>
      {children}
      {'\n'}
    </Text>
  ),
  tbody: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.tbody}>
      {children}
    </Text>
  ),
  th: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.th}>
      {children}
      {'  '}
    </Text>
  ),
  tr: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.tr}>
      {children}
      {'\n'}
    </Text>
  ),
  td: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.td}>
      {children}
      {'  '}
    </Text>
  ),
  // 图片：转为占位文本（FitImage 是 View，无法进入可选文本树）
  image: (node, _children, _parent, _styles, allowedHandlers) => {
    const src = node.attributes?.src;
    if (
      src &&
      Array.isArray(allowedHandlers) &&
      allowedHandlers.some((h: string) => src.toLowerCase().startsWith(h))
    ) {
      return (
        <Text key={node.key} selectable={selectable}>
          {`[图片] ${src}`}
        </Text>
      );
    }
    return null;
  },
  // ---- 行内文本（保持可选中） ----
  textgroup: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.textgroup}>
      {children}
    </Text>
  ),
  inline: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.inline}>
      {children}
    </Text>
  ),
  text: (node, _children, _parent, styles, inheritedStyles = {}) => (
    <Text
      key={node.key}
      selectable={selectable}
      style={[inheritedStyles, styles.text]}
    >
      {node.content}
    </Text>
  ),
  strong: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.strong}>
      {children}
    </Text>
  ),
  em: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.em}>
      {children}
    </Text>
  ),
  s: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.s}>
      {children}
    </Text>
  ),
  span: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.span}>
      {children}
    </Text>
  ),
  hardbreak: (node, _children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.hardbreak}>
      {'\n'}
    </Text>
  ),
  softbreak: (node, _children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.softbreak}>
      {'\n'}
    </Text>
  ),
  code_inline: (node, _children, _parent, styles, inheritedStyles = {}) => (
    <Text
      key={node.key}
      selectable={selectable}
      style={[inheritedStyles, styles.code_inline]}
    >
      {node.content}
    </Text>
  ),
  code_block: (node, _children, _parent, styles, inheritedStyles = {}) => {
    let { content } = node;
    if (
      typeof node.content === 'string' &&
      node.content.charAt(node.content.length - 1) === '\n'
    ) {
      content = node.content.substring(0, node.content.length - 1);
    }
    return (
      <View key={node.key} style={styles.codeBox}>
        <TouchableOpacity
          onPress={() => copyCodeToClipboard(content)}
          style={styles.codeCopyBtn}
          activeOpacity={0.7}
          accessibilityLabel="复制代码"
        >
          <IconCopy size={14} color={styles.codeCopyIcon.color} />
        </TouchableOpacity>
        <Text
          selectable={selectable}
          style={[inheritedStyles, styles.codeText]}
        >
          {content}
        </Text>
      </View>
    );
  },
  fence: (node, _children, _parent, styles, inheritedStyles = {}) => {
    let { content } = node;
    if (typeof content === 'string' && content.endsWith('\n')) {
      content = content.substring(0, content.length - 1);
    }
    return (
      <View key={node.key} style={styles.codeBox}>
        <TouchableOpacity
          onPress={() => copyCodeToClipboard(content)}
          style={styles.codeCopyBtn}
          activeOpacity={0.7}
          accessibilityLabel="复制代码"
        >
          <IconCopy size={14} color={styles.codeCopyIcon.color} />
        </TouchableOpacity>
        <Text
          selectable={selectable}
          style={[inheritedStyles, styles.codeText]}
        >
          {content}
        </Text>
      </View>
    );
  },
});

// 两套规则：可选中 / 不可选中（抽屉打开时用后者，避免误触并清掉蓝色选择框）
const selectableMarkdownRules = createMarkdownRules(true);
const nonSelectableMarkdownRules = createMarkdownRules(false);

// Web 专用规则：在默认规则基础上给 fence/code_block 加上右上角复制按钮
// 默认规则把 fence/code_block 渲染成 Text，这里把它们包在 View 里加按钮
const webMarkdownRules: RenderRules = {
  ...renderRules,
  fence: (node, children, parent, styles) => {
    let { content } = node;
    if (typeof content === 'string' && content.endsWith('\n')) {
      content = content.substring(0, content.length - 1);
    }
    return (
      <View key={node.key} style={styles.codeBox}>
        <TouchableOpacity
          onPress={() => copyCodeToClipboard(content)}
          style={styles.codeCopyBtn}
          activeOpacity={0.7}
          accessibilityLabel="复制代码"
        >
          <IconCopy size={14} color={styles.codeCopyIcon.color} />
        </TouchableOpacity>
        <Text style={[styles.fence]}>{content}</Text>
      </View>
    );
  },
  code_block: (node, children, parent, styles, inheritedStyles = {}) => {
    let { content } = node;
    if (
      typeof node.content === 'string' &&
      node.content.charAt(node.content.length - 1) === '\n'
    ) {
      content = node.content.substring(0, node.content.length - 1);
    }
    return (
      <View key={node.key} style={styles.codeBox}>
        <TouchableOpacity
          onPress={() => copyCodeToClipboard(content)}
          style={styles.codeCopyBtn}
          activeOpacity={0.7}
          accessibilityLabel="复制代码"
        >
          <IconCopy size={14} color={styles.codeCopyIcon.color} />
        </TouchableOpacity>
        <Text style={[inheritedStyles, styles.code_block]}>{content}</Text>
      </View>
    );
  },
};

// ===================== 流式 markdown：段落级增量渲染 =====================
/** 列表项：`- x` / `* x` / `+ x` / `1. x` / `1) x` */
const LIST_ITEM_RE = /^([-*+]|\d+[.)])\s/;

/**
 * 判断空行前后的两行是否属于「同一族的块」—— 属于就不能在这里切。
 * 只有这几种情况会「跨空行续接」：
 * - 列表项接列表项（拆开会让列表从 1 重新编号）
 * - 表格行接表格行（拆开后半张表就没有表头了）
 * - 引用接引用（拆开会被渲染成两个引用块）
 * - 上一行是列表项、下一行是缩进续行
 * 其它情况（段落接列表、段落接代码围栏、段落接段落…）都是安全的切点。
 */
function continuesPrevBlock(prev: string, next: string): boolean {
  if (next === '') return false;
  const nextTrimmed = next.trimStart();
  if (nextTrimmed.startsWith('|')) return prev.trimStart().startsWith('|');
  if (nextTrimmed.startsWith('>')) return prev.trimStart().startsWith('>');
  if (next !== nextTrimmed) return LIST_ITEM_RE.test(prev.trimStart()); // 缩进续行
  if (LIST_ITEM_RE.test(nextTrimmed))
    return LIST_ITEM_RE.test(prev.trimStart());
  return false;
}

/**
 * 这一行的「类型」是否已经定下来了。
 *
 * 打字机只会往末尾追加，所以**只有最后一行**还会变。它当前可能只是某个标记的前半段：
 * `-` 会变成 `- 列表项`、`1` 会变成 `1. 列表项`、`|` 会变成表格行……如果拿这种
 * 还没定型的行去判断切点，切点会随着后续字符出现而「消失」，前面已经 memo 住的块
 * 被合并重排，反而制造抖动。所以没定型就一律视为不安全（不切）。
 * 判定：能明确看出它已经不是列表/引用/表格标记的才算定型（例如以文字或数字+空格开头）。
 */
function isSettledLine(line: string): boolean {
  const t = line.trimStart();
  if (t === '') return false;
  if (LIST_ITEM_RE.test(t)) return true; // 已经是确定的列表项："- x" / "1. x"
  // 还只是标记的前半段（""、"1"、"12"、"1."、"1)"、"-"、"*"、"+"、">"、"|"）→ 没定型
  if (/^(\d*[.)]?|[-*+>|])$/.test(t)) return false;
  return true;
}

/**
 * 把流式 markdown 切成「已成形的段落」+「还在长的尾巴」。
 *
 * 只在空行处切，而且：
 * - 不能在代码围栏内部切（``` 被截成两半后前一半没闭合，后半段会被当普通文本渲染）；
 * - 不能在会「跨空行续接」的两块之间切（列表会重新编号、表格会掉表头、引用会裂成两块）；
 * - 空行后面什么都还没有、或后面那行还没定型时不切（还不知道下一行会不会续接上一块）。
 *   这三条保证了切点只会**越来越靠后**：一次切出来的 block 再也不会被改写或合并。
 *
 * 因为文本只增不减、切点只会往后移，返回的 blocks 里每一段一旦产生就再也不变，
 * 渲染层可以把它们 memo 住：文本没变 → React 整棵子树直接跳过 → DOM 一个节点都不动。
 */
function splitStableBlocks(text: string): { blocks: string[]; tail: string } {
  const lines = text.split('\n');
  let inFence = false;
  let prevNonBlank = '';
  /** 安全切点的行号（那些都是空行） */
  const cuts: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedStart = line.trimStart();
    if (trimmedStart.startsWith('```') || trimmedStart.startsWith('~~~')) {
      inFence = !inFence;
      prevNonBlank = line;
      continue;
    }
    if (inFence) continue;
    if (line.trim() !== '') {
      prevNonBlank = line;
      continue;
    }

    // 空行：看它后面第一条非空行。可能续接上一块 / 后面还没有内容 / 那一行还没定型 → 不切。
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length) continue;
    if (j === lines.length - 1 && !isSettledLine(lines[j])) continue;
    if (continuesPrevBlock(prevNonBlank, lines[j])) continue;

    cuts.push(i);
  }

  if (cuts.length === 0) return { blocks: [], tail: text };

  const lastCut = cuts[cuts.length - 1];
  const blocks: string[] = [];
  let segStart = 0;
  for (const cut of cuts) {
    // 两刀之间的内容就是一块（不含切点那行空行）
    const seg = lines.slice(segStart, cut).join('\n');
    if (seg.trim() !== '') blocks.push(seg);
    segStart = cut + 1;
  }
  const tail = lines.slice(lastCut + 1).join('\n');
  return { blocks, tail };
}

/**
 * 已成形段落：props 只有字符串 + 两个稳定引用，内容不变时 memo 直接跳过，
 * DOM 保持原样（浏览器无需为它重新断行/重绘）。
 */
const StableMarkdown = memo(function StableMarkdown({
  text,
  style,
  rules,
}: {
  text: string;
  style: any;
  rules: RenderRules;
}) {
  return (
    <Markdown style={style} rules={rules}>
      {text}
    </Markdown>
  );
});

/**
 * 流式正文：已成形段落 memo 化，只有尾巴每帧重新解析。
 *
 * 这样每帧要重排的范围从「整条回答」缩小到「尾巴这一段」。之前整条回答是一个
 * 文本节点，每帧追加几个字浏览器就要对整段重跑断行 + 重绘，长回答下必然掉帧，
 * 时间是"一顿一顿"的，贴底再准也看得出底部在跳。
 *
 * 另外：流式期与结束后共用同一套 markdown 渲染 + 同一套样式，
 * 「吐字完成」那一刻不再切换渲染器、行高也不再从 22 变 24 → 气泡高度不跳。
 */
const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
  style,
  rules,
}: {
  content: string;
  style: any;
  rules: RenderRules;
}) {
  const { blocks, tail } = useMemo(() => splitStableBlocks(content), [content]);

  return (
    <View>
      {blocks.map((block, i) => (
        <StableMarkdown
          key={`md-${i}`}
          text={block}
          style={style}
          rules={rules}
        />
      ))}
      {tail ? (
        // key 用 md-${blocks.length}：尾巴将来变成稳定块时 key 不变，
        // React 复用同一个实例，不会卸载重建。
        <StableMarkdown
          key={`md-${blocks.length}`}
          text={tail}
          style={style}
          rules={rules}
        />
      ) : null}
    </View>
  );
});

// ===================== ChatMessageItem =====================
const ChatMessageItem = memo(
  ({
    item,
    theme,
    isMobile,
    isStreaming,
    playingMsgId,
    setPlayingMsgId,
    onPreviewImage,
    textSelectable = true,
  }: {
    item: Message;
    theme: ThemeType;
    isMobile: boolean;
    isStreaming?: boolean;
    playingMsgId: string | null;
    setPlayingMsgId: (id: string | null) => void;
    onPreviewImage?: (images: string[], index: number) => void;
    /** 抽屉打开时传 false：禁用文本选择并清掉蓝色选择框，避免误触 */
    textSelectable?: boolean;
  }) => {
    const isUser = item.role === 'user';
    const hasContent = !!(item.content && item.content !== '...');
    const hasThought = !!item.thought;
    const isThinking = !isUser && !hasContent && !hasThought;

    const bubbleStyle = useMemo(
      () => [
        styles.bubble,
        { maxWidth: '100%' as const },
        isUser
          ? [styles.bubbleUser, { backgroundColor: theme.bubbleUserBg }]
          : [
              styles.bubbleAi,
              {
                backgroundColor: theme.bubbleAiBg,
                borderColor: theme.border,
              },
            ],
      ],
      [isUser, theme],
    );

    const dynamicMarkdownStyles = useMemo(
      () => ({
        body: { fontSize: 15, lineHeight: 24, color: theme.textMain },
        strong: { fontWeight: 'bold' as const, color: theme.textMain },
        paragraph: { marginTop: 0, marginBottom: 8, color: theme.textMain },
        heading1: {
          fontSize: 20,
          fontWeight: 'bold' as const,
          color: theme.textMain,
          marginTop: 14,
          marginBottom: 6,
          lineHeight: 28,
        },
        heading2: {
          fontSize: 18,
          fontWeight: 'bold' as const,
          color: theme.textMain,
          marginTop: 12,
          marginBottom: 6,
          lineHeight: 24,
        },
        heading3: {
          fontSize: 16,
          fontWeight: 'bold' as const,
          color: theme.textMain,
          marginTop: 10,
          marginBottom: 4,
          lineHeight: 22,
        },
        code_inline: {
          color: theme.textMain,
          fontSize: 14,
          fontFamily: MONO_FONT,
          // 库默认 code_inline 是 { padding:10, borderWidth:1, backgroundColor:'#f5f5f5' }，
          // mergeStyle 会把它们垫在我们的样式下面，未覆盖的属性会回退到这些默认值
          // （padding:10 撑高、#f5f5f5 在深色主题下发白）。这里全部显式清掉。
          padding: 3,
          borderWidth: 0,
          // Web 保留淡色圆角小块；原生去掉背景，只留等宽字体。
          ...(Platform.OS === 'web'
            ? {
                backgroundColor: theme.isDark
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(0,0,0,0.06)',
                borderRadius: 4,
                paddingHorizontal: 5,
              }
            : { backgroundColor: 'transparent' as const }),
        },
        fence: {
          backgroundColor: theme.isDark ? '#000' : '#eee',
          color: theme.isDark ? '#d4d4d4' : '#333333',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8, // 恢复垂直 padding
          lineHeight: 20,
          fontSize: 14,
          fontFamily: MONO_FONT,
          borderWidth: 0, // 去掉库默认的 1px 白边
          // web 用默认规则时块级渲染，这里让它占满整行；原生沿用 inline-block 撑盒
          display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
          ...(Platform.OS === 'web' ? { width: '100%' as const } : null),
          verticalAlign: 'top' as any,
          marginTop: 10, // ← 代替 '\n'，web 和原生都生效
          marginBottom: 4,
        },

        code_block: {
          backgroundColor: theme.isDark ? '#1e1e1e' : '#f5f5f5',
          color: theme.isDark ? '#d4d4d4' : '#333333',
          borderRadius: 8,
          paddingHorizontal: 10,
          lineHeight: 22,
          fontSize: 14,
          fontFamily: MONO_FONT,
          borderWidth: 0, // 去掉库默认的 1px 白边
          display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
          ...(Platform.OS === 'web' ? { width: '100%' as const } : null),
          verticalAlign: 'top' as any,
          marginTop: 8,
          marginBottom: 4,
        },
        // —— 原生代码块：外层 View 盒子 + 内层等宽文本（web 走上方的 fence/code_block）——
        codeBox: {
          backgroundColor: theme.isDark ? '#000' : '#eee',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          marginTop: 10,
          marginBottom: 4,
          // 去掉 overflow:hidden，否则右上角绝对定位的复制按钮会被裁剪且点击无效
        },
        codeText: {
          color: theme.isDark ? '#d4d4d4' : '#333333',
          fontFamily: MONO_FONT,
          fontSize: 14,
          lineHeight: 20,
        },
        // 代码块右上角复制按钮样式
        codeCopyBtn: {
          position: 'absolute' as const,
          top: 8,
          right: 8,
          padding: 4,
          borderRadius: 4,
          backgroundColor: theme.isDark
            ? 'rgba(255,255,255,0.1)'
            : 'rgba(0,0,0,0.05)',
          zIndex: 10,
        },
        codeCopyIcon: {
          color: theme.isDark ? '#aaa' : '#666',
        },
        blockquote: {
          backgroundColor: theme.isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.05)',
          paddingHorizontal: 10,
          lineHeight: 22,
          color: theme.textMain,
          display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
          verticalAlign: 'top' as any,
          marginTop: 8,
          marginBottom: 4,
        },
        list_item: { color: theme.textMain, marginVertical: 2 },
        table: {
          marginVertical: 10,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 6,
        },
        // Web 用默认规则时列表容器是 View，补一点上下间距，避免紧贴上一段
        ...(Platform.OS === 'web'
          ? {
              bullet_list: { marginTop: 2, marginBottom: 6 },
              ordered_list: { marginTop: 2, marginBottom: 6 },
            }
          : null),
        hr: { backgroundColor: theme.border, height: 1, marginVertical: 12 },
      }),
      [theme],
    );

    // 系统标记行（如「用户中止对话」）：居中、哥倩、不走气泡，跟正常气泡错开
    if (item.systemNote) {
      return (
        <View style={styles.systemNoteRow}>
          <Text style={[styles.systemNoteText, { color: theme.textMuted }]}>
            {item.content}
          </Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.messageRow,
          isUser ? styles.rowUser : styles.rowAi,
          WEB_ROW_CONTAINMENT,
        ]}
      >
        {isUser && item.images && item.images.length > 0 ? (
          <View style={styles.userImagesColumn}>
            {/* 图片气泡（独占一行，位于文本上方） */}
            <View style={[bubbleStyle, styles.imageBubble]}>
              <View style={styles.userImagesContainer}>
                {item.images.map((imgUri, idx) => (
                  <TouchableOpacity
                    key={`${imgUri.slice(0, 32)}-${idx}`}
                    activeOpacity={0.85}
                    onPress={() => onPreviewImage?.(item.images || [], idx)}
                    style={
                      Platform.OS === 'web'
                        ? ({ cursor: 'pointer' } as any)
                        : undefined
                    }
                  >
                    <Image
                      source={{ uri: imgUri }}
                      style={styles.userImageThumb}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {/* 文本气泡 */}
            <View style={[bubbleStyle, styles.textBubbleBelowImages]}>
              {item.content ? (
                <Text
                  selectable={textSelectable}
                  style={[styles.messageText, { color: theme.bubbleUserText }]}
                >
                  {item.content}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={bubbleStyle}>
            {isThinking ? (
              <View style={styles.thinkingContainer}>
                <ActivityIndicator
                  size="small"
                  color={theme.textMuted}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[
                    styles.messageText,
                    { color: theme.textMuted, fontStyle: 'italic' },
                  ]}
                >
                  思考中...
                </Text>
              </View>
            ) : isUser ? (
              item.content ? (
                <Text
                  selectable={textSelectable}
                  style={[styles.messageText, { color: theme.bubbleUserText }]}
                >
                  {item.content}
                </Text>
              ) : null
            ) : (
              <View>
                {hasThought ? (
                  <ThoughtCollapsible thought={item.thought!} theme={theme} />
                ) : null}

                {/* 流式正文：两端统一用**段落级增量 markdown**（StreamingMarkdown）——
                    已成形的段落被 StableMarkdown memo 住，每帧只有「还在长的那一段尾巴」
                    重新解析 + 重排，所以成本是有界的；而且与结束后用的是同一套
                    markdown 渲染 + 同一套样式 ⇒
                      ① 吐字期就能看到粗体/代码块/列表/表格，不再是 `**原文**`、
                        未被识别的 ``` 围栏；
                      ② 吐字结束不再「换渲染器 + 行高 22→24」地跳高度。
                    原生端之所以过去走纯 Text，是怕「JS 线程解析 markdown + 重建节点」
                    拖慢吐字（那时还要靠贴底补帧，掉一帧就看得见）。现在 inverted 布局下
                    底部是自动的、不需要任何滚动命令，这份成本只影响吐字流畅度本身，
                    且有 memo 兜底，所以在原生上也直接渲染 markdown。 */}
                {isStreaming ? (
                  <View style={styles.streamingRow}>
                    <View style={styles.streamingBody}>
                      <StreamingMarkdown
                        content={item.content || ''}
                        style={dynamicMarkdownStyles}
                        rules={
                          // 与「结束后」保持同一套规则：风格不变、选中能力也不变
                          Platform.OS === 'web'
                            ? webMarkdownRules
                            : textSelectable
                              ? selectableMarkdownRules
                              : nonSelectableMarkdownRules
                        }
                      />
                    </View>
                    <BouncingDot color={theme.textMain} />
                  </View>
                ) : (
                  <Markdown
                    style={dynamicMarkdownStyles}
                    rules={
                      // Web：用自定义规则（含复制按钮）；原生：沿用单一可选文本树
                      Platform.OS === 'web'
                        ? webMarkdownRules
                        : textSelectable
                          ? selectableMarkdownRules
                          : nonSelectableMarkdownRules
                    }
                  >
                    {item.content || ''}
                  </Markdown>
                )}
              </View>
            )}

            {/* 复制 + 喇叭：吐字完成（ready）后才可点，之前只占位不跳动 */}
            {!isUser && hasContent && (
              <MessageActions
                content={item.content}
                messageId={item.id}
                theme={theme}
                playingMsgId={playingMsgId}
                onPlayingChange={setPlayingMsgId}
                ready={!isStreaming}
              />
            )}
          </View>
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.content === next.item.content &&
    prev.item.thought === next.item.thought &&
    prev.theme === next.theme &&
    prev.isStreaming === next.isStreaming &&
    prev.item.systemNote === next.item.systemNote &&
    prev.playingMsgId === next.playingMsgId &&
    prev.onPreviewImage === next.onPreviewImage &&
    prev.textSelectable === next.textSelectable &&
    JSON.stringify(prev.item.images) === JSON.stringify(next.item.images),
);

// ===================== ChatArea 根组件 =====================
export default function ChatArea({
  messages,
  theme,
  isMobile = false,
  isKeyboardUp = false,
  activeId,
  streamingRenderMsg = null,
  autoRead = false, // 💡 新增
  isDrawerOpen = false,
}: ChatAreaProps) {
  const {
    scrollViewRef,
    autoFollowRef,
    handleScroll: originalHandleScroll,
  } = useChat();
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  /** 「回到底部」按钮：离底 > 120px 才显示（阈值判定见下面的 handleScroll） */
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // 🧹 抽屉打开时清掉 Web 端已选中的蓝色文本选择框
  // （App 端靠 textSelectable=false 让原生选择自动收起）
  useEffect(() => {
    if (!isDrawerOpen) return;
    if (Platform.OS !== 'web') return;
    const sel = (globalThis as any).getSelection?.();
    sel?.removeAllRanges?.();
  }, [isDrawerOpen]);

  // ==================== 图片全屏预览 ====================
  const [preview, setPreview] = useState<{
    images: string[];
    index: number;
  } | null>(null);
  const openPreview = useCallback(
    (images: string[], index: number) => setPreview({ images, index }),
    [],
  );
  const closePreview = useCallback(() => setPreview(null), []);
  const changePreviewIndex = useCallback(
    (index: number) => setPreview((prev) => (prev ? { ...prev, index } : prev)),
    [],
  );

  // 💡 自动朗读相关引用
  const lastAutoReadKeyRef = useRef<string | null>(null);
  const autoPlayingRef = useRef(false);

  // 合并流式临时内容
  const displayMessages = useMemo(() => {
    const merged = !streamingRenderMsg
      ? messages
      : messages.map((msg) => {
          if (msg.id === streamingRenderMsg.msgId) {
            return {
              ...msg,
              content: streamingRenderMsg.content || msg.content,
              thought: streamingRenderMsg.thought || msg.thought,
              isStreaming: true,
            };
          }
          return msg;
        });

    // ⚠️ 原生端虽然是 inverted 列表，但**不要在这里反转数组**：
    // 本项目翻的是「ScrollView + 整个内容容器」，落到视觉底部的是**数组末尾**
    // （RN 官方 inverted FlatList 是「翻 ScrollView + 逐条翻 cell」，锚的是数组开头，
    //  所以它才要求 data 反转 —— 详见 src/utils/chatScroll.ts 顶部说明）。
    // 反转会让新旧整体颠倒：最老那条跑到屏幕最下面（真机踩过）。
    return merged;
  }, [messages, streamingRenderMsg]);

  // ==================== 两端各自的贴底策略 ====================
  // - 原生（INVERTED_CHAT_LIST === true）：inverted 列表，视觉底部 = offset 0。
  //   吐字期内容往上长，offset 保持 0 就一直在底部 → **零滚动命令、零抖动**，
  //   所以原生端的 followBottom / onContentSizeChange 都不需要再贴底（见下面各自的分支）。
  // - Web：仍是普通列表，"useLayoutEffect（DOM commit 后、paint 前同步读 scrollHeight
  //   再写 scrollTop）" 逐帧贴底，本来就是零抖动；onContentSizeChange 只做兜底
  //   （react-native-web 上它经过 measure → setTimeout(0)，晚于 paint）。

  const showWelcome =
    (!displayMessages || displayMessages.length === 0) && !isKeyboardUp;

  /** 程序化「平滑贴底」动画的保护窗口（ms） */
  const PIN_ANIM_MS = 900;
  /**
   * 平滑贴底动画进行中的截止时间戳。
   * 动画期间 onScroll 会一路报「离底还有几千像素」，那不是用户上滑，
   * 不能据此关掉 autoFollow，也不该闪出「回到底部」按钮（切长会话时尤其明显）。
   */
  const pinAnimUntilRef = useRef(0);
  /** 内容总高度（onContentSizeChange 给），切会话时用来算「视觉顶部」的 offset */
  const contentHeightRef = useRef(0);
  /** ScrollView 视口高度（外层 View 的 onLayout 给） */
  const viewportHeightRef = useRef(0);
  /** 切会话后只做一次「从最旧滑到最新」的进场动画（下一次内容尺寸变化时消费掉） */
  const pendingEntryAnimRef = useRef(false);

  /**
   * 贴底（消费级 App 的做法）：同步定位，不走动画、不排队。
   * - web：直接写 scrollTop。读 scrollHeight 会强制浏览器完成布局，
   *        所以「量」和「定」发生在同一帧的同一个任务里，paint 之前完成 → 不会看到先长后跳。
   * - native inverted：offset 0 就是视觉底部，`scrollTo({ y: 0 })` 原生自己 clamp。
   *   吐字期**根本不用走这里**（内容往上长，offset 一直是 0，天然贴底），
   *   这里只承担「进页面/切会话/点回到底部/发消息」这些低频的程序化贴底。
   */
  const pinToBottom = useCallback((animated = false) => {
    const ref: any = scrollViewRef.current;
    if (!ref) return;

    // 平滑滚动需要一段时间才到位，这段时间内忽略 onScroll 的「离底很远」
    if (animated) pinAnimUntilRef.current = Date.now() + PIN_ANIM_MS;

    if (Platform.OS === 'web') {
      const node =
        (typeof ref.getScrollableNode === 'function' &&
          ref.getScrollableNode()) ||
        (typeof ref.getInnerViewNode === 'function' &&
          ref.getInnerViewNode()) ||
        null;
      if (node) {
        if (animated) {
          // ⚠️ 不能用 node.scrollTo({ top, behavior })：
          // react-native-web 把 node.scrollTo 覆盖成了自己的 (y, x, animated) 签名
          // （ScrollView/index.js 里 `node.scrollTo = this.scrollTo`），
          // 传 { top, behavior } 会被解析成 x/y 全 undefined → 一路兜底成 { x:0, y:0 }
          // → 平滑滚到顶部。必须用它自己挂上来的 scrollToEnd（内部读 scrollHeight）。
          ref.scrollToEnd?.({ animated: true });
        } else {
          // 吐字过程中 —— 同步定位，零动画、零滞迟
          node.scrollTop = node.scrollHeight;
        }
        return;
      }
    }

    // 原生 inverted：offset 0 就是视觉底部；Web：react-native-web 的 scrollToEnd
    scrollChatToBottom(ref, animated);
  }, []);

  /**
   * 切会话/首次进入的「从最旧滑到最新」进场动画。
   *
   * 原生 inverted 下 offset 0 就是底部，进场本来没有任何滚动可做（视觉上直接到底）。
   * 为了保留以前普通列表里那段平滑进场（"切换的时候到底的动画"），这里手动演一遍：
   * 先瞬移到视觉顶部（= 最大 offset = 内容高 - 视口高），下一帧再平滑滚回 0。
   * ⚠️ 只有在拿到内容高度和视口高度时才做；否则直接放弃（宁可没有动画，也不能乱跳）。
   */
  const playEntryScroll = useCallback(() => {
    const ref: any = scrollViewRef.current;
    const maxOffset = Math.max(
      0,
      contentHeightRef.current - viewportHeightRef.current,
    );
    if (!ref || maxOffset <= 0) return;
    // 这段「离底很远」是动画本身，别让它被当成用户上滑（否则 autoFollow 会被关掉、按钮会闪）
    pinAnimUntilRef.current = Date.now() + PIN_ANIM_MS;
    ref.scrollTo?.({ x: 0, y: maxOffset, animated: false });
    requestAnimationFrame(() => {
      ref.scrollTo?.({ x: 0, y: 0, animated: true });
    });
  }, [scrollViewRef]);

  // 进页面 / 切会话 → 重置自动跟随，等内容布局完成后贴到底部。
  // - 原生 inverted：底部是自动的，只需安排一次进场动画（内容尺寸一就绪就演，见
  //   handleContentSizeChange）；
  // - Web：等内容布局完成后平滑贴底（useLayoutEffect + scrollTop 那条路）。
  useEffect(() => {
    autoFollowRef.current = true;
    if (INVERTED_CHAT_LIST) {
      pendingEntryAnimRef.current = true;
      return;
    }
    pinAnimUntilRef.current = Date.now() + PIN_ANIM_MS;
    const id = setTimeout(() => pinToBottom(true), 50);
    return () => clearTimeout(id);
  }, [activeId, pinToBottom, autoFollowRef]);

  // 原生端不再需要「把 AnimatedRef 背后的实例转交给 JS」这一步：
  // ScrollView 现在直接用普通 ref（scrollViewRef），React 会自己挂/清实例，
  // useChatManager 的 handleSend 也就能直接 scrollTo({ y: 0 })。
  const handleScroll = useCallback(
    (event: any) => {
      originalHandleScroll?.(event);

      // 程序化平滑贴底动画进行中：此时的高 distance 是动画本身，不是用户上滑
      if (Date.now() < pinAnimUntilRef.current) return;

      // 原生 inverted：离底距离 = contentOffset.y；Web：contentSize - viewport - offset
      const distanceFromBottom = chatDistanceFromBottom(event?.nativeEvent);

      // 上滑超过 120px 才显示按钮
      setShowScrollToBottom(distanceFromBottom > 120);

      // 迟滞区间 [40, 120]：远离底部才脱钩，滑回底部附近才重新跟随。
      // 这样吐字时那几十毫秒的高度误差不会误判成「用户上滑了」而突然停住。
      // ⚠️ 必须保留「重新跟随」这条分支：只置 false 不复位的话，
      //    用户碰一次列表，本轮会话的吐字就再也吸不了底。
      // ⚠️ autoFollowRef 是唯一权威值：原生 inverted 下贴底本身是自动的，
      //    它只决定「回到底部」按钮的显隐和吐字期要不要额外插手（见 followBottom）。
      if (autoFollowRef.current) {
        if (distanceFromBottom > 120) autoFollowRef.current = false;
      } else if (distanceFromBottom < 40) {
        autoFollowRef.current = true;
      }
    },
    [originalHandleScroll, autoFollowRef],
  );

  /**
   * 跟随贴底（**Web 专用**）：
   * - 吐字中（streamingRenderMsg 非空）→ 同步定位（animated=false），零动画、零滞迟。
   * - 其余时刻（进页面 / 切会话 / 消息落盘）→ 平滑动画（animated=true），保留「到底」的过渡。
   *   ⚠️ 切会话时历史消息是**异步**落盘的（handleSelectChat → getSessionDetail →
   *   setConversations 换新数组 → displayMessages 换新引用），这里若用同步定位，
   *   会把进场那段平滑滚动直接掐断成瞬移 —— 表现就是「切换的时候到底的动画没有了」。
   *
   * 原生端在 inverted 布局下**不需要任何跟随贴底**：视觉底部就是 offset 0，
   * 内容长高时 offset 不动就等于一直贴在底部（这正是零抖动的来源），
   * 所以这里直接返回；原生端的贴底只发生在「进页面/切会话/点回到底部/发消息」
   * 这些低频路径上（见 pinToBottom / playEntryScroll）。
   */
  const followBottom = useCallback(() => {
    if (INVERTED_CHAT_LIST) return;
    if (!autoFollowRef.current) return;
    if (streamingRenderMsg) {
      pinToBottom(false);
      return;
    }
    pinToBottom(true);
  }, [pinToBottom, streamingRenderMsg, autoFollowRef]);

  // 吐字期/新消息：自动吸底（用户未上滑时）—— **仅 Web**。
  // （原生 inverted 下 followBottom 第一行就 return：内容是往上长的，贴底不需要动作。）
  //
  // ⚠️ 必须是 layout effect（DOM commit 之后、浏览器 paint 之前同步执行）：
  //   - 在这里读 scrollHeight 会顺带完成本次 DOM 变更的布局（浏览器这一帧本来也要算，
  //     只是被提前到 paint 之前），紧接着写 scrollTop，于是这一帧画出来的就是
  //     「已经贴底」的状态，看不到先长高再滚一下；
  //   - 换成 useEffect（paint 之后）就变成「先把长高的内容画出来，再滚一下」，
  //     吐字 60fps 下每帧都这样 → 肉眼看到的就是底部忽上忽下。
  //   - onContentSizeChange 也救不了：react-native-web 的实现走
  //     UIManager.measure → setTimeout(0)（见 node_modules/react-native-web/dist/
  //     exports/UIManager/index.js 的 measureLayout），回调落在下一个宏任务里，
  //     同样晚于 paint。所以它现在只当兜底（见下面 ScrollView 上的回调）。
  useIsomorphicLayoutEffect(() => {
    followBottom();
  }, [displayMessages, followBottom]);

  // 关掉浏览器的「滚动锚定」：它会和逐帧写 scrollTop 互相抢，表现为贴底后又自己弹一下。
  // RNW 的样式表透传不到这个属性，直接写 DOM（此时 ref 已在本轮 commit 里挂好）。
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const ref: any = scrollViewRef.current;
    const node =
      (ref && typeof ref.getScrollableNode === 'function'
        ? ref.getScrollableNode()
        : null) || null;
    if (node && node.style) node.style.overflowAnchor = 'none';
  }, []);

  // 用户手指一碰上去 → 立即取消自动跟随（两端一致：原生也走 JS 的 onScrollBeginDrag）
  const handleScrollBeginDrag = useCallback(() => {
    autoFollowRef.current = false;
  }, [autoFollowRef]);

  // 点「回到底部」→ 重新开启自动跟随 + 平滑贴底
  const handleScrollToBottom = useCallback(() => {
    autoFollowRef.current = true;
    setShowScrollToBottom(false);
    // pinToBottom(animated=true) 内部会开「动画保护窗口」（pinAnimUntilRef）
    pinToBottom(true);
  }, [pinToBottom, autoFollowRef]);

  /**
   * onContentSizeChange：内容尺寸变化（图片/字体加载、思考框折叠、吐字换行…）。
   *
   * - 原生（inverted）：内容长高时 offset 保持 0 就已经贴在底部，**不需要任何滚动命令**，
   *   这里只做两件与贴底无关的事：记录内容高度（进场动画要用），以及消费一次
   *   「切会话后的进场动画」。吐字期一条迟到命令都没有 —— 抖动被结构性地删掉了。
   * - Web（普通列表）：保持原兜底逻辑。⚠️ 它在 react-native-web 上经过
   *   UIManager.measure → setTimeout(0)，落在下一个宏任务里、晚于 paint，
   *   所以只当兜底（主路径是上面的 useLayoutEffect + scrollTop）。
   */
  const handleContentSizeChange = useCallback(
    (_width?: number, height?: number) => {
      if (typeof height === 'number' && height > 0) {
        contentHeightRef.current = height;
      }

      if (INVERTED_CHAT_LIST) {
        // 进场动画：等新会话的内容高度就绪后再演一次（每次切会话只演一次）
        if (pendingEntryAnimRef.current) {
          pendingEntryAnimRef.current = false;
          playEntryScroll();
        }
        return;
      }

      if (!autoFollowRef.current) return;
      // 程序化平滑贴底动画在途：此时的高 distance 是动画本身，插手会把它掐成瞬移
      if (Date.now() < pinAnimUntilRef.current) return;

      const ref: any = scrollViewRef.current;
      const node =
        ref && typeof ref.getScrollableNode === 'function'
          ? ref.getScrollableNode()
          : null;
      if (
        node &&
        typeof node.scrollTop === 'number' &&
        node.scrollHeight - node.clientHeight - node.scrollTop <= 1
      ) {
        return; // 已经在底部，什么都不用做
      }
      pinToBottom(false);
    },
    [pinToBottom, autoFollowRef, scrollViewRef, playEntryScroll],
  );

  /**
   * 两端共用同一份 children / 同一套 JS 事件：
   * - 原生：inverted 列表 —— ScrollView 与**整个内容容器**各翻一次，两次镜像互相抵消：
   *   文字方向、条目上下顺序、内边距位置全部保持原样，**唯一的变化是滚动原点**：
   *   offset 0 从「内容开头」变成「内容末尾」。于是
   *   ① 吐字期 offset 恒为 0 就一直在底部 → 不需要任何滚动命令；
   *   ② 数组**保持自然顺序**（最旧 → 最新），落在视觉底部的是数组末尾那条
   *      （⚠️ 不要照抄官方 inverted FlatList 的「反转 data」，见 utils/chatScroll.ts）。
   * - Web：普通 ScrollView，贴底仍走 useLayoutEffect + scrollTop（压根不翻转）。
   */
  const scrollViewProps: Record<string, any> = {
    onScroll: handleScroll,
    onScrollBeginDrag: handleScrollBeginDrag,
    scrollEventThrottle: 32,
    onContentSizeChange: handleContentSizeChange,
    // 原生端吐字时用不到贴底，但滚动手感保持原样
    ...(INVERTED_CHAT_LIST ? { decelerationRate: 'fast' } : null),
  };
  const scrollViewStyle: any = [
    // 翻转 1/2：ScrollView 自身
    INVERTED_CHAT_LIST ? CHAT_INVERSION_STYLE : null,
    // RNW 才认这两个滚动条样式
    Platform.OS === 'web'
      ? {
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.3) transparent',
        }
      : null,
  ];

  return (
    <View
      style={{ flex: 1 }}
      // 视口高度：切会话的进场动画要用它算「视觉顶部」的 offset。
      // （这里的 onLayout 是 JS 函数，Fabric 会正常发射；之前那个 worklet 版的
      //   onLayout 才是发不出来的那个 —— 见文件头注释。）
      onLayout={(e) => {
        viewportHeightRef.current = e.nativeEvent.layout.height;
      }}
    >
      <ScrollView
        ref={scrollViewRef}
        {...scrollViewProps}
        style={scrollViewStyle}
        contentContainerStyle={[
          styles.scrollContent,
          // 翻转 2/2：内容容器（与上面那次抵消；内边距/顺序都不受影响，不要额外调整 padding）
          INVERTED_CHAT_LIST ? CHAT_INVERSION_STYLE : null,
        ]}
        alwaysBounceVertical={false}
        nativeID="chat-scroll"
      >
        {showWelcome ? (
          <View
            style={[
              styles.emptyContainer,
              { height: viewportHeightRef.current || 400 },
            ]}
          >
            <Text style={styles.welcomeEmoji}>👋</Text>
            <Text style={[styles.welcomeTitle, { color: theme.textMain }]}>
              你好，欢迎使用 AI 智能体
            </Text>
            <Text style={[styles.welcomeSubtitle, { color: theme.textMuted }]}>
              今天有什么想聊的？
            </Text>
          </View>
        ) : (
          displayMessages.map((msg) => (
            <ChatMessageItem
              key={msg.id}
              item={msg}
              theme={theme}
              isMobile={isMobile}
              isStreaming={!!msg.isStreaming}
              playingMsgId={playingMsgId}
              setPlayingMsgId={setPlayingMsgId}
              onPreviewImage={openPreview}
              textSelectable={!isDrawerOpen}
            />
          ))
        )}
      </ScrollView>

      {/* ✅ 悬浮「回到底部」按钮：上滑超过一定距离才显示 */}
      {showScrollToBottom && (
        <TouchableOpacity
          onPress={handleScrollToBottom}
          activeOpacity={0.8}
          style={[
            styles.scrollToBottomBtn,
            {
              backgroundColor: theme.isDark
                ? 'rgba(40,40,40,0.92)'
                : 'rgba(255,255,255,0.95)',
              borderColor: theme.border,
              shadowColor: '#000',
            },
          ]}
        >
          <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 5v14M19 12l-7 7-7-7"
              stroke={theme.textMain}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>
      )}

      {/* 点气泡里的图片 → 全屏预览 */}
      <ImageViewer
        visible={preview !== null}
        images={preview?.images ?? []}
        index={preview?.index ?? 0}
        onClose={closePreview}
        onIndexChange={changePreviewIndex}
      />
    </View>
  );
}

// ===================== StyleSheet =====================
const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  welcomeEmoji: {
    fontSize: 42,
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  streamingRow: { flexDirection: 'row', alignItems: 'center' },
  /**
   * 流式正文容器：作为 flex item 收缩到可用宽度（气泡宽度只随内容增长、不会来回变），
   * minHeight 与单行正文对齐，避免「只有一个跳动的点」那一刻高度从 22 掉到 16。
   */
  streamingBody: { flexShrink: 1, minHeight: 22 },
  /** 原生流式正文：行高与 markdown body 的 24 对齐，吐字结束不再跳一行 */
  streamingText: { fontSize: 15, lineHeight: 24 },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  bubble: { padding: 14, borderRadius: 16 },
  bubbleUser: { borderTopRightRadius: 4 },
  bubbleAi: { borderTopLeftRadius: 4, borderWidth: 1 },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  userImagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  userImageThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  imageBubble: {
    marginBottom: 4,
    alignSelf: 'flex-end',
  },
  userImagesColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  textBubbleBelowImages: {
    marginTop: 4,
  },
  systemNoteRow: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 6,
  },
  systemNoteText: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    opacity: 0.6,
  },
  thoughtBox: {
    borderLeftWidth: 0,
    borderLeftColor: '#4b92ee',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
    borderRadius: 4,
  },
  thoughtRightAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thoughtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  thoughtTitle: {
    fontSize: 12,
    fontWeight: '600',
    paddingRight: 2,
  },
  thoughtContent: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  thoughtScroll: {
    overflowY: 'scroll',
    overflowX: 'hidden',
  } as any,
  bouncingDot: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  scrollToBottomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
