import React, { useEffect, useRef, useState } from 'react';
import { Text, View, Platform } from 'react-native';
import { HoverTouchable } from '../HoverTouchable';
import * as Clipboard from 'expo-clipboard';
import {
  renderRules,
  RenderRules,
  hasParents,
} from 'react-native-markdown-display';
import { IconCheck, IconCopy } from '../Icons';
import { MyToast } from '../GlobalToast';

// ===================== Markdown 渲染规则 =====================
// 策略（混合文本树）：纯文本块仍合并成同一棵可选 <Text> 树 —— 原生端保留
// 跨段落、跨列表项的连续拖选复制；但 <View>（代码块/分割线）绝不能进入任何
// <Text> —— release 实测，Text 里嵌 View 在 Fabric 下会重叠、气泡底部会撑
// 出大片空白。两道防线：
//   ① body：渲染结果是 <View> 的节点（含回退成 View 的列表/引用）从文本
//      run 里切出来当兄弟节点；
//   ② 列表/引用：AST 递归发现子树含 fence/code_block/hr 时整体回退 View
//      盒子（见 subtreeHasViewBlock），保证 View 永远不落在 Text 内部。
// 纯文本消息不走任何回退，选区行为与之前完全一致；含代码块的消息选区在
// View 边界处断开（系统选区本就跨不过 View），整条复制走气泡下复制按钮。
// （Web 端浏览器原生选择天然跨段，不受影响。）
// selectable=false 时（例如抽屉打开，防止误触）关闭选择，顺带清掉已有的蓝色选择框。
// 等宽字体：项目未内置 JetBrains Mono，直接用各端系统等宽字体，避免代码块回退成普通字体
export const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

// 复制代码到剪贴板并提示
const copyCodeToClipboard = async (code: string) => {
  await Clipboard.setStringAsync(code);
};

export const CodeCopyButton = ({
  code,
  styles,
}: {
  code: string;
  styles: Record<string, any>;
}) => {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await copyCodeToClipboard(code);
      setCopied(true);
      MyToast.show('已复制到剪贴板');
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('复制代码失败:', error);
      MyToast.show('复制失败，请稍后重试');
    }
  };

  return (
    <View
      style={[
        styles.codeCopyBtn,
        (hovered || copied) && styles.codeCopyBtnActive,
      ]}
      {...({
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
      } as any)}
    >
      <HoverTouchable
        onPress={copy}
        hoverBg="transparent"
        style={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        accessibilityRole="button"
        accessibilityLabel={copied ? '已复制代码' : '复制代码'}
      >
        {copied ? (
          <IconCheck size={14} color={styles.codeCopyIcon.color} />
        ) : (
          <IconCopy size={14} color={styles.codeCopyIcon.color} />
        )}
      </HoverTouchable>
      {hovered && (
        <View style={styles.codeCopyTooltip}>
          <Text style={styles.codeCopyTooltipText}>
            {copied ? '已复制' : '复制代码'}
          </Text>
        </View>
      )}
    </View>
  );
};

// AST 递归：该子树里是否含会被渲染成 <View> 的块（fence/code_block/hr）。
// 有 —— 列表/引用必须整体回退 View 盒子（Text 绝不能嵌 View，release
// Fabric 下会重叠、撑出空白）；没有 —— 保持 Text，维持跨段落可选。
const subtreeHasViewBlock = (node: any): boolean => {
  if (!node || !Array.isArray(node.children)) return false;
  return node.children.some(
    (child: any) =>
      child?.type === 'fence' ||
      child?.type === 'code_block' ||
      child?.type === 'hr' ||
      subtreeHasViewBlock(child),
  );
};

// 列表回退 View 时的行布局：序号一列 + 内容一列。
// marginVertical 对齐 Text 模式 list_item 的 2，避免切换模式时间距变化。
const LIST_ROW_STYLE = {
  flexDirection: 'row' as const,
  alignItems: 'flex-start' as const,
  marginVertical: 2,
};
// 序号列：字号/行高与正文（body 15/24）对齐，防止首行错位；
// marginVertical 归零（行容器已给），flexShrink 防止长序号被压缩。
const LIST_MARKER_STYLE = {
  flexShrink: 0,
  marginVertical: 0,
  marginRight: 4,
  fontSize: 15,
  lineHeight: 24,
};
const LIST_CONTENT_STYLE = { flex: 1 };
// 引用块回退 View 时去掉 web 专属的 display/verticalAlign（原生 View 上传非法值）
const BLOCKQUOTE_VIEW_FIX = {
  display: undefined,
  verticalAlign: undefined,
} as any;

