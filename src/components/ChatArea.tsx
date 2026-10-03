import React, {
  memo,
  useEffect,
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
import Svg, { Path } from 'react-native-svg';
import Markdown from 'react-native-markdown-display';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import MessageActions from './MessageActions';
import { useChat } from '../../app/_layout';
import { playText, stopSpeech } from '../services/speechPlayer';
import { api } from '../services/api';

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

    const toggleOpen = () => {
      const nextState = !isOpen;
      setIsOpen(nextState);
      progress.value = withTiming(nextState ? 1 : 0, {
        duration: 250,
        easing: Easing.bezier(0.25, 0.1, 0.5, 1),
      });
    };

    const bodyAnimatedStyle = useAnimatedStyle(() => ({
      opacity: progress.value,
      transform: [{ translateY: (1 - progress.value) * -8 }],
      maxHeight: progress.value * 600,
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
          <Text
            style={[
              styles.thoughtContent,
              { color: theme.textMuted, marginTop: 4 },
            ]}
          >
            {thought}
          </Text>
        </Animated.View>
      </View>
    );
  },
  (prev, next) => prev.thought === next.thought && prev.theme === next.theme,
);

// ===================== MessageActions（复制 + 喇叭） =====================
// 见 ./MessageActions.tsx：抽成独立组件，行高固定，吐字完成前后布局不变

// ===================== ChatMessageItem =====================
const ChatMessageItem = memo(
  ({
    item,
    theme,
    isMobile,
    isStreaming,
    playingMsgId,
    setPlayingMsgId,
  }: {
    item: Message;
    theme: ThemeType;
    isMobile: boolean;
    isStreaming?: boolean;
    playingMsgId: string | null;
    setPlayingMsgId: (id: string | null) => void;
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
        body: { fontSize: 15, lineHeight: 22, color: theme.textMain },
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
          backgroundColor: theme.isDark
            ? 'rgba(255,255,255,0.1)'
            : 'rgba(0,0,0,0.06)',
          color: theme.textMain,
          borderRadius: 4,
          paddingHorizontal: 4,
          paddingVertical: 2,
          fontSize: 14,
        },
        fence: {
          backgroundColor: theme.isDark ? '#000' : '#eee',
          color: theme.isDark ? '#d4d4d4' : '#333333',
          borderRadius: 8,
          padding: 12,
          marginVertical: 6,
          borderWidth: 1,
          borderColor: theme.border,
          fontFamily: 'JetBrains Mono',
        },
        code_block: {
          backgroundColor: theme.isDark ? '#1e1e1e' : '#f5f5f5',
          color: theme.isDark ? '#d4d4d4' : '#333333',
          borderRadius: 8,
          padding: 12,
          marginVertical: 6,
        },
        blockquote: {
          backgroundColor: theme.isDark
            ? 'rgba(255, 255, 255, 0.05)'
            : 'rgba(0, 0, 0, 0.04)',
          borderLeftColor: theme.isDark ? '#3b82f6' : '#2563eb',
          borderLeftWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 4,
          marginVertical: 6,
        },
        list_item: { color: theme.textMain, marginVertical: 2 },
        table: {
          marginVertical: 10,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 6,
        },
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
      <View style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAi]}>
        {isUser && item.images && item.images.length > 0 ? (
          <View style={styles.userImagesColumn}>
            {/* 图片气泡（独占一行，位于文本上方） */}
            <View style={[bubbleStyle, styles.imageBubble]}>
              <View style={styles.userImagesContainer}>
                {item.images.map((imgUri, idx) => (
                  <Image
                    key={idx}
                    source={{ uri: imgUri }}
                    style={styles.userImageThumb}
                  />
                ))}
              </View>
            </View>
            {/* 文本气泡 */}
            <View style={[bubbleStyle, styles.textBubbleBelowImages]}>
              {item.content ? (
                <Text style={[styles.messageText, { color: theme.bubbleUserText }]}>
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
                  style={[
                    styles.messageText,
                    { color: theme.bubbleUserText },
                  ]}
                >
                  {item.content}
                </Text>
              ) : null
            ) : (
              <View>
                {hasThought ? (
                  <ThoughtCollapsible thought={item.thought!} theme={theme} />
                ) : null}

                {/* 核心优化：流式中用纯 Text（渲染成本低、行高与 Markdown 对齐，
                    结束后切 Markdown 时气泡高度不跳变） */}
                {isStreaming ? (
                  <Text
                    style={{
                      fontSize: 15,
                      lineHeight: 22,
                      color: theme.textMain,
                    }}
                  >
                    {item.content}
                  </Text>
                ) : (
                  <Markdown style={dynamicMarkdownStyles}>
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
}: ChatAreaProps) {
  const {
    handleScroll: originalHandleScroll,
    scrollViewRef,
    autoFollowRef,
  } = useChat();
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  // ✅ 用 state 控制「回到底部」按钮显示
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // 💡 自动朗读相关引用
  const lastAutoReadKeyRef = useRef<string | null>(null);
  const autoPlayingRef = useRef(false);

  // 合并流式临时内容
  const displayMessages = useMemo(() => {
    if (!streamingRenderMsg) return messages;

    return messages.map((msg) => {
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
  }, [messages, streamingRenderMsg]);

  // ==================== 贴底引擎 ====================
  const lastMsgCountRef = useRef(displayMessages.length);
  const lastMsgArrayRef = useRef(displayMessages);

  /**
   * 贴底（消费级 App 的做法）：同步定位，不走动画、不排队。
   * - web：直接写 scrollTop。读 scrollHeight 会强制浏览器完成布局，
   *        所以「量」和「定」发生在同一帧的同一个任务里，paint 之前完成 → 不会看到先长后跳。
   * - native：scrollToEnd(animated)，在同一帧的布局阶段处理。
   */
  const pinToBottom = useCallback((animated = false) => {
    const ref: any = scrollViewRef.current;
    if (!ref) return;

    if (Platform.OS === 'web') {
      const node =
        (typeof ref.getScrollableNode === 'function' &&
          ref.getScrollableNode()) ||
        (typeof ref.getInnerViewNode === 'function' &&
          ref.getInnerViewNode()) ||
        null;
      if (node) {
        if (animated) {
          // 进入页面 / 切会话 —— 顺滑滚动到底部
          node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
        } else {
          // 吐字过程中 —— 同步定位，零动画、零滞迟
          node.scrollTop = node.scrollHeight;
        }
        return;
      }
    }

    ref.scrollToEnd?.({ animated });
  }, []);

  /**
   * 贴底 —— 靠 ScrollView 的 onContentSizeChange（react-native-web 用
   * ResizeObserver 驱动）负责：它在浏览器完成本次布局之后、paint 之前触发，
   * 所以 scrollTop 写在那一刻已是布局缓存命中（免一次强制 reflow），
   * 既保证同帧不抖动、又不用每帧强刷一次布局（那会卡住主线程）。
   *
   * 留在这里的 useLayoutEffect 早已删除——它每 render 都读 scrollHeight，
   * 而此时浏览器尚未布局，于是强制一次同步 reflow → 60 次/秒主线程堵塞，
   * 正是「吐字偶尔卡住」的根因。
   */

  // 滚动处理：计算是否离开底部一定距离
  const handleScroll = useCallback(
    (event: any) => {
      originalHandleScroll?.(event);

      const { layoutMeasurement, contentOffset, contentSize } =
        event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;

      // 上滑超过 120px 才显示按钮
      setShowScrollToBottom(distanceFromBottom > 120);

      // 迟滞区间 [40, 120]：远离底部才脱钩，滑回底部附近才重新跟随。
      // 这样吐字时那几十毫秒的高度误差不会误判成「用户上滑了」而突然停住。
      if (autoFollowRef.current) {
        if (distanceFromBottom > 120) autoFollowRef.current = false;
      } else if (distanceFromBottom < 40) {
        autoFollowRef.current = true;
      }
    },
    [originalHandleScroll],
  );

  // ✅ 用户手指一碰上去：立即取消自动跟随
  const handleScrollBeginDrag = useCallback(() => {
    autoFollowRef.current = false;
  }, []);

  // 💡 自动朗读：最新一条 AI 回复流式结束后播放
  useEffect(() => {
    if (!autoRead) return;
    const last = displayMessages[displayMessages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (last.isStreaming || !last.content || last.content === '...') return;

    const key = `${activeId}:${last.id}`; // 带会话 ID，切会话不会误触发
    if (lastAutoReadKeyRef.current === key) return;
    lastAutoReadKeyRef.current = key;
    autoPlayingRef.current = true;
    (async () => {
      try {
        setPlayingMsgId(last.id);
        await playText(last.content, {
          fetchUrl: async (sentence) => {
            const data = await api.textToSpeech(sentence, 'Nini');
            return data.url;
          },
          onEnd: () => {
            autoPlayingRef.current = false;
            setPlayingMsgId(null);
          },
        });
      } catch (e) {
        console.error('自动朗读失败:', e);
        autoPlayingRef.current = false;
        setPlayingMsgId(null);
      }
    })();
  }, [displayMessages, autoRead, activeId]);

  // 💡 播放中关闭自动朗读开关 → 停止自动播放（手动播放不受影响）
  useEffect(() => {
    if (!autoRead && autoPlayingRef.current) {
      autoPlayingRef.current = false;
      stopSpeech();
      setPlayingMsgId(null);
    }
  }, [autoRead]);

  // 💡 离开聊天页时停止播放
  useEffect(() => () => stopSpeech(), []);

  /**
   * 贴底：
   * 1) 初次挂载 / 切会话（key=activeId 变化 → 全量重新挂载）后，
   *    顺滑滚动到底部 —— 这就是「进入/切会话贴到底」。
   *    刚进页面用户没滚动过，故不用 autoFollowRef 守卫。
   *    吐字/收到实时消息的贴底靠下面的 useLayoutEffect + 数组-effect
   *    （那些是无动画的，因为要跟每一帧吐字同步）。
   */
  useEffect(() => {
    lastMsgCountRef.current = displayMessages.length;
    lastMsgArrayRef.current = displayMessages;
    autoFollowRef.current = true;

    // 初次挂载时 ScrollView 的内容可能尚未布局完成，延迟 2 帧确保滚动生效
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pinToBottom(true);
      });
    });
  }, [activeId, pinToBottom]);

  /**
   * 2) 后续异步消息落盘 / 用户撤回 —— 守卫 autoFollow（用户曾经上滑就不推）。
   *    吐字期间条数不变（消息体已在 `messages` 里），所以这里不会误触发。
   */
  useEffect(() => {
    if (displayMessages === lastMsgArrayRef.current) return;
    lastMsgArrayRef.current = displayMessages;
    if (displayMessages.length !== lastMsgCountRef.current) {
      lastMsgCountRef.current = displayMessages.length;
    }
    if (autoFollowRef.current) {
      pinToBottom();
    }
  }, [displayMessages, pinToBottom]);

  const showWelcome =
    (!displayMessages || displayMessages.length === 0) && !isKeyboardUp;

  // 点击回到底部
  const handleScrollToBottom = () => {
    autoFollowRef.current = true;
    setShowScrollToBottom(false);
    pinToBottom(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollViewRef}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        scrollEventThrottle={32}
        onContentSizeChange={() => {
          if (!autoFollowRef.current) return;
          // 幂等：已经在底部时 scrollTop 不变，不会和 useLayoutEffect 打架；
          // native 布局是异步的，这一层用来兜住 useLayoutEffect 之后的那次布局提交
          pinToBottom();
        }}
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical={false}
        nativeID="chat-scroll"
        style={
          Platform.OS === 'web'
            ? ({
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255,255,255,0.3) transparent',
              } as any)
            : undefined
        }
      >
        {showWelcome ? (
          <View style={styles.emptyContainer}>
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
            />
          ))
        )}

        <View style={{ height: 1 }} />
      </ScrollView>

      {/* ✅ 悬浮「回到底部」按钮：上滑超过一定距离才显示，用图标 */}
      {/* 悬浮回到底部按钮 - 水平居中 */}
      {showScrollToBottom && (
        <View style={styles.scrollToBottomWrapper} pointerEvents="box-none">
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
        </View>
      )}
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 240,
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
  scrollToBottomWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: 'center',
    zIndex: 10,
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
  },
});
