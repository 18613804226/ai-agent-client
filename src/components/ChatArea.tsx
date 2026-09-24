import React, { useEffect, useRef, useState } from 'react';
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

interface ChatAreaProps {
  messages: any[];
  scrollViewRef: React.RefObject<ScrollView>;
  theme: any;
  isMobile?: boolean;
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

  const tooltipAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: tooltipProgress.value,
      transform: [
        { translateY: (1 - tooltipProgress.value) * 4 }, // 微妙的上浮下沉
        { scale: 0.92 + tooltipProgress.value * 0.08 },
      ],
      // 动画完全消失时自动关闭 pointerEvents，防止不可见时阻挡鼠标
      pointerEvents:
        tooltipProgress.value === 0 ? ('none' as const) : ('auto' as const),
    };
  });

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
      <Animated.View
        style={[
          styles.tooltipBox,
          {
            backgroundColor: theme.isDark ? '#eee' : '#eee',
          },
          tooltipAnimatedStyle,
        ]}
      >
        <Text style={styles.tooltipText}>复制代码</Text>
      </Animated.View>
    </View>
  );
}

export default function ChatArea({
  messages,
  scrollViewRef,
  theme,
  isMobile = false,
}: ChatAreaProps) {
  const prevMessagesLengthRef = useRef(messages.length);

  useEffect(() => {
    const currentLength = messages.length;
    if (currentLength > prevMessagesLengthRef.current) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
    prevMessagesLengthRef.current = currentLength;
  }, [messages]);

  const dynamicMarkdownStyles = StyleSheet.create({
    body: { fontSize: 15, lineHeight: 22, color: theme.textMain },
    strong: { fontWeight: 'bold', color: theme.textMain },
    paragraph: { marginTop: 0, marginBottom: 8, color: theme.textMain },
    heading1: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.textMain,
      marginTop: 14,
      marginBottom: 6,
      lineHeight: 28,
    },
    heading2: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.textMain,
      marginTop: 12,
      marginBottom: 6,
      lineHeight: 24,
    },
    heading3: {
      fontSize: 16,
      fontWeight: 'bold',
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
    // 💡 新增：给表格和分割线加上下间距
    table: {
      marginVertical: 10, // 表格整体上下留白
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 6,
    },
    hr: {
      backgroundColor: theme.border,
      height: 1,
      marginVertical: 12, // 分割线上下留白
    },
  });

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.scrollContent}
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
      {messages.map((item) => {
        const isUser = item.role === 'user';
        // 💡 修正判断：只要正文有实质内容，或者深度思考过程已经开始输出了，就不再是单纯的“思考中”加载状态
        const hasContent = item.content && item.content !== '...';
        const hasThought = !!item.thought;
        const isThinking = !isUser && !hasContent && !hasThought;

        return (
          <View
            key={item.id}
            style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAi]}
          >
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
                <Text
                  style={[styles.messageText, { color: theme.bubbleUserText }]}
                >
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
                {/* <Text
                  style={[
                    styles.timeText,
                    { color: isUser ? theme.timeUserText : theme.timeAiText },
                  ]}
                >
                  {item.time}
                </Text> */}

                {/* 💡 直接使用封装好的 CopyButton 组件 */}
                {!isUser && !isThinking && (
                  <CopyButton content={item.content} theme={theme} />
                )}
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 20 },
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
