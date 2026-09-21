import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
// 💡 注入现代极简滚动条样式
if (Platform.OS === 'web') {
  const styleId = 'web-custom-scrollbar';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      textarea::-webkit-scrollbar {
        width: 4px;
      }
      textarea::-webkit-scrollbar-track {
        background: transparent;
      }
      textarea::-webkit-scrollbar-thumb {
        background: rgba(150, 150, 150, 0.3);
        border-radius: 4px;
      }
      textarea::-webkit-scrollbar-thumb:hover {
        background: rgba(150, 150, 150, 0.5);
      }
    `;
    document.head.appendChild(style);
  }
}
interface ChatInputBarProps {
  inputText: string;
  setInputText: (text: string) => void;
  onSend: () => void;
  theme: any;
}

export default function ChatInputBar({
  inputText,
  setInputText,
  onSend,
  theme,
}: ChatInputBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const hasText = Boolean(inputText.trim());

  // 悬停或者有文字时的背景色计算
  const buttonBg = !hasText
    ? theme.sendBtnDisabled
    : isHovered
      ? theme.sendBtnHover
      : theme.sendBtnActive;

  return (
    <View style={styles.inputAreaWrapper}>
      <View
        style={[
          styles.inputBar,
          { backgroundColor: theme.inputBg, borderColor: theme.border },
        ]}
      >
        <TextInput
          style={[styles.input, { color: theme.textMain }]}
          placeholder="问问 AI 智能体..."
          placeholderTextColor={theme.textMuted}
          value={inputText}
          onChangeText={setInputText}
          multiline
          textAlignVertical="center"
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: buttonBg },
            // 💡 关键：直接在 Web 端内联安全的拆分 transition 属性
            ...Platform.select({
              web: [
                {
                  transitionProperty: 'background-color, transform',
                  transitionDuration: '0.8s',
                  transitionTimingFunction: 'ease',
                  cursor: hasText ? 'pointer' : 'default',
                },
                isHovered && hasText ? { transform: [{ scale: 1.05 }] } : {},
              ] as any,
              default: [],
            }),
          ]}
          onPress={onSend}
          disabled={!hasText}
          activeOpacity={0.8}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Text
            style={styles.sendButtonText}
            // 💡 核心：监听 Web 端的键盘按键
            // @ts-ignore
            onKeyPress={(e: any) => {
              if (Platform.OS === 'web') {
                // 如果按下了 Enter，且没有按 Shift
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault(); // 阻止文本框默认的换行
                  if (hasText) {
                    onSend(); // 触发发送
                  }
                }
              }
            }}
          >
            ↑
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.footerTip, { color: theme.textMuted }]}>
        AI 智能体可能会产生错误信息。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inputAreaWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
  inputBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    fontSize: 15,
    lineHeight: 20,
    paddingTop: Platform.OS === 'ios' ? 4 : 2,
    paddingBottom: Platform.OS === 'ios' ? 4 : 2,
    textAlignVertical: 'center',
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        resize: 'none',
        overflow: 'y',
      } as any,
    }),
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  footerTip: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.6,
  },
});
