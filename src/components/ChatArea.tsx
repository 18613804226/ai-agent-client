import React, { memo, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path, Rect } from 'react-native-svg';
import Markdown from 'react-native-markdown-display';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { MyToast } from './GlobalToast';
import * as Speech from 'expo-speech';
interface ChatAreaProps {
  messages: any[];
  scrollViewRef: React.RefObject<ScrollView>;
  theme: any;
  isMobile?: boolean;
  isKeyboardUp?: boolean;
}

// 深度思考折叠组件
function ThoughtCollapsible({
  thought,
  theme,
}: {
  thought: string;
  theme: any;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const progress = useSharedValue(1);

  const toggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    progress.value = withTiming(nextState ? 1 : 0, {
      duration: 250,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
  };

  const bodyAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
      transform: [
        {
          translateY: (1 - progress.value) * -8,
        },
      ],
      maxHeight: progress.value * 600,
      overflow: 'hidden' as const,
    };
  });

  const arrowAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${progress.value * 180}deg` }],
    };
  });

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
}

// 💡 修正后的 CopyButton：把 hover 事件放在外层的 View 上，完美绕过 TouchableOpacity 的 TS 类型限制
// 💡 完美且无需 runOnJS 的 CopyButton 组件
function CopyButton({ content, theme }: { content: string; theme: any }) {
  const [isHovered, setIsHovered] = useState(false);
  const tooltipProgress = useSharedValue(0);

  // 监听 hover 状态变化，丝滑驱动显隐动画
  useEffect(() => {
    if (isHovered) {
      tooltipProgress.value = withTiming(1, {
        duration: 150,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      });
    } else {
      tooltipProgress.value = withTiming(0, {
        duration: 120,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      });
    }
  }, [isHovered]);

  // const tooltipAnimatedStyle = useAnimatedStyle(() => {
  //   return {
  //     opacity: tooltipProgress.value,
  //     transform: [
  //       { translateY: (1 - tooltipProgress.value) * 4 }, // 微妙的上浮下沉
  //       { scale: 0.92 + tooltipProgress.value * 0.08 },
  //     ],
  //     // 动画完全消失时自动关闭 pointerEvents，防止不可见时阻挡鼠标
  //     pointerEvents:
  //       tooltipProgress.value === 0 ? ('none' as const) : ('auto' as const),
  //   };
  // });

  const handleCopy = async () => {
    await Clipboard.setStringAsync(content);
    // Toast.show('已复制到剪贴板', {
    //   duration: Toast.durations.SHORT,
    //   position: Toast.positions.BOTTOM,
    //   shadow: true,
    //   animation: true,
    //   hideOnPress: true,
    //   delay: 0,
    //   containerStyle: {
    //     marginBottom: 140,
    //     zIndex: 999999, // 💡 强制把 Toast 的层级拉到最高
    //     elevation: 999,   // 针对 Android 的绝对高度
    //   },
    // });
    MyToast.show('已复制到剪贴板');
  };

  return (
    <View
      style={styles.copyBtnWrapper}
      {...({
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      } as any)}
    >
      <TouchableOpacity
        style={[
          styles.copyIconBtn,
          isHovered && {
            backgroundColor: theme.isDark
              ? 'rgba(255, 255, 255, 0.15)'
              : 'rgba(0, 0, 0, 0.1)',
          },
        ]}
        onPress={handleCopy}
        accessibilityLabel="复制代码"
      >
        <Svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <Rect
            x="9"
            y="9"
            width="13"
            height="13"
            rx="2"
            stroke={theme.textMuted}
            strokeWidth="2"
          />
          <Rect
            x="2"
            y="2"
            width="13"
            height="13"
            rx="2"
            stroke={theme.textMuted}
            strokeWidth="2"
            fill={theme.bubbleAiBg}
          />
        </Svg>
      </TouchableOpacity>

      {/* 💡 动画提示框 */}
      {/* <Animated.View
        style={[
          styles.tooltipBox,
          {
            backgroundColor: theme.isDark ? '#eee' : '#eee',
          },
          tooltipAnimatedStyle,
        ]}
      >
        <Text style={styles.tooltipText}>复制代码</Text>
      </Animated.View> */}
    </View>
  );
}

// 静止状态喇叭图标 (SVG)
const IconSpeaker = ({ color }: { color: string }) => (
  <Svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07" />
  </Svg>
);
// 🔇 静止/禁用状态的斜杠喇叭图标 (SVG)
const IconMuteSpeaker = ({ color }: { color: string }) => (
  <Svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* 喇叭主体 */}
    <Path d="M11 5L6 9H2v6h4l5 4V5z" />
    {/* 斜杠符号 */}
    <Path d="M23 9l-6 6M17 9l6 6" />
  </Svg>
);
// 播放状态喇叭图标 (SVG - 示例，旁边加了三道声波)
const IconPlaying = ({ color }: { color: string }) => (
  <Svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14M17.32 6.68a7.5 7.5 0 0 1 0 10.6" />
  </Svg>
);

// --- 主组件 ---
interface SpeakButtonProps {
  content: string;
  theme: any;
  // 💡 关键优化：每个按钮需要一个唯一 ID（如消息 ID），
  // 这样才能精确控制是哪一个按钮变动，防止列表滚动复用导致的 UI 错乱
  messageId: string;
}

// 导出并在外部维护一个全局状态，用来记录当前是哪个 ID 在播放
let currentlyPlayingId: string | null = null;

export function SpeakButton({ content, theme, messageId }: SpeakButtonProps) {
  // 💡 本地状态：当前按钮是否处于播放状态
  const [isPlaying, setIsPlaying] = useState(false);

  // 当组件挂载或卸载时，或者全局播放 ID 变动时，检查自己的状态
  useEffect(() => {
    // 检查全局状态，如果当前播放的 ID 不是自己，强制把自己设为静止
    if (currentlyPlayingId !== messageId && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentlyPlayingId, messageId, isPlaying]);

  const handleToggleSpeech = async () => {
    if (isPlaying) {
      // 如果已经在播放，点击则停止
      await Speech.stop();
      setIsPlaying(false);
      currentlyPlayingId = null;
    } else {
      // 💡 如果是静止状态，点击则开始播放

      // 0. 先停止可能存在的其他朗读
      await Speech.stop();

      // 1. 更新全局状态和本地 UI
      currentlyPlayingId = messageId;
      setIsPlaying(true);

      // 2. 开始朗读
      Speech.speak(content, {
        language: 'zh-CN',
        pitch: 1.0,
        rate: 1.0,

        // 💡 核心回调：朗读完成时触发
        onDone: () => {
          console.log(`朗读完成: ${messageId}`);
          setIsPlaying(false);
          if (currentlyPlayingId === messageId) {
            currentlyPlayingId = null;
          }
        },
        // 💡 核心回调：朗读出错时触发
        onError: (err) => {
          console.error(`朗读出错: ${messageId}`, err);
          setIsPlaying(false);
          if (currentlyPlayingId === messageId) {
            currentlyPlayingId = null;
          }
        },
      });
    }
  };

  // 根据 isPlaying 状态动态选择图标和文字颜色
  const iconColor = isPlaying ? theme.historyActiveText : theme.textMuted;
  const textColor = isPlaying ? theme.historyActiveText : theme.textMuted;
  const bgColor = isPlaying ? 'rgba(29, 161, 242, 0.1)' : 'transparent'; // 播放时加个微弱背景高亮

  return (
    <TouchableOpacity
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 4,
          paddingHorizontal: 6,
          marginLeft: 8,
          borderRadius: 12, // 配合背景色
        },
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined,
        { backgroundColor: bgColor },
      ]}
      onPress={handleToggleSpeech}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {/* 💡 根据状态切换图标 */}
      {isPlaying ? (
        <IconPlaying color={iconColor} />
      ) : (
        <IconMuteSpeaker color={iconColor} />
      )}
      <Text
        style={{
          fontSize: 12,
          color: textColor,
          marginLeft: 6,
          fontWeight: isPlaying ? '600' : '400',
        }}
      >
        {/* {isPlaying ? '正在播放' : '朗读'} */}
      </Text>
    </TouchableOpacity>
  );
}
// 💡 1. 将单条消息抽离为独立组件，并用 React.memo 做性能优化
const ChatMessageItem = memo(
  ({ item, theme, isMobile }: { item: any; theme: any; isMobile: boolean }) => {
    const isUser = item.role === 'user';
    const hasContent = item.content && item.content !== '...';
    const hasThought = !!item.thought;
    const isThinking = !isUser && !hasContent && !hasThought;

    // Markdown 样式可以在组件内部定义或提到外面
    const dynamicMarkdownStyles = {
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
    };

    return (
      <View style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAi]}>
        <View
          style={[
            styles.bubble,
            { maxWidth: isMobile ? '100%' : '100%' },
            isUser
              ? [styles.bubbleUser, { backgroundColor: theme.bubbleUserBg }]
              : [
                  styles.bubbleAi,
                  {
                    backgroundColor: theme.bubbleAiBg,
                    borderColor: theme.border,
                  },
                ],
          ]}
        >
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
            <Text style={[styles.messageText, { color: theme.bubbleUserText }]}>
              {item.content}
            </Text>
          ) : (
            <View>
              {item.thought ? (
                <ThoughtCollapsible thought={item.thought} theme={theme} />
              ) : null}
              <Markdown style={dynamicMarkdownStyles}>
                {item.content || (isThinking ? '...' : '')}
              </Markdown>
            </View>
          )}

          <View style={styles.footerRow}>
            {!isUser && !isThinking && (
              <>
                {/* 1. 原本的复制按钮 */}
                <CopyButton content={item.content} theme={theme} />
                {/* 💡 2. 新增的朗读按钮（和复制按钮并排） */}
                <SpeakButton
                  content={item.content}
                  theme={theme}
                  messageId={item.id} // 确保你的 Message 对象里有唯一的 id 字段
                />
              </>
            )}
          </View>
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // 💡 精准控制何时重渲染：只有当前消息的内容、思考状态发生变化时才重渲染
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.content === nextProps.item.content &&
      prevProps.item.thought === nextProps.item.thought &&
      prevProps.theme === nextProps.theme
    );
  },
);
export default function ChatArea({
  messages,
  scrollViewRef,
  theme,
  isMobile = false,
  isKeyboardUp = false,
}: ChatAreaProps) {
  // const prevMessagesLengthRef = useRef(messages.length);
  // useEffect(() => {
  //   const currentLength = messages.length;
  //   if (currentLength > prevMessagesLengthRef.current) {
  //     scrollViewRef.current?.scrollToEnd({ animated: true });
  //   }
  //   prevMessagesLengthRef.current = currentLength;
  // }, [messages]);

  // 💡 核心修复：不管是组件因切换重新挂载，还是 messages 内容发生增加，都稳稳滚到底部
  useEffect(() => {
    // 使用双重 requestAnimationFrame / setTimeout，确保 DOM/Layout 渲染完成后再计算高度并滚动
    const timer = setTimeout(() => {
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [messages]); // 只要 messages 变动（包括切会话引发的列表替换）就会触发
  // 判断是否处于没有对话的空状态
  // const isEmpty = !messages || messages.length === 0;
  const showWelcome = (!messages || messages.length === 0) && !isKeyboardUp;
  return (
    <ScrollView
      ref={scrollViewRef}
      // 💡 关键修改：不论是不是空状态，都不要给 contentContainerStyle 加 flex: 1！
      contentContainerStyle={styles.scrollContent}
      // 💡 加上这一行：当内容不够一屏时，禁止无意义的上下弹性滚动（消灭滑动的根源）
      alwaysBounceVertical={false}
      nativeID="chat-custom-scroll"
      style={
        Platform.OS === 'web'
          ? ({
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent',
            } as any)
          : undefined
      }
    >
      {showWelcome ? (
        // 💡 欢迎空状态展示
        <View style={styles.emptyContainer}>
          <Text style={styles.welcomeEmoji}>👋</Text>
          <Text style={[styles.welcomeTitle, { color: theme.textMain }]}>
            你好，欢迎使用 AI 智能体
          </Text>
          <Text style={[styles.welcomeSubtitle, { color: theme.textMuted }]}>
            今天有什么想探讨的课题？随时向我提问吧！
          </Text>
        </View>
      ) : (
        // 正常消息列表
        messages.map((item) => (
          <ChatMessageItem
            key={item.id}
            item={item}
            theme={theme}
            isMobile={isMobile}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
    // 💡 如果空状态需要居中，在这里通过flexGrow控制，但绝对不要设 flex: 1 导致可滚动
  },
  // ❌ 把旧的 emptyScrollContainer 删掉，换成下面这个不会引起多余滚动的空状态样式：
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 240, // 用固定的顶部间距让它好看地居中，绝不触发 ScrollView 滚动
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
  },
  timeText: { fontSize: 10, flex: 1 },
  copyBtnWrapper: {
    position: 'relative',
    alignItems: 'center',
    marginLeft: 6,
  },
  copyIconBtn: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.1)',
  },
  tooltipBox: {
    position: 'absolute',
    bottom: -30, // 浮动在按钮正上方
    right: -25,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    zIndex: 99,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  tooltipText: {
    color: '#000',
    fontSize: 14,
    whiteSpace: 'nowrap',
  } as any,
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
});
