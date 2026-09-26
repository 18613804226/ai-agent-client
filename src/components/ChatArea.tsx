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
import { useChat } from '../../app/_layout';

// ===================== 类型定义 =====================
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  isStreaming?: boolean;
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

// ===================== CopyButton =====================
interface CopyButtonProps {
  content: string;
  theme: ThemeType;
}
const CopyButton = memo(
  function CopyButton({ content, theme }: CopyButtonProps) {
    const [isHovered, setIsHovered] = useState(false);

    const handleCopy = async () => {
      await Clipboard.setStringAsync(content);
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
          accessibilityLabel="复制内容"
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
      </View>
    );
  },
  (prev, next) => prev.content === next.content && prev.theme === next.theme,
);

// ===================== Speaker Icons =====================
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
    <Path d="M11 5L6 9H2v6h4l5 4V5z" />
    <Path d="M23 9l-6 6M17 9l6 6" />
  </Svg>
);

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

// ===================== SpeakButton =====================
interface SpeakButtonProps {
  content: string;
  theme: ThemeType;
  messageId: string;
  playingMsgId: string | null;
  setPlayingMsgId: (id: string | null) => void;
}
const SpeakButton = memo(
  function SpeakButton({
    content,
    theme,
    messageId,
    playingMsgId,
    setPlayingMsgId,
  }: SpeakButtonProps) {
    const isPlaying = playingMsgId === messageId;

    const handleToggleSpeech = async () => {
      if (isPlaying) {
        await Speech.stop();
        setPlayingMsgId(null);
      } else {
        await Speech.stop();
        setPlayingMsgId(messageId);
        Speech.speak(content, {
          language: 'zh-CN',
          pitch: 1.0,
          rate: 1.0,
          onDone: () => setPlayingMsgId(null),
          onError: () => setPlayingMsgId(null),
        });
      }
    };

    const iconColor = isPlaying ? theme.historyActiveText : theme.textMuted;
    const textColor = isPlaying ? theme.historyActiveText : theme.textMuted;
    const bgColor = isPlaying ? 'rgba(29, 161, 242, 0.1)' : 'transparent';

    return (
      <TouchableOpacity
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 4,
            paddingHorizontal: 6,
            marginLeft: 8,
            borderRadius: 12,
          },
          Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined,
          { backgroundColor: bgColor },
        ]}
        onPress={handleToggleSpeech}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
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
        />
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.content === next.content &&
    prev.theme === next.theme &&
    prev.messageId === next.messageId &&
    prev.playingMsgId === next.playingMsgId,
);

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

    return (
      <View style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAi]}>
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
            <Text style={[styles.messageText, { color: theme.bubbleUserText }]}>
              {item.content}
            </Text>
          ) : (
            <View>
              {hasThought ? (
                <ThoughtCollapsible thought={item.thought!} theme={theme} />
              ) : null}

              {/* 核心优化：流式中用纯 Text，结束后再用 Markdown */}
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

          {/* 有内容就显示操作按钮 */}
          {!isUser && hasContent && (
            <View style={styles.footerRow}>
              <CopyButton content={item.content} theme={theme} />
              <SpeakButton
                content={item.content}
                theme={theme}
                messageId={item.id}
                playingMsgId={playingMsgId}
                setPlayingMsgId={setPlayingMsgId}
              />
            </View>
          )}
        </View>
      </View>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.content === next.item.content &&
    prev.item.thought === next.item.thought &&
    prev.theme === next.theme &&
    prev.isStreaming === next.isStreaming &&
    prev.playingMsgId === next.playingMsgId,
);

// ===================== ChatArea 根组件 =====================
export default function ChatArea({
  messages,
  theme,
  isMobile = false,
  isKeyboardUp = false,
  activeId,
  streamingRenderMsg = null,
}: ChatAreaProps) {
  const {
    handleScroll: originalHandleScroll,
    scrollViewRef,
    autoFollowRef,
  } = useChat();
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const scrollLockRef = useRef(false);

  // ✅ 用 state 控制「回到底部」按钮显示
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

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

  const safeScrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  // 滚动处理：计算是否离开底部一定距离
  const handleScroll = useCallback(
    (event: any) => {
      originalHandleScroll?.(event);

      const { layoutMeasurement, contentOffset, contentSize } =
        event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;

      // 上滑超过 120px 才显示按钮
      const shouldShow = distanceFromBottom > 120;
      setShowScrollToBottom(shouldShow);

      // 同步 autoFollow
      autoFollowRef.current = distanceFromBottom < 50;
    },
    [originalHandleScroll],
  );

  useEffect(() => {
    if (!streamingRenderMsg?.msgId) return;
    const timer = setTimeout(() => {
      safeScrollBottom();
    }, 120);
    return () => clearTimeout(timer);
  }, [streamingRenderMsg?.msgId, safeScrollBottom]);

  const showWelcome =
    (!displayMessages || displayMessages.length === 0) && !isKeyboardUp;

  const handleAnchorLayout = useCallback((event: any) => {
    if (scrollLockRef.current) return;
    if (autoFollowRef.current && scrollViewRef.current) {
      scrollLockRef.current = true;
      const y = event.nativeEvent.layout.y;
      scrollViewRef.current.scrollTo({ y, animated: false });
      setTimeout(() => {
        scrollLockRef.current = false;
      }, 80);
    }
  }, []);

  // 点击回到底部
  const handleScrollToBottom = () => {
    autoFollowRef.current = true;
    setShowScrollToBottom(false);
    safeScrollBottom();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollViewRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (autoFollowRef.current) {
            safeScrollBottom();
          }
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

        <View onLayout={handleAnchorLayout} style={{ height: 1 }} />
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 6,
  },
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
  }, // 在 StyleSheet 里加上
  scrollToBottomWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16, // 距离底部的距离，按需调整
    alignItems: 'center', // 水平居中
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
