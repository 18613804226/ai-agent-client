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
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import ImageViewer from './ImageViewer';
import { FilePreviewer, extOf, classifyFile } from './FilePreviewer';
import { HoverTouchable } from './HoverTouchable';
import { BlurView } from 'expo-blur';
import { api } from '../services/api';
import {
  formatFileSize,
  forgetImageUpload,
  uploadAttachment,
  retryAttachmentUpload,
  retryImageUpload,
  type PickedAttachment,
} from '../hooks/useImagePicker';

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
   * 避免依赖 setInputText 的异步state 更新）；不传则发送输入框当前内容。
   */
  onSend: (text?: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  theme: any;
  isKeyboardUp?: boolean;
  /**
   * 统一的附件列表（图片 / 文档 / 视频 都在这里，用 kind 字段区分）。
   * 上传状态由条目的 uploading / uploadError / uploadId 字段承载：
   * 图片走 /chat/upload-image（uploadId 存返回 URL），其余走 /chat/attachment。
   */
  attachments?: PickedAttachment[];
  /** 需要函数式更新：上传成功/失败要按对象身份回填 uploadId / uploadError */
  setAttachments?: React.Dispatch<
    React.SetStateAction<PickedAttachment[]>>
  ;
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
  attachments = [],
  setAttachments = () => {},
  onPickImage,
}: ChatInputBarProps) {
  const BlurContainer = Platform.OS === 'web' ? View : BlurView;
  const [isHovered, setIsHovered] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false); // 语音/键盘模式
  /** 非 null = 当前正在预览第几张已选图片*/
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  /** 非 null = 正在应用内真预览的文件（弹层渲染，不再 window.open 变下载） */
  const [previewFile, setPreviewFile] = useState<PickedAttachment | null>(null);
  const closeFilePreview = useCallback(() => setPreviewFile(null), []);

  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isDesktopWeb = isWeb && width >= 768;
  // Expo SDK 55+：原生端必须显式指定 intensity + tint + blurMethod，
  // 否则 Android 默认 blurMethod='none' 只渲染半透明色块（白色方块）。
  const blurProps = isWeb
    ? {}
    : {
        intensity: 60,
        tint: theme.isDark ? 'dark' : 'light',
        blurMethod: 'dimezisBlurView',
      } as any;

  const hasAttachments = attachments.length > 0;
  // 附件没就绪 → 禁发送：① 还在传（id 未拿到）② 上传失败（点发送也是白跑）
  const uploadingAttachments = attachments.filter((f) => f.uploading);
  const failedAttachments = attachments.filter((f) => f.uploadError);
  const blockedByUpload =
    uploadingAttachments.length > 0 ||
    failedAttachments.length > 0;
  // 图片/文档/视频附件随消息发送（先上传拿 URL / id，发送时随消息引用）
  const canSubmit =
    (Boolean(inputText.trim()) || hasAttachments) &&
    !isGenerating &&
    !blockedByUpload;

  // ---- 发送按钮状态----
  const isStopMode = isGenerating;
  const isSendDisabled = !isStopMode && !canSubmit;

  const sendColor = isStopMode
    ? '#ef4444'
    : isSendDisabled
      ? (theme?.sendBtnDisabled ?? '#d1d5db')
      : isHovered
        ? (theme?.sendBtnHover ?? theme?.sendBtnActive ?? '#2563eb')
        : (theme?.sendBtnActive ?? '#3b82f6');

  const handleRemoveAttachment = useCallback(
    (index: number) => {
      const target = attachments[index];
      if (!target) return;
      // 图片：忘掉预传缓存（本地）；服务端 uploads 文件的删除需后端提供接口
      if (target.kind === 'image') {
        forgetImageUpload(target.uri);
      }
      // 文档/视频：已预传的顺手删服务端文件（DELETE /chat/attachments/:fileRef
      // = uuid.ext；裸 uploadId 会被 400「非法文件名」拒绝）；还在传/失败的没有
      // fileRef → 留给服务端 TTL / 30 天回收清
      else if (target.uploadFileRef) {
        api.deleteChatAttachment(target.uploadFileRef).catch(() => {});
      }
      setAttachments(attachments.filter((_, i) => i !== index));
    },
    [attachments, setAttachments],
  );

  /**
    * 点附件 → 按类型走同一套「应用内真预览」：
    * 图片进全屏 ImageViewer（缩放手势 + 翻页）；表格与 PDF 进 FilePreviewer
    * 应用内渲染（PDF 走 react-native-pdf，表格可调 /chat/excel/check 查错）；
    * web 端任何类型都进预览器。只有音视频等仍无本地渲染器的，才交系统应用。
    */
  const handleOpenAttachment = useCallback(
    (att: PickedAttachment) => {
      // 选中即上传：失败的点一下就地重传（成功后 chip 状态自愈），先不进预览
      if (att.uploadError) {
        if (att.kind === 'image') {
          retryImageUpload(att, setAttachments);
        } else {
          retryAttachmentUpload(att, setAttachments);
        }
        return;
      }
      const kind = classifyFile(att);
      // 图片走全屏 ImageViewer（缩放手势 + 翻页）：索引要在「仅图片」列表里
      if (kind === 'image') {
        const idx = attachments
          .filter((a) => a.kind === 'image')
          .findIndex((a) => a === att);
        if (idx >= 0) {
          setPreviewIndex(idx);
          return;
        }
      }
      // 表格 / PDF / 文本进 FilePreviewer 应用内真预览（PDF 走 react-native-pdf，
      // 文本走 expo-file-system 读文件，表格可调 /chat/excel/check 查错）；
      // web 端任何类型都进预览器
      if (
        kind === 'sheet' ||
        kind === 'pdf' ||
        kind === 'text' ||
        Platform.OS === 'web'
      ) {
        setPreviewFile(att);
        return;
      }
      Linking.openURL(att.uri).catch(() => {
        Alert.alert(
          '无法预览',
          att.name
            ? `系统没有能打开「${att.name}」的应用`
            : '系统没有能打开该文件的应用',
        );
      });
    },
    [setAttachments],
  );

  // ---- 语音结果：识别完成后直接发送到聊天区（不回填输入框）----
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

  // ---- 按住说话：录音 + ASR（跨端逻辑统一收敛到 useVoiceRecorder）----
  const { isRecording, isRecognizing, startRecord, stopRecord } =
    useVoiceRecorder(handleVoiceResult);

  // ---- 录音科技感动画----
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
                // 粘贴的图片同样并入统一附件列表（kind: 'image'）；
                // uploading: true 让遮罩+转圈从第一帧就盖上（effect 会发起预传）
                setAttachments((prev) => [
                  ...prev,
                  { uri: base64String, kind: 'image' as const, uploading: true },
                ]);
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
  }, [isDesktopWeb, setAttachments]);

  return (
    <View style={styles.inputAreaWrapper}>
      {/* 附件预览：图片/文档/视频统一走同一条渲染逻辑 */}
      {hasAttachments && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewContainer}          contentContainerStyle={styles.previewContentContainer}
        >
          {attachments.map((att, index) =>
            att.kind === 'image' ? (
              /* 图片：缩略图（与原图片逻辑一致） */
              <View
                key={`img-${index}`}
                style={[
                  styles.previewItem,
                  { backgroundColor: theme.btnBg, borderColor: theme.border },
                ]}
              >
                <HoverTouchable
                  activeOpacity={0.85}
                  rippleColor="rgba(255, 255, 255, 0.35)"
                  onPress={() => handleOpenAttachment(att)}
                  style={styles.previewImageTap}
                >
                  <Image source={{ uri: att.uri }} style={styles.previewImage} />
                </HoverTouchable>
                {/* 传输状态：遮罩 + 转圈直接盖在预览小图上 */}
                {att.uploading ? (
                  <View
                    style={[styles.uploadMask, { backgroundColor: theme.btnBg }]}
                    pointerEvents="none"
                  >
                    <ActivityIndicator
                      size="small"
                      color={theme.textMuted}
                    />
                  </View>
                ) : att.uploadError ? (
                  <View
                    style={[styles.uploadMaskError, { backgroundColor: theme.btnBg }]}
                    pointerEvents="none"
                  >
                    <Feather name="alert-circle" size={20} color="#ef4444" />
                  </View>
                ) : null}
                <HoverTouchable
                  style={styles.deleteBadge}
                  rippleColor="rgba(255, 255, 255, 0.35)"
                  onPress={() => handleRemoveAttachment(index)}
                  hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                >
                  <Text style={styles.deleteBadgeText}>✕</Text>
                </HoverTouchable>
              </View>
            ) : (
              /* 文档/视频：文件 chip（图标 + 名称 + 大小），点击进应用内真预览 */
              <View
                key={`${att.name ?? 'file'}-${index}`}
                style={[
                  styles.fileChip,
                  // 底色/描边跟随主题：写死的浅灰在暗色主题下就是一块白
                  { backgroundColor: theme.btnBg, borderColor: theme.border },
                ]}
              >
                <HoverTouchable
                  activeOpacity={0.85}
                  rippleColor="rgba(255, 255, 255, 0.35)"
                  onPress={() => handleOpenAttachment(att)}
                  disabled={att.uploading}
                  style={styles.fileChipTap}
                >
                  <View style={[styles.fileExtBox, { borderColor: theme.border }]}>
                    <Text style={[styles.fileExtText, { color: theme.textMain }]}>
                      {extOf(att.name, att.mime)}
                    </Text>
                  </View>
                  <View style={styles.fileChipMeta}>
                    <Text
                      numberOfLines={1}
                      style={[styles.fileChipName, { color: theme.textMain }]}
                    >
                      {att.name || '未命名文件'}
                    </Text>
                    {/* 就绪后才显示大小；上传中/失败由遮罩 + 转圈表达，不堆文字 */}
                    {!att.uploading && !att.uploadError ? (
                      <Text
                        numberOfLines={1}
                        style={[styles.fileChipSize, { color: theme.textMuted }]}
                      >
                        {formatFileSize(att.size) || '文档'}
                      </Text>
                    ) : null}
                  </View>
                </HoverTouchable>
                {/* 传输状态：遮罩 + 转圈盖住整块 chip */}
                {att.uploading ? (
                  <View
                    style={[styles.uploadMask, { backgroundColor: theme.btnBg }]}
                    pointerEvents="none"
                  >
                    <ActivityIndicator
                      size="small"
                      color={theme.textMuted}
                    />
                  </View>
                ) : att.uploadError ? (
                  <View
                    style={[styles.uploadMaskError, { backgroundColor: theme.btnBg }]}
                    pointerEvents="none"
                  >
                    <Feather name="alert-circle" size={20} color="#ef4444" />
                    <Text style={styles.uploadMaskErrorText}>重试</Text>
                  </View>
                ) : null}
                <HoverTouchable
                  style={styles.deleteBadge}
                  rippleColor="rgba(255, 255, 255, 0.35)"
                  onPress={() => handleRemoveAttachment(index)}
                  hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                >
                  <Text style={styles.deleteBadgeText}>✕</Text>
                </HoverTouchable>
              </View>
            ),
          )}
        </ScrollView>
      )}

      {/* 失败才有这行：可点的重试入口（上传状态一律不回文字，靠 chip 上的遮罩+转圈） */}
      {failedAttachments.length > 0 && (
        <View style={styles.fileHintRow}>
          <HoverTouchable
            activeOpacity={0.7}
            onPress={() => {
              // 图片与非图片附件分别走各自的重传入口
              attachments.forEach((f) => {
                if (!f.uploadError) return;
                if (f.kind === 'image') retryImageUpload(f, setAttachments);
                else retryAttachmentUpload(f, setAttachments);
              });
            }}
            style={styles.hintRetryBtn}
          >
            <Feather name="alert-circle" size={12} color="#ef4444" />
            <Text style={[styles.fileHintText, { color: '#ef4444' }]}>
              附件上传失败，点此重试
            </Text>
          </HoverTouchable>
        </View>
      )}

      {/* 点选中的缩略图 → 全屏预览大图 */}
      <ImageViewer
        visible={previewIndex !== null}
        images={attachments.filter((a) => a.kind === 'image').map((a) => a.uri)}
        index={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setPreviewIndex}
      />

      {/* 点附件 → 应用内真预览弹层（深色遮罩+ 主题色卡片，不再跳浏览器白底页） */}
      <FilePreviewer
        att={previewFile}
        theme={theme}
        onClose={closeFilePreview}
      />

      <BlurContainer
        style={[
          styles.inputBar,
          {
            backgroundColor: isWeb
              ? theme.isDark
                ? 'rgba(30,31,32,0.72)'
                : 'rgba(240,244,249,0.72)'
              : undefined,
            borderColor: theme.border,
            ...(isWeb ? { backdropFilterBlur: 24 } : { overflow: 'hidden' }),
          } as any,
        ]}
        {...blurProps}
      >
        {/* 附件按钮（语音模式下隐藏）*/}
        {!isVoiceMode && (!isDesktopWeb || onPickImage) && (
          <HoverTouchable
            style={styles.attachButton}
            onPress={onPickImage}
            disabled={isGenerating}
            activeOpacity={0.6}
          >
            <Feather name="plus" size={20} color={theme.textMuted} />
          </HoverTouchable>
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
          <HoverTouchable
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
          </HoverTouchable>
        )}

        {/* 发送 / 停止 按钮 */}
        {Platform.OS === 'android' ? (
          // 📱 Android：Material 白色水波纹（彩色按钮上），圆形裁剪
          <Pressable
            style={[styles.sendButton, { backgroundColor: sendColor, overflow: 'hidden' }]}
            android_ripple={{
              color: 'rgba(255, 255, 255, 0.35)',
              foreground: true,
              borderless: false,
            }}
            onPress={handleSendOrStop}
            disabled={isSendDisabled}
          >
            <Feather
              name={isStopMode ? 'square' : 'arrow-up'}
              size={20}
              color="#FFFFFF"
            />
          </Pressable>
        ) : (
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
        )}
      </BlurContainer>

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
    // 底色/描边由调用处按主题注入（写死浅色会在暗色主题下发白）
    overflow: 'hidden',
  },
  /** 文档预览 chip：宽条形（文件名长），高度与图片缩略图一致*/
  fileChip: {
    position: 'relative',
    width: 158,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fileChipTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  fileExtBox: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileExtText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  fileChipMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  fileChipName: {
    fontSize: 11,
    fontWeight: '500',
  },
  fileChipSize: {
    fontSize: 10,
    marginTop: 1,
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
  fileHintRow: {
    marginBottom: 4,
  },
  /** 传输中遮罩：铺满缩略图 / chip，中间放转圈 */
  uploadMask: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    // 半透明：既能看出「底下是啥」，又明确表示「还没就绪」
    opacity: 0.78,
  },
  /** 失败遮罩：图标 + 「重试」提示，点 chip 即重传 */
  uploadMaskError: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    opacity: 0.9,
  },
  uploadMaskErrorText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '700',
  },
  hintRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  fileHintText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