export const createMarkdownRules = (selectable: boolean): RenderRules => ({
  ...renderRules,
  // 根容器：把「连续的文本块」合并进同一个可选文本树（原生保证跨段选择）；
  // 代码块与水平线单独抽成 View 盒子 —— 原生 Text 内不能嵌 View，抽出来后
  // 代码块才有 web 同款的圆角/内边距/背景块样式（见 codeBox / codeText），
  // 分割线也才是真 1px 线而不是用全角字符硬凑。
  body: (node, children, _parent, styles) => {
    // View 块必须从文本 run 里切出来当兄弟节点，否则出现「Text 里嵌 View」
    // —— Fabric / release 下布局直接坏（代码框叠字、气泡底部撑空白）。
    // 判据用「渲染后的元素是 <View>」而不是 AST 类型：fence/hr/code_block
    // 以及回退成 View 的列表/引用全都能被识别（只查 AST 类型会漏掉后者）。
    const blocks: React.ReactNode[] = [];
    let run: React.ReactNode[] = [];
    let runKey = 0;
    const flushRun = () => {
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
    };
    (children || []).forEach((el: any) => {
      if (el && el.type === View) {
        flushRun();
        blocks.push(el);
      } else {
        run.push(el);
      }
    });
    flushRun();
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
  // 引用块：子树含代码块/分割线 → 整体回退 View 盒子（View 不能进 Text）；
  // 纯文本引用保持 Text，与前后段落连成同一棵可选文本树。
  blockquote: (node, children, _parent, styles) =>
    subtreeHasViewBlock(node) ? (
      <View key={node.key} style={[styles.blockquote, BLOCKQUOTE_VIEW_FIX]}>
        {children}
      </View>
    ) : (
      <Text key={node.key} selectable={selectable} style={styles.blockquote}>
        {children}
      </Text>
    ),
  // 列表：纯文本列表保持 Text —— 符号与内容同在一棵可选文本树里，跨列表项
  // 连续拖选；子树含 View 块（代码块/分割线）时整个列表回退 View 盒子。
  bullet_list: (node, children, _parent, styles) =>
    subtreeHasViewBlock(node) ? (
      <View key={node.key}>{children}</View>
    ) : (
      <Text key={node.key} selectable={selectable} style={styles.bullet_list}>
        {node.index > 0 ? '\n' : null}
        {children}
      </Text>
    ),
  ordered_list: (node, children, _parent, styles) =>
    subtreeHasViewBlock(node) ? (
      <View key={node.key}>{children}</View>
    ) : (
      <Text key={node.key} selectable={selectable} style={styles.ordered_list}>
        {node.index > 0 ? '\n' : null}
        {children}
      </Text>
    ),
  list_item: (node, children, parent, styles) => {
    // 模式跟随整棵列表（而不是单个条目）：同一列表内所有条目排版一致。
    const listAncestor = (parent as any)?.find?.(
      (p: any) => p.type === 'bullet_list' || p.type === 'ordered_list',
    );
    const inViewMode = listAncestor
      ? subtreeHasViewBlock(listAncestor)
      : subtreeHasViewBlock(node);
    const isBullet = hasParents(parent, 'bullet_list');
    if (inViewMode) {
      // View 行：序号一列 + 内容一列；内容里段落是 Text、代码块是 View，
      // 都是这个容器的合法子节点（View 不再落进任何 Text）。
      return (
        <View key={node.key} style={LIST_ROW_STYLE}>
          <Text
            selectable={selectable}
            style={[styles.list_item, LIST_MARKER_STYLE]}
          >
            {isBullet ? '• ' : `${node.index + 1}. `}
          </Text>
          <View style={LIST_CONTENT_STYLE}>{children}</View>
        </View>
      );
    }
    return (
      <Text key={node.key} selectable={selectable} style={styles.list_item}>
        {node.index > 0 ? '\n' : null}
        {isBullet ? '• ' : `${node.index + 1}. `}
        {children}
      </Text>
    );
  },
  // 水平线：真 View 分割线（与 Web 端库默认规则同款）。
  // 曾经用固定个数的全角字符 ― 硬凑：字符宽度随平台字体变，安卓上会超出
  // 气泡宽度折成两行；且给的是 View 样式（height:1）却套在 Text 上。
  // 现在由上面的 body 规则把 hr 从文本 run 里切出来当兄弟节点，
  // 不会出现「Text 里嵌 View」，可以安全地用 View。
  hr: (node, _children, _parent, styles) => (
    <View key={node.key} style={[styles.hr, { width: '100%' }]} />
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
  // blocklink（链接包图片）库默认规则是 View —— 它出现在行内上下文里，
  // 必须用 Text 兜底，否则又把 View 塞进文本树（图片已被 image 规则转占位文本）。
  blocklink: (node, children, _parent, styles) => (
    <Text key={node.key} selectable={selectable} style={styles.blocklink}>
      {children}
    </Text>
  ),
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
        <CodeCopyButton code={content} styles={styles} />
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
        <CodeCopyButton code={content} styles={styles} />
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
export const selectableMarkdownRules = createMarkdownRules(true);
export const nonSelectableMarkdownRules = createMarkdownRules(false);

// Web 专用规则：在默认规则基础上给 fence/code_block 加上右上角复制按钮
// 默认规则把 fence/code_block 渲染成 Text，这里把它们包在 View 里加按钮
export const webMarkdownRules: RenderRules = {
  ...renderRules,
  fence: (node, children, parent, styles) => {
    let { content } = node;
    if (typeof content === 'string' && content.endsWith('\n')) {
      content = content.substring(0, content.length - 1);
    }
    return (
      <View key={node.key} style={styles.codeBox}>
        <CodeCopyButton code={content} styles={styles} />
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
        <CodeCopyButton code={content} styles={styles} />
        <Text style={[inheritedStyles, styles.code_block]}>{content}</Text>
      </View>
    );
  },
};
