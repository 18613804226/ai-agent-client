import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';

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
  onStop: () => void; // 💡 1. 引入停止回调
  isGenerating: boolean; // 💡 2. 引入是否正在生成的状态
  theme: any;
  isKeyboardUp: boolean;
}

export default function ChatInputBar({
  inputText,
  setInputText,
  onSend,
  onStop,
  isGenerating,
  theme,
  isKeyboardUp = false,
}: ChatInputBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const hasText = Boolean(inputText.trim());

  // 💡 3. 如果正在生成，按钮表现为“停止”状态；否则根据有没有文字决定发送状态
  const buttonBg = isGenerating
    ? '#ef4444' // 正在生成时显示醒目的红色/停止色
    : !hasText
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
          placeholder={isGenerating ? 'AI 正在思考中...' : '问问 AI 智能体...'}
          placeholderTextColor={theme.textMuted}
          value={inputText}
          onChangeText={setInputText}
          editable={!isGenerating} // 💡 正在生成时可以锁定输入框或保持可输入
          multiline
          textAlignVertical="center"
          // @ts-ignore
          onKeyPress={(e: any) => {
            if (Platform.OS === 'web' && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (hasText && !isGenerating) {
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
                  cursor: isGenerating || hasText ? 'pointer' : 'default',
                },
                isHovered && (hasText || isGenerating)
                  ? { transform: [{ scale: 1.05 }] }
                  : {},
              ] as any,
              default: [],
            }),
          ]}
          onPress={isGenerating ? onStop : onSend} // 💡 4. 根据状态决定是触发“停止”还是“发送”
          disabled={!isGenerating && !hasText}
          activeOpacity={0.8}
          // @ts-ignore
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* 💡 5. 正在生成时显示停止图标 ■，平时显示发送箭头 ↑ */}
          <Text style={styles.sendButtonText}>{isGenerating ? '■' : '↑'}</Text>
        </TouchableOpacity>
      </View>
      {!isKeyboardUp ? (
        <Text style={[styles.footerTip, { color: theme.textMuted }]}>
          AI 智能体可能会产生错误信息。
        </Text>
      ) : null}
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
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'flex-end',
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
        height: 'auto',
        fieldSizing: 'content',
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
    fontSize: 14,
  },
  footerTip: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.6,
  },
});
