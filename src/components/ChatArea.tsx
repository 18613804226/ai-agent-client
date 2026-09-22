import React from 'react';
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
import Toast from 'react-native-root-toast';
// 💡 引入 React Native SVG 库来画复制图标（Expo 项目通常自带，或可直接用 react-native-svg）
import Svg, { Rect } from 'react-native-svg';
import Markdown from 'react-native-markdown-display';
interface ChatAreaProps {
  messages: any[];
  scrollViewRef: React.RefObject<ScrollView>;
  theme: any;
  isMobile?: boolean; // 💡 1. 增加移动端判断属性
}

export default function ChatArea({
  messages,
  scrollViewRef,
  theme,
  isMobile = false,
}: ChatAreaProps) {
  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Toast.show('已复制到剪贴板', {
      duration: Toast.durations.SHORT,
      position: Toast.positions.BOTTOM,
      shadow: true,
      animation: true,
      hideOnPress: true,
      delay: 0,
    });
  };
  // 💡 2. 将 markdownStyles 改为动态函数，完美适配白天/黑夜模式的文字颜色
  const dynamicMarkdownStyles = StyleSheet.create({
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.textMain,
    },
    strong: {
      fontWeight: 'bold',
      color: theme.textMain,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
      color: theme.textMain,
    },
    // 💡 新增：为各级标题增加舒适的上下间距和行高
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
    // 💡 1. 适配行内小代码块（比如 `code`）
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
    // 💡 2. 适配多行大代码块（Markdown 里的 ``` 代码块会被解析为 fence 和 code_block）
    fence: {
      backgroundColor: theme.isDark ? '#000' : '#eee', // 暗黑模式用深灰/黑色，白天模式用浅灰
      color: theme.isDark ? '#d4d4d4' : '#333333', // 代码文字颜色
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
  });
  // 在 Web 端，你可以直接用普通 View 实现完美滚动的容器
  const ScrollContainer = Platform.OS === 'web' ? View : ScrollView;

  // 给它配上 Web 端的滚动样式
  const webScrollStyles =
    Platform.OS === 'web'
      ? {
          overflowY: 'auto' as const,
          maxHeight: '100%', // 根据你的布局需要设置高度
        }
      : {};
  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.scrollContent}
      onContentSizeChange={() =>
        scrollViewRef.current?.scrollToEnd({ animated: true })
      }
      nativeID="chat-custom-scroll"
      // 💡 直接将 Web 标准滚动条样式写在 ScrollView 的 style 里
      style={
        Platform.OS === 'web'
          ? ({
              scrollbarWidth: 'thin', // 纤细滚动条
              scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent', // [滑块颜色, 轨道颜色]
            } as any)
          : undefined
      }
    >
      {messages.map((item) => {
        const isUser = item.role === 'user';
        const isThinking = !isUser && item.content === '思考中...';

        return (
          <View
            key={item.id}
            style={[styles.messageRow, isUser ? styles.rowUser : styles.rowAi]}
          >
            <View
              style={[
                styles.bubble,
                // 💡 3. 手机端气泡宽度撑满（设为 100%），电脑端保持 75%
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
                // 💡 用户消息保持普通文本
                <Text
                  style={[styles.messageText, { color: theme.bubbleUserText }]}
                >
                  {item.content}
                </Text>
              ) : (
                // 💡 AI 消息使用 Markdown 组件渲染，完美支持 **加粗** 和列表
                <Markdown style={dynamicMarkdownStyles}>
                  {item.content}
                </Markdown>
              )}

              {/* 底部信息栏 */}
              <View style={styles.footerRow}>
                <Text
                  style={[
                    styles.timeText,
                    { color: isUser ? theme.timeUserText : theme.timeAiText },
                  ]}
                >
                  {item.time}
                </Text>

                {/* 💡 只有【非用户】且【非思考中】时，才显示双矩形复制图标 */}
                {/* {!isUser && !isThinking && (
                  <TouchableOpacity
                    style={styles.copyIconBtn}
                    onPress={() => handleCopy(item.content)}
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
                )} */}
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// 移除了写死的 markdownStyles 常量，改在组件内部用 dynamicMarkdownStyles
const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 20 },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  bubble: { padding: 14, borderRadius: 16 }, // 移除了固定的 maxWidth，交由行内根据 isMobile 动态控制
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
  copyIconBtn: {
    padding: 4,
    marginLeft: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.1)',
  },
});
