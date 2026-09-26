import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
  Keyboard,
  Image,
  ScrollView,
  useWindowDimensions,
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
  onStop: () => void;
  isGenerating: boolean;
  theme: any;
  isKeyboardUp: boolean;
  selectedImages?: string[];
  setSelectedImages?: (images: string[]) => void;
  onPickImage?: () => void;
}

export default function ChatInputBar({
  inputText,
  setInputText,
  onSend,
  onStop,
  isGenerating,
  theme,
  isKeyboardUp = false,
  selectedImages = [],
  setSelectedImages = () => {},
  onPickImage,
}: ChatInputBarProps) {
  const [isHovered, setIsHovered] = useState(false);

  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isDesktopWeb = isWeb && width >= 768;

  const hasText = Boolean(inputText.trim());
  const hasImages = selectedImages.length > 0;

  const canSubmit = (hasText || hasImages) && !isGenerating;

  const buttonBg = isGenerating
    ? '#ef4444'
    : !canSubmit
      ? theme.sendBtnDisabled
      : isHovered
        ? theme.sendBtnHover
        : theme.sendBtnActive;

  const handleRemoveImage = (index: number) => {
    const newImages = selectedImages.filter((_, i) => i !== index);
    setSelectedImages(newImages);
  };

  const inputRef = useRef<any>(null);
  useEffect(() => {
    if (isDesktopWeb && inputRef.current) {
      const nativeElement = inputRef.current;

      const handleDOMPaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              e.preventDefault();
              const reader = new FileReader();
              reader.onload = (event) => {
                const base64String = event.target?.result as string;
                if (base64String) {
                  setSelectedImages([...selectedImages, base64String]);
                }
              };
              reader.readAsDataURL(blob);
            }
          }
        }
      };

      nativeElement.addEventListener('paste', handleDOMPaste as EventListener);
      return () => {
        nativeElement.removeEventListener(
          'paste',
          handleDOMPaste as EventListener,
        );
      };
    }
  }, [isDesktopWeb, selectedImages, setSelectedImages]);

  return (
    <View style={styles.inputAreaWrapper}>
      {/* 图片预览区域 */}
      {selectedImages.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewContainer}
          contentContainerStyle={styles.previewContentContainer}
        >
          {selectedImages.map((imgUri, index) => (
            <View key={index} style={styles.previewItem}>
              <Image source={{ uri: imgUri }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.deleteBadge}
                onPress={() => handleRemoveImage(index)}
              >
                <Text style={styles.deleteBadgeText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View
        style={[
          styles.inputBar,
          { backgroundColor: theme.inputBg, borderColor: theme.border },
        ]}
      >
        {(!isDesktopWeb || onPickImage) && (
          <TouchableOpacity
            style={styles.attachButton}
            onPress={onPickImage}
            disabled={isGenerating}
          >
            <Text style={[styles.attachButtonText, { color: theme.textMuted }]}>
              +
            </Text>
          </TouchableOpacity>
        )}

        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            { color: theme.textMain },
            !isDesktopWeb || onPickImage ? { paddingLeft: 4 } : {},
          ]}
          placeholder={
            isGenerating
              ? 'AI 正在思考中...'
              : isDesktopWeb
                ? '问问 AI 智能体或直接粘贴图片...'
                : '问问 AI 智能体...'
          }
          placeholderTextColor={theme.textMuted}
          value={inputText}
          onChangeText={setInputText}
          editable={!isGenerating}
          multiline
          textAlignVertical="center"
          // @ts-ignore
          onKeyPress={(e: any) => {
            if (isWeb && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) {
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
                  cursor: isGenerating || canSubmit ? 'pointer' : 'default',
                },
                isHovered && (canSubmit || isGenerating)
                  ? { transform: [{ scale: 1.05 }] }
                  : {},
              ] as any,
              default: [],
            }),
          ]}
          onPress={() => {
            if (isGenerating) {
              onStop();
            } else {
              Keyboard.dismiss();
              onSend();
            }
          }}
          disabled={!isGenerating && !canSubmit}
          activeOpacity={0.8}
          // @ts-ignore
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Text style={styles.sendButtonText}>{isGenerating ? '■' : '↑'}</Text>
        </TouchableOpacity>
      </View>

      {!isKeyboardUp ? (
        <Text style={[styles.footerTip, { color: theme.textMuted }]}>
          {isDesktopWeb
            ? 'AI 智能体可能会产生错误信息。支持直接粘贴截图。'
            : 'AI 智能体可能会产生错误信息。'}
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
  previewContainer: {
    maxHeight: 80,
    marginBottom: 8,
  },
  previewContentContainer: {
    alignItems: 'center',
    gap: 8,
  },
  previewItem: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  deleteBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  inputBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 8,
    paddingLeft: 8, // 左侧贴边
    paddingRight: 8, // 右侧贴边
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
  },
  attachButtonText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: -3,
  },
  input: {
    flex: 1,
    maxHeight: 280,
    fontSize: 15,
    paddingTop: Platform.OS === 'ios' ? 10 : 9,
    paddingBottom: Platform.OS === 'ios' ? 10 : 9,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  footerTip: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.6,
  },
});
