import React, {
  useEffect,
  useRef,
  useCallback,
  useState
} from 'react'
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
  Keyboard,
  AppState,
  Pressable,
  useWindowDimensions
} from 'react-native'
import { Svg, Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming
} from 'react-native-reanimated'
import { InputBarIcon } from './InputBarIcon'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ImageViewer from './ImageViewer'
import FilePreviewer from './FilePreviewer'
import { HoverTouchable } from './HoverTouchable'
import GlassSurface from './GlassSurface'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { useSuppressBrowserCallout } from '../hooks/useSuppressBrowserCallout'
import {
  retryImageUpload,
  retryAttachmentUpload
} from '../hooks/useImagePicker'
import {
  INPUT_BAR,
  inputBarStyles
} from './chatInputBar/inputBarStyles'
import {
  useTextareaAutoHeight,
  useWebImagePaste
} from './chatInputBar/webInputHelpers'
import {
  useAttachmentPreview,
  AttachmentPreviewList
} from './chatInputBar/attachmentPreview'
import { VoiceModeUI } from './chatInputBar/VoiceModeUI'

// 保持原有公开 API：使用方从本文件导入 INPUT_BAR
export { INPUT_BAR } from './chatInputBar/inputBarStyles'

interface ChatInputBarProps {
  inputText: string
  setInputText: (text: string) => void
  /**
   * 发送回调。
   * 传入 text 时直接发送该文本（用于语音识别等「即时发送」场景，
   * 避免依赖 setInputText 的异步state 更新）；不传则发送输入框当前内容。
   */
  onSend: (text?: string) => void
  onStop: () => void
  isGenerating: boolean
  theme: any
  isKeyboardUp?: boolean
  /**
   * 键盘 progress 共享值（原生端由 KeyboardProvider 在 UI 线程逐帧驱动：
   * 0=收起，1=完全展开）。小字折叠直接在 worklet 里读它，全程不经过 JS bridge；
   * web 端为 null（库是 NOOP），回退走 isKeyboardUp 的 JS 动画。
   */
  keyboardProgress?: import('react-native-reanimated').SharedValue<number> | null
  /**
   * 统一的附件列表（图片 / 文档 / 视频 都在这里，用 kind 字段区分）。
   * 上传状态由条目的 uploading / uploadError / uploadId 字段承载：
   * 图片走 /chat/upload-image（uploadId 存返回 URL），其余走 /chat/attachment。
   */
  attachments?: import('../hooks/useImagePicker').PickedAttachment[]
  /** 需要函数式更新：上传成功/失败要按对象身份回填 uploadId / uploadError */
  setAttachments?: React.Dispatch<React.SetStateAction<import('../hooks/useImagePicker').PickedAttachment[]>>
  onPickImage?: () => void
  onOverlayHeightChange?: (height: number) => void
}

