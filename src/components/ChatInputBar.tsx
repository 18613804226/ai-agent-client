import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Pressable,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import ImageViewer from './ImageViewer';

if (Platform.OS === 'web') {
  const styleId = 'web-modern-scrollbar';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      textarea::-webkit-scrollbar { width: 5px; }
      textarea::-webkit-scrollbar-track { background: transparent; }
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
  /**
   * 发送回调。
   * 传入 text 时直接发送该文本（用于语音识别等「即时发送」场景，
   * 避免依赖 setInputText 的异步 state 更新）；不传则发送输入框当前内容。
   */
  onSend: (text?: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  theme: any;
  isKeyboardUp?: boolean;
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
  const [isVoiceMode, setIsVoiceMode] = useState(false); // 语音/键盘模式
  /** 非 null = 当前正在预览第几张已选图片 */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isDesktopWeb = isWeb && width >= 768;

  const hasText = Boolean(inputText.trim());
  const hasImages = selectedImages.length > 0;
  const canSubmit = (hasText || hasImages) && !isGenerating;

  // ---- 发送按钮状态 ----
  const isStopMode = isGenerating;
  const isSendDisabled = !isStopMode && !canSubmit;

  const sendColor = isStopMode
    ? '#ef4444'
    : isSendDisabled
      ? (theme?.sendBtnDisabled ?? '#d1d5db')
      : isHovered
        ? (theme?.sendBtnHover ?? theme?.sendBtnActive ?? '#2563eb')
        : (theme?.sendBtnActive ?? '#3b82f6');

  const handleRemoveImage = useCallback(
    (index: number) => {
      setSelectedImages(selectedImages.filter((_, i) => i !== index));
    },
    [selectedImages, setSelectedImages],
  );

  // ---- 语音结果：识别完成后直接发送到聊天区（不回填输入框） ----
  const handleVoiceResult = useCallback(
    (text: string) => {
      const content = text?.trim();
      if (!content) return;
      setIsVoiceMode(false); // 退出语音模式
      Keyboard.dismiss();
      // ⚠️ 通过参数直传，避免依赖 setInputText 的异步更新
      onSend(content);
    },
    [onSend],
  );

  const handleSendOrStop = useCallback(() => {
    if (isGenerating) {
      onStop();
      return;
    }
    if (canSubmit) {
      Keyboard.dismiss();
      onSend();
    }
  }, [isGenerating, canSubmit, onStop, onSend]);

  /* ---------- 模式切换 ---------- */
  const toggleVoiceMode = useCallback(() => {
    setIsVoiceMode((prev) => {
      const next = !prev;
      if (next) {
        Keyboard.dismiss();
      } else {
        inputRef.current?.focus?.();
      }
      return next;
    });
  }, []);

  // ---- 按住说话：录音 + ASR（跨端逻辑统一收敛到 useVoiceRecorder） ----
  const { isRecording, isRecognizing, startRecord, stopRecord } =
    useVoiceRecorder(handleVoiceResult);

  // ---- 录音科技感动画 ----
  const pulse = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const useNative = Platform.OS !== 'web';
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: useNative,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 0,
            useNativeDriver: useNative,
          }),
        ]),
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: useNative,
          }),
          Animated.timing(glow, {
            toValue: 0.3,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: useNative,
          }),
        ]),
      ).start();
    } else {
      pulse.stopAnimation();
      glow.stopAnimation();
      pulse.setValue(0);
      glow.setValue(0);
    }
  }, [isRecording, pulse, glow]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0],
  });

  const handlePressIn = useCallback(() => {
    startRecord();
  }, [startRecord]);

  const handlePressOut = useCallback(() => {
    stopRecord();
  }, [stopRecord]);

  /* ---------- Web 粘贴图片 ---------- */
  const inputRef = useRef<any>(null);
  useEffect(() => {
    if (!isDesktopWeb || !inputRef.current) return;
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
    return () =>
      nativeElement.removeEventListener(
        'paste',
        handleDOMPaste as EventListener,
      );
  }, [isDesktopWeb, selectedImages, setSelectedImages]);

  return (
    <View style={styles.inputAreaWrapper}>
      {/* 图片预览 */}
      {hasImages && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewContainer}
          contentContainerStyle={styles.previewContentContainer}
        >
          {selectedImages.map((imgUri, index) => (
            <View key={index} style={styles.previewItem}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setPreviewIndex(index)}
                style={[
                  styles.previewImageTap,
                  isWeb ? ({ cursor: 'pointer' } as any) : null,
                ]}
              >
                <Image source={{ uri: imgUri }} style={styles.previewImage} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBadge}
                onPress={() => handleRemoveImage(index)}
                hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
              >
                <Text style={styles.deleteBadgeText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* 点选中的缩略图 → 全屏预览大图 */}
      <ImageViewer
        visible={previewIndex !== null}
        images={selectedImages}
        index={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />

      <View
        style={[
          styles.inputBar,
          { backgroundColor: theme.inputBg, borderColor: theme.border },
        ]}
      >
        {/* 附件按钮（语音模式下隐藏） */}
        {!isVoiceMode && (!isDesktopWeb || onPickImage) && (
          <TouchableOpacity
            style={styles.attachButton}
            onPress={onPickImage}
            disabled={isGenerating}
            activeOpacity={0.6}
          >
            <Feather name="plus" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        )}

        {/* 输入框 / 按住说话 */}
        {isVoiceMode ? (
          <View style={styles.voiceHoldWrap}>
            {/* 脉冲外圈 */}
            {isRecording && (
              <Animated.View
                style={[
                  styles.pulseRing,
                  { pointerEvents: 'none' },
                  {
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                  },
                ]}
              />
            )}

            <Pressable
              style={[
                styles.voiceHoldBtn,
                isRecording && styles.voiceHoldBtnActive,
                { backgroundColor: theme.historyActiveBg },
              ]}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={isGenerating || isRecognizing}
            >
              {isRecording && (
                <Animated.View style={[styles.recDot, { opacity: glow }]} />
              )}
              <Text
                style={[
                  styles.voiceHoldText,
                  { color: isRecording ? '#00E5FF' : theme.textMain },
                  isRecording && styles.voiceHoldTextActive,
                ]}
              >
                {isRecognizing
                  ? '识别中…'
                  : isRecording
                    ? '松开 结束'
                    : '按住 说话'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              { color: theme.textMain },
              !isDesktopWeb || onPickImage ? styles.inputWithLeftPadding : null,
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
                handleSendOrStop();
              }
            }}
          />
        )}

        {/* 语音/键盘 切换按钮 */}
        {!isGenerating && (
          <TouchableOpacity
            style={styles.modeToggleBtn}
            onPress={toggleVoiceMode}
            activeOpacity={0.6}
          >
            {isVoiceMode ? (
              <MaterialCommunityIcons
                name="keyboard-outline"
                size={22}
                color={theme.textMuted}
              />
            ) : (
              <Feather name="mic" size={20} color={theme.textMuted} />
            )}
          </TouchableOpacity>
        )}

        {/* 发送 / 停止 按钮 */}
        <TouchableOpacity
          style={
            [
              styles.sendButton,
              { backgroundColor: sendColor },
              isWeb && {
                transitionProperty: 'background-color, transform',
                transitionDuration: '0.2s',
                transitionTimingFunction: 'ease',
                cursor: isStopMode || canSubmit ? 'pointer' : 'default',
              },
              isWeb && isHovered && (canSubmit || isStopMode)
                ? { transform: [{ scale: 1.05 }] }
                : null,
            ] as any
          }
          onPress={handleSendOrStop}
          disabled={isSendDisabled}
          activeOpacity={0.8}
          // @ts-ignore
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Feather
            name={isStopMode ? 'square' : 'arrow-up'}
            size={20}
            color="#FFFFFF"
          />
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
  previewImageTap: {
    width: '100%',
    height: '100%',
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
    paddingLeft: 8,
    paddingRight: 8,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.15)',
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
  input: {
    flex: 1,
    maxHeight: 280,
    fontSize: 15,
    paddingLeft: 4,
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
  inputWithLeftPadding: {
    paddingLeft: 4,
  },

  /* ---------- 按住说话（科技感） ---------- */
  voiceHoldWrap: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  voiceHoldBtn: {
    flexDirection: 'row',
    width: '100%',
    height: 40,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
    // backgroundColor: 'rgba(0, 229, 255, 0.04)',
  },
  voiceHoldBtnActive: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: 'rgba(0, 229, 255, 0.1)',
    boxShadow: '0px 0px 12px rgba(0, 229, 255, 0.27)',
    elevation: 8,
  },
  voiceHoldText: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  voiceHoldTextActive: {
    color: 'rgba(0, 229, 255, 0.3)',
    ...Platform.select({
      web: { textShadow: '0px 0px 8px rgba(0, 229, 255, 0.1)' } as any,
      default: {
        textShadowColor: 'rgba(0, 229, 255, 0.1)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
      },
    }),
  },
  pulseRing: {
    position: 'absolute',
    width: '100%',
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#00E5FF',
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00E5FF',
    boxShadow: '0px 0px 6px #00E5FF',
  },

  /* ---------- 切换按钮 ---------- */
  modeToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ---------- 发送按钮 ---------- */
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerTip: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.6,
  },
});
