import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { StyleSheet, Text, View, ScrollView, Platform } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import ImageViewer from './ImageViewer'
import FilePreviewer, { classifyFile } from './FilePreviewer'
import { HoverTouchable } from './HoverTouchable'
import { useChat } from '../context/appContexts'
import { INVERTED_CHAT_LIST } from '../utils/chatScroll'
import { useChatScroll } from '../hooks/useChatScroll'
import ChatMessageItem from './ChatMessageItem'
import { api, httpClient } from '../services/api'
import { MyToast } from './GlobalToast'
import type { ChatAreaProps } from '../types/chat'
import type { PickedAttachment } from '../hooks/useImagePicker'

// ===================== ChatArea 根组件 =====================
export default function ChatArea({
  messages,
  theme,
  isMobile = false,
  isKeyboardUp = false,
  activeId,
  streamingRenderMsg = null,
  autoRead = false, // 💡 新增
  isDrawerOpen = false // 抽屉打开时禁用文本选择，防止误触
}: ChatAreaProps) {
  const { scrollViewRef } = useChat()
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null)

  // 🧹 抽屉打开时清掉 Web 端已选中的蓝色文本选择框
  // （App 端靠 textSelectable=false 让原生选择自动收起）
  useEffect(() => {
    if (!isDrawerOpen) return
    if (Platform.OS !== 'web') return
    const sel = (globalThis as any).getSelection?.()
    sel?.removeAllRanges?.()
  }, [isDrawerOpen])

  // ==================== 图片全屏预览 ====================
  const [preview, setPreview] = useState<{
    images: string[]
    index: number
  } | null>(null)
  const openPreview = useCallback(
    (images: string[], index: number) => setPreview({ images, index }),
    []
  )
  const closePreview = useCallback(() => setPreview(null), [])
  const changePreviewIndex = useCallback(
    (index: number) => setPreview((prev) => (prev ? { ...prev, index } : prev)),
    []
  )

  // ==================== 文件附件预览（与图片同款交互：点气泡行 → 应用内真预览）====================
  const [filePreview, setFilePreview] = useState<PickedAttachment | null>(null)
  const closeFilePreview = useCallback(() => setFilePreview(null), [])

  const openFilePreview = useCallback(async (a: PickedAttachment) => {
    // ① 新鲜消息：本地 File 引用（Web）/ file://（原生）直接开
    if (a.blob || a.uri) {
      setFilePreview(a)
      return
    }
    // ② 历史消息（刷新/重载后只剩服务端引用）：服务端接口需要 token
    const serverPath =
      a.url ?? (a.fileRef ? `/chat/attachments/${a.fileRef}` : undefined)
    if (!serverPath) return
    if (Platform.OS === 'web') {
      // 该接口白名单 content-type 内联防 XSS，fetch 进 blob 不走导航
      httpClient
        .get(serverPath, { responseType: 'blob' })
        .then((blob: any) => setFilePreview({ ...a, blob, uri: '' }))
        .catch(() => MyToast.show('附件加载失败，可能已过期或被删除'))
      return
    }
    // 原生：docx/sheet 走后端 /html 纯文本渲染；其余（PDF/图片/音视频）下载到
    // 本地缓存后再用原生渲染器打开（react-native-pdf / Image 只认本地文件）
    const kind = classifyFile(a)
    if (kind === 'docx' || kind === 'sheet') {
      setFilePreview(a)
      return
    }
    const fileRef =
      a.fileRef ||
      a.uploadFileRef ||
      (serverPath.split('/').pop()?.split('?')[0] ?? '')
    if (!fileRef) {
      MyToast.show('附件加载失败，可能已过期或被删除')
      return
    }
    try {
      const localUri = await api.downloadAttachment(fileRef, a.name)
      setFilePreview({ ...a, uri: localUri })
    } catch {
      MyToast.show('附件加载失败，可能已过期或被删除')
    }
  }, [])

  // 💡 自动朗读相关引用
  const lastAutoReadKeyRef = useRef<string | null>(null)
  const autoPlayingRef = useRef(false)

  // 合并流式临时内容
  const displayMessages = useMemo(() => {
    const merged = !streamingRenderMsg
      ? messages
      : messages.map((msg) => {
          if (msg.id === streamingRenderMsg.msgId) {
            return {
              ...msg,
              content: streamingRenderMsg.content || msg.content,
              thought: streamingRenderMsg.thought || msg.thought,
              isStreaming: true
            }
          }
          return msg
        })

    // 逐条 cell 翻转（模拟 RN inverted FlatList）：锚住数组开头 = 视觉底部，
    // 所以原生端需要反转 data（最新在 index 0）。Web 端保持自然顺序。
    return INVERTED_CHAT_LIST ? [...merged].reverse() : merged
  }, [messages, streamingRenderMsg])

  const showWelcome =
    (!displayMessages || displayMessages.length === 0) && !isKeyboardUp

  const {
    scrollViewProps,
    scrollViewStyle,
    showScrollToBottom,
    handleScrollToBottom,
    outerOffsetSV,
    outerMaxSV,
    viewportOnLayout
  } = useChatScroll({ activeId, streamingRenderMsg, displayMessages })

  return (
    <View style={{ flex: 1 }} onLayout={viewportOnLayout}>
      {showWelcome ? (
        <View style={styles.welcomeOverlay}>
          <View style={styles.emptyContainer}>
            <Text style={styles.welcomeEmoji}>👋</Text>
            <Text style={[styles.welcomeTitle, { color: theme.textMain }]}>
              你好，欢迎使用 AI 智能体
            </Text>
            <Text style={[styles.welcomeSubtitle, { color: theme.textMuted }]}>
              今天有什么想聊的？
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          {...scrollViewProps}
          style={scrollViewStyle}
          contentContainerStyle={[
            styles.scrollContent,
            INVERTED_CHAT_LIST
              ? { flexGrow: 1, justifyContent: 'flex-end' }
              : null
          ]}
          alwaysBounceVertical={false}
          nativeID="chat-scroll"
        >
          {displayMessages.map((msg) => (
            <ChatMessageItem
              key={msg.id}
              item={msg}
              theme={theme}
              isMobile={isMobile}
              isStreaming={!!msg.isStreaming}
              playingMsgId={playingMsgId}
              setPlayingMsgId={setPlayingMsgId}
              onPreviewImage={openPreview}
              onPreviewFile={openFilePreview}
              textSelectable={!isDrawerOpen}
              outerOffsetSV={outerOffsetSV}
              outerMaxSV={outerMaxSV}
              scrollViewRef={scrollViewRef}
            />
          ))}
        </ScrollView>
      )}

      {/* ✅ 悬浮「回到底部」按钮：上滑超过一定距离才显示 */}
      {!showWelcome && showScrollToBottom && (
        <HoverTouchable
          onPress={handleScrollToBottom}
          activeOpacity={0.8}
          rippleColor={
            theme.isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.15)'
          }
          style={[
            styles.scrollToBottomBtn,
            {
              backgroundColor: theme.isDark
                ? 'rgba(40,40,40,0.92)'
                : 'rgba(255,255,255,0.95)',
              borderColor: theme.border
            }
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
        </HoverTouchable>
      )}

      {/* 点气泡里的图片 → 全屏预览 */}
      <ImageViewer
        visible={preview !== null}
        images={preview?.images ?? []}
        index={preview?.index ?? 0}
        onClose={closePreview}
        onIndexChange={changePreviewIndex}
      />

      {/* 点气泡里的附件行 → 文件真预览（PDF / 文本 / Office / 音视频） */}
      <FilePreviewer
        att={filePreview}
        theme={theme}
        onClose={closeFilePreview}
      />
    </View>
  )
}

// ===================== StyleSheet =====================
const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 16
  },
  welcomeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none'
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  welcomeEmoji: {
    fontSize: 42,
    marginBottom: 12
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center'
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20
  },
  scrollToBottomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)',
    elevation: 4,
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center'
  }
})