function ChatInputBar({
  inputText,
  setInputText,
  onSend,
  onStop,
  isGenerating,
  theme,
  isKeyboardUp = false,
  keyboardProgress = null,
  attachments = [],
  setAttachments = () => { },
  onPickImage,
  onOverlayHeightChange
}: ChatInputBarProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isVoiceMode, setIsVoiceMode] = useState(false) // 语音/键盘模式
  const inputRef = useRef<any>(null)

  // ---- 语音结果：识别完成后直接发送到聊天区（不回填输入框）----
  const handleVoiceResult = useCallback(
    (text: string) => {
      const content = text?.trim()
      if (!content) return
      setIsVoiceMode(false) // 退出语音模式
      Keyboard.dismiss()
      // ⚠️ 通过参数直传，避免依赖 setInputText 的异步更新
      onSend(content)
    },
    [onSend]
  )

  /** 键盘升起时淡出提示行：原生端直接读共享值，Web 端回退走 JS 动画。 */
  const footerProgress = useSharedValue(1)
  useEffect(() => {
    if (keyboardProgress) return // 原生：worklet 直读共享值，不走 JS
    footerProgress.value = withTiming(isKeyboardUp ? 0 : 1, { duration: 150 })
  }, [isKeyboardUp, keyboardProgress, footerProgress])
  const { width } = useWindowDimensions()
  /** 底部安全区：渐变纱幕要延伸进安全区（home indicator 浮在实色上） */
  const insets = useSafeAreaInsets()
  /** 纱幕颜色与 pill / 应用底色一致：底部实色时和输入框、背景无缝，
   *  不会透出背后的光晕（否则下方会泛出蓝紫色）。 */
  const panelGradColor = theme.bgApp
  /** 纱幕要铺满整个屏幕宽度：wrapper 被居中内容列（maxWidth 850）限制，
   *  宽屏上会比屏幕窄，这里按窗口宽度把两侧补齐，否则右侧会缺一块。 */
  const panelLeft = -(width - Math.min(width, 850)) / 2
  /** 提示行固定占高，键盘升起时仅淡出，避免悬浮层高度跟着键盘抖动。 */
  const footerWrapStyle = useAnimatedStyle(() => {
    // keyboardProgress: 0=键盘收起 → 小字展开；1=键盘升起 → 小字收起。
    // 原生分支取反 (1 - p) 与 JS 兜底 (isKeyboardUp ? 0 : 1) 语义对齐。
    const p = keyboardProgress ? 1 - keyboardProgress.value : footerProgress.value
    return {
      height: 14,
      opacity: p,
      overflow: 'hidden' as const,
    }
  })
  const isWeb = Platform.OS === 'web'
  const isDesktopWeb = isWeb && width >= 768
  const webHoverBg = theme.isDark
    ? 'rgba(255, 255, 255, 0.08)'
    : 'rgba(0, 0, 0, 0.05)'
  const webHoverBgStrong = theme.isDark
    ? 'rgba(255, 255, 255, 0.14)'
    : 'rgba(0, 0, 0, 0.08)'
  const hasAttachments = attachments.length > 0
  // 附件没就绪 → 禁发送：① 还在传（id 未拿到）② 上传失败（点发送也是白跑）
  const uploadingAttachments = attachments.filter((f) => f.uploading)
  const failedAttachments = attachments.filter((f) => f.uploadError)
  const blockedByUpload =
    uploadingAttachments.length > 0 || failedAttachments.length > 0
  // 图片/文档/视频附件随消息发送（先上传拿 URL / id，发送时随消息引用）
  const canSubmit =
    (Boolean(inputText.trim()) || hasAttachments) &&
    !isGenerating &&
    !blockedByUpload

  // ---- 发送按钮状态----
  const isStopMode = isGenerating
  const isSendDisabled = !isStopMode && !canSubmit

  const sendColor = isStopMode
    ? '#ef4444'
    : isSendDisabled
      ? (theme?.sendBtnDisabled ?? '#d1d5db')
      : isHovered
        ? (theme?.sendBtnHover ?? theme?.sendBtnActive ?? '#2563eb')
        : (theme?.sendBtnActive ?? '#3b82f6')

  const handleSendOrStop = useCallback(() => {
    if (isGenerating) {
      onStop()
      return
    }
    if (canSubmit) {
      Keyboard.dismiss()
      onSend()
    }
  }, [isGenerating, canSubmit, onStop, onSend])

  /* ---------- 模式切换 ---------- */
  const toggleVoiceMode = useCallback(() => {
    setIsVoiceMode((prev) => {
      const next = !prev
      if (next) {
        Keyboard.dismiss()
      } else {
        inputRef.current?.focus?.()
      }
      return next
    })
  }, [])

  // ---- 按住说话：录音 + ASR（跨端逻辑统一收敛到 useVoiceRecorder）----
  const { isRecording, isRecognizing, startRecord, stopRecord } =
    useVoiceRecorder(handleVoiceResult)

  // 🖥️ 桌面 Web（≥768px）不提供语音入口：按住说话对鼠标不友好。
  // 若窗口拉宽进入桌面尺寸时还停在语音模式，自动切回键盘并释放麦克风。
  useEffect(() => {
    if (isDesktopWeb && isVoiceMode) {
      setIsVoiceMode(false)
      if (isRecording) stopRecord()
    }
  }, [isDesktopWeb, isVoiceMode, isRecording, stopRecord])

  // ---- 录音科技感动画（已抽到 VoiceModeUI）----
  // ⚠️ OPPO/ColorOS 等国产浏览器长按会弹系统菜单抢按压事件（见 hook 注释），
  // 语音按钮不需要系统复制，直接整套压住。气泡正文千万别用这个。
  const voiceCallout = useSuppressBrowserCallout(isVoiceMode)

  /* ---------- Web 粘贴图片 / 旧内核高度兜底（已抽到 webInputHelpers） ---------- */

  // 原生：键盘收起后主动 blur。Android 键盘回落（返回键/点击空白）不会自动失焦，
  // 之后从后台切回 Activity 会因焦点还在输入框而自动弹起键盘。
  useEffect(() => {
    if (Platform.OS === 'web') return
    const blur = () => inputRef.current?.blur?.()
    const keyboardSub = Keyboard.addListener('keyboardDidHide', blur)
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') blur()
    })
    return () => {
      keyboardSub.remove()
      appStateSub.remove()
    }
  }, [])

  useWebImagePaste(isDesktopWeb, setAttachments, inputRef)
  useTextareaAutoHeight(inputRef, inputText, width, isVoiceMode)

  const {
    previewIndex,
    setPreviewIndex,
    previewFile,
    closeFilePreview,
    handleOpenAttachment,
    handleRemoveAttachment
  } = useAttachmentPreview(attachments, setAttachments)

  return (
    // 悬浮层：绝对定位贴在容器底部、不占布局流；box-none 让间隙区域的触摸穿透给消息列表。
    <View
      style={inputBarStyles.inputAreaWrapper}
      pointerEvents="box-none"
      onLayout={(e) => onOverlayHeightChange?.(e.nativeEvent.layout.height)}
    >
      {/* 附件预览：图片/文档/视频统一走同一条渲染逻辑 */}
      {hasAttachments && (
        <AttachmentPreviewList
          attachments={attachments}
          theme={theme}
          onOpen={handleOpenAttachment}
          onRemove={handleRemoveAttachment}
        />
      )}

      {/* 失败才有这行：可点的重试入口（上传状态一律不回文字，靠 chip 上的遮罩+转圈） */}
      {failedAttachments.length > 0 && (
        <View style={inputBarStyles.fileHintRow}>
          <HoverTouchable
            activeOpacity={0.7}
            hoverBg="rgba(239, 68, 68, 0.12)"
            onPress={() => {
              // 图片与非图片附件分别走各自的重传入口
              attachments.forEach((f) => {
                if (!f.uploadError) return
                if (f.kind === 'image') retryImageUpload(f, setAttachments)
                else retryAttachmentUpload(f, setAttachments)
              })
            }}
            style={inputBarStyles.hintRetryBtn}
          >
            <InputBarIcon name="alert-circle" size={12} color="#ef4444" />
            <Text style={[inputBarStyles.fileHintText, { color: '#ef4444' }]}>
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

      <View
        pointerEvents="none"
        style={[
          inputBarStyles.bottomPanel,
          {
            height: INPUT_BAR.panelFadeH + insets.bottom,
            left: panelLeft,
            width
          }
        ]}
      >
        {/* 渐进纱幕：纯渐变，不用 BlurView（均匀模糊会让顶部发雾、
            且模糊层上边缘会露出一条硬边）。从 pill 中部开始往下渐变，
            到底部约 90% 不透明（接近全实，仍透一点）。 */}
        {/* ⚠️ Svg 必须显式给 width/height：react-native-svg 只在
            position !== 'absolute' 时才默认 100%，否则会缩成默认 ~300px 宽，
            面板右侧就盖不住（露出背后的光晕）。 */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="inputPanelGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={panelGradColor} stopOpacity={0} />
              <Stop offset="0.15" stopColor={panelGradColor} stopOpacity={0.12} />
              <Stop offset="0.3" stopColor={panelGradColor} stopOpacity={0.3} />
              <Stop offset="0.5" stopColor={panelGradColor} stopOpacity={0.5} />
              <Stop offset="0.7" stopColor={panelGradColor} stopOpacity={0.68} />
              <Stop offset="0.85" stopColor={panelGradColor} stopOpacity={0.82} />
              <Stop offset="1" stopColor={panelGradColor} stopOpacity={0.9} />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#inputPanelGrad)"
          />
        </Svg>
      </View>

      {/* 输入框单独悬浮在聊天视窗上，使用不透明底色；外围不铺背景。 */}
      <GlassSurface
        theme={theme}
        style={[
          inputBarStyles.inputBar,
          {
            backgroundColor: theme.bgApp,
            // Web：输入栏底色与页面底色相同，边框必须更高对比，
            // 否则整条输入框会「融进背景」看不出边界。
            // 用 1.5px 边框 + 较强透明度 + 投影三层勾勒。
            ...(isWeb
              ? {
                borderWidth: 1,
                borderColor: theme.isDark
                  ? 'rgba(255,255,255,0.30)'
                  : 'rgba(0,0,0,0.40)',
                boxShadow: theme.isDark
                  ? '0 2px 10px rgba(0,0,0,0.5)'
                  : '0 2px 10px rgba(0,0,0,0.12)'
              }
              : {
                borderColor: theme.isDark
                  ? 'rgba(255,255,255,0.14)'
                  : 'rgba(0,0,0,0.12)'
              }),
            marginBottom: INPUT_BAR.pillPanelGap
          }
        ]}
      >
        {/* 附件按钮（语音模式下隐藏）*/}
        {!isVoiceMode && (!isDesktopWeb || onPickImage) && (
          <HoverTouchable
            style={inputBarStyles.attachButton}
            hoverBg={webHoverBgStrong}
            onPress={onPickImage}
            disabled={isGenerating}
            activeOpacity={0.6}
          >
            <InputBarIcon name="plus" size={20} color={theme.textMuted} />
          </HoverTouchable>
        )}

        {/* 输入框 / 按住说话 */}
        {isVoiceMode ? (
          <VoiceModeUI
            theme={theme}
            isRecording={isRecording}
            isRecognizing={isRecognizing}
            disabled={isGenerating || isRecognizing}
            onPressIn={startRecord}
            onPressOut={stopRecord}
            voiceCallout={voiceCallout}
          />
        ) : (
          <TextInput
            ref={inputRef}
            style={[
              inputBarStyles.input,
              { color: theme.textMain },
              !isDesktopWeb || onPickImage ? inputBarStyles.inputWithLeftPadding : null
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
            // Web：iOS Safari 要求表单控件计算字号 ≥16px 才不自动放大；
            // _layout 注入的 CSS 用 #chat-input 只把这里的文字缩回 15px（transform 不参与布局）。
            nativeID="chat-input"
            textAlignVertical="center"
            // @ts-ignore
            onKeyPress={(e: any) => {
              if (isWeb && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendOrStop()
              }
            }}
          />
        )}

        {/* 语音/键盘 切换按钮 */}
        {/* 🖥️ 桌面 Web（≥768px）隐藏语音入口；移动端 / H5 / Native 保留 */}
        {!isGenerating && !isDesktopWeb && (
          <HoverTouchable
            style={inputBarStyles.modeToggleBtn}
            hoverBg={webHoverBgStrong}
            onPress={toggleVoiceMode}
            activeOpacity={0.6}
          >
            {isVoiceMode ? (
              <InputBarIcon
                name="keyboard"
                size={22}
                color={theme.textMuted}
              />
            ) : (
              <InputBarIcon name="mic" size={20} color={theme.textMuted} />
            )}
          </HoverTouchable>
        )}

        {/* 发送 / 停止 按钮 */}
        {Platform.OS === 'android' ? (
          // 📱 Android：Material 白色水波纹（彩色按钮上），圆形裁剪
          <Pressable
            style={[
              inputBarStyles.sendButton,
              { backgroundColor: sendColor, overflow: 'hidden' }
            ]}
            android_ripple={{
              color: 'rgba(255, 255, 255, 0.35)',
              foreground: true,
              borderless: false
            }}
            onPress={handleSendOrStop}
            disabled={isSendDisabled}
          >
            <InputBarIcon
              name={isStopMode ? 'square' : 'arrow-up'}
              size={20}
              color="#FFFFFF"
            />
          </Pressable>
        ) : (
          <TouchableOpacity
            style={
              [
                inputBarStyles.sendButton,
                { backgroundColor: sendColor },
                isWeb && {
                  transitionProperty: 'background-color, transform',
                  transitionDuration: '0.2s',
                  transitionTimingFunction: 'ease',
                  cursor: isStopMode || canSubmit ? 'pointer' : 'default'
                },
                isWeb && isHovered && (canSubmit || isStopMode)
                  ? { transform: [{ scale: 1.05 }] }
                  : null
              ] as any
            }
            onPress={handleSendOrStop}
            disabled={isSendDisabled}
            activeOpacity={0.8}
            // @ts-ignore
            onMouseEnter={() => setIsHovered(true)}
            // @ts-ignore
            onMouseLeave={() => setIsHovered(false)}
          >
            <InputBarIcon
              name={isStopMode ? 'square' : 'arrow-up'}
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        )}
      </GlassSurface>

      {/* 外围保持透明，仅显示提示文字；底部安全区不放文字。 */}
      <View
        style={{ height: INPUT_BAR.panelH + insets.bottom }}
        pointerEvents="none"
      >
        <View style={[inputBarStyles.panelTipZone, { height: INPUT_BAR.panelH }]}>
          <Reanimated.View style={footerWrapStyle}>
            <Text
              numberOfLines={1}
              style={[inputBarStyles.footerTip, { color: theme.textMuted, opacity: 0.9 }]}
            >
              {isDesktopWeb
                ? 'AI 智能体可能会产生错误信息。支持直接粘贴截图。'
                : 'AI 智能体可能会产生错误信息。'}
            </Text>
          </Reanimated.View>
        </View>
      </View>
    </View>
  )
}

export default React.memo(ChatInputBar)
