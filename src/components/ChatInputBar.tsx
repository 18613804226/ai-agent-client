import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';

// 💡 优雅的现代滚动条样式：默认接近隐形，滚动或悬停时才显现
if (Platform.OS === 'web') {
  const styleId = 'web-modern-scrollbar';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      textarea::-webkit-scrollbar {
        width: 5px;
      }
      textarea::-webkit-scrollbar-track {
        background: transparent;
      }
      textarea::-webkit-scrollbar-thumb {
        background: rgba(150, 150, 150, 0.2);
        border-radius: 10px;
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
          // @ts-ignore
          onKeyPress={(e: any) => {
            if (Platform.OS === 'web' && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (hasText) {
                onSend();
              }
            }
          }}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: buttonBg },
            ...Platform.select({
              web: [
                {
                  transitionProperty: 'background-color, transform',
                  transitionDuration: '0.2s',
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
          // @ts-ignore
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Text style={styles.sendButtonText}>↑</Text>
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
    alignItems: 'flex-end', // 保持多行时按钮在右下侧
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    flex: 1,
    maxHeight: 280,
    fontSize: 15,
    lineHeight: 30,
    paddingTop: Platform.OS === 'ios' ? 4 : 2,
    paddingBottom: Platform.OS === 'ios' ? 4 : 2,
    textAlignVertical: 'center',
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        resize: 'none',
        overflowY: 'auto',
        height: 'auto', // 💡 解决高度拉满的核心
        fieldSizing: 'content', // 💡 解决自动撑开的核心
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
    marginBottom: 2,
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
