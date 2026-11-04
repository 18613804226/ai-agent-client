import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { StyleSheet, View, Platform, ActivityIndicator } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useChat, useStreamingRenderMsg } from '../context/appContexts'
import { APP_PIN_USER_MESSAGE } from '../utils/chatScroll'
import ChatMessageItem from './ChatMessageItem'
import ImageViewer from './ImageViewer'
import FilePreviewer from './FilePreviewer'
import type { ChatAreaProps } from '../types/chat'
import type { Message } from '../types/chat'
import {
  FLASHLIST_MVCP,
  createRenderCell
} from './chat/chatAreaConstants'
import { chatAreaStyles } from './chat/chatAreaStyles'
import { WelcomeOverlay } from './chat/WelcomeOverlay'
import { ScrollToBottomFab } from './chat/ScrollToBottomFab'
import { ListFadeIn } from './chat/ListFadeIn'
import { useChatPreviews } from './chat/useChatPreviews'
import { useAutoRead } from './chat/useAutoRead'
import { useChatPinScroll } from './chat/useChatPinScroll'

const styles = StyleSheet.create({
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center'
  }
})

export default function ChatArea({
  messages,
  theme,
  isMobile = false,
  isKeyboardUp = false,
  activeId,
  isHistoryLoading = false,
  streamingRenderMsg: _ignoredStreamingRenderMsg = null,
  autoRead = false,
  isDrawerOpen = false,
  keyboardHeightSV = null,
  keyboardProgressSV = null,
  bottomInset = 0,
  bottomContentInset = 0
}: ChatAreaProps) {
  const { isGenerating } = useChat()
  const streamingRenderMsg = useStreamingRenderMsg()

  // 🧹 抽屉打开时清掉 Web 端已选中的蓝色文本选择框
  // （App 端靠 textSelectable=false 让原生选择自动收起）
  useEffect(() => {
    if (!isDrawerOpen) return
    if (Platform.OS !== 'web') return
    const sel = (globalThis as any).getSelection?.()
    sel?.removeAllRanges?.()
  }, [isDrawerOpen])

  // 图片 / 文件附件预览
  const {
    preview,
    openPreview,
    closePreview,
    changePreviewIndex,
    filePreview,
    openFilePreview,
    closeFilePreview
  } = useChatPreviews()

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
    return merged
  }, [messages, streamingRenderMsg])

  // 供子 hook 读取最新 displayMessages，避免把它放进 deps 导致每 token 重跑
  const displayMessagesRef = useRef(displayMessages)
  displayMessagesRef.current = displayMessages

  // 钉顶 / 历史贴底 / 输入栏占位 / 键盘位移（全部滚动逻辑）
  const {
    scrollViewRef,
    scrollViewStyle,
    scrollViewProps,
    listInteractionProps,
    viewportLayoutHandler,
    renderScrollComponent,
    listFooter,
    contentShiftStyle,
    handleMessageLayout,
    handleThoughtToggle,
    lastUserIdForAnim,
    showWelcome,
    isEmptyConversation,
    showScrollToBottom,
    scrollToBottomUI,
    handleScrollToBottom,
    recomputePinSpacer,
    pinnedMsgIdRef
  } = useChatPinScroll({
    activeId,
    messages,
    displayMessages,
    displayMessagesRef,
    isGenerating,
    streamingRenderMsg,
    isHistoryLoading,
    isKeyboardUp,
    keyboardHeightSV,
    keyboardProgressSV,
    bottomContentInset
  })

  // Web：聊天列表滚动条默认隐藏，鼠标移入才显示（Firefox scrollbar-color /
  // Chromium webkit-scrollbar 双写）。nativeID="chat-scroll" 落在可滚动节点上。
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const doc = (globalThis as any).document
    if (!doc || doc.getElementById('chat-scroll-hover-bar')) return
    const style = doc.createElement('style')
    style.id = 'chat-scroll-hover-bar'
    style.textContent = `
      #chat-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }
      #chat-scroll:hover { scrollbar-color: rgba(128,128,128,0.5) transparent; }
      #chat-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      #chat-scroll::-webkit-scrollbar-track { background: transparent; }
      #chat-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 8px; }
      #chat-scroll:hover::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.45); }
      #chat-scroll::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.65); }
    `
    doc.head.appendChild(style)
  }, [])

  const { playingMsgId, handlePlayingChange } = useAutoRead({
    activeId,
    autoRead,
    streamingRenderMsg,
    displayMessagesRef
  })

  /** FlashList 只在这些值变化时需要重算 cell；流式内容通过 data 本身更新 */
  const listExtraData = useMemo(
    () => ({
      playingMsgId,
      isGenerating,
      isDrawerOpen,
      theme,
      messageCount: displayMessages.length,
      animateInUserId: lastUserIdForAnim
    }),
    [
      playingMsgId,
      isGenerating,
      isDrawerOpen,
      theme,
      displayMessages.length,
      lastUserIdForAnim
    ]
  )

  const keyExtractor = useCallback(
    // 服务端历史 ID 偶发重复时，纯 id 会让 FlashList 复用错 cell / 直接不渲染。
    // 聊天只有追加、没有中间插入，index + id 仍保持稳定，同时天然去重。
    (item: Message, index: number) => `${item.id ?? 'm'}:${index}`,
    []
  )
  const getItemType = useCallback(
    (item: Message) => (item.systemNote ? 'system' : item.role),
    []
  )

  const renderItem = useCallback(
    ({ item, index, extraData }: any) => {
      const extra = extraData ?? listExtraData
      return (
        <ChatMessageItem
          item={item}
          theme={theme}
          isMobile={isMobile}
          isStreaming={!!item.isStreaming}
          isLast={index === extra.messageCount - 1}
          animateIn={
            !!extra.isGenerating &&
            item.role === 'user' &&
            item.id === extra.animateInUserId
          }
          isPlaying={item.id === extra.playingMsgId}
          setPlayingMsgId={handlePlayingChange}
          onPreviewImage={openPreview}
          onPreviewFile={openFilePreview}
          textSelectable={!extra.isDrawerOpen}
          onLayout={
            APP_PIN_USER_MESSAGE
              ? (e: any) => handleMessageLayout(item.id, e)
              : undefined
          }
          onThoughtToggle={
            APP_PIN_USER_MESSAGE ? handleThoughtToggle : undefined
          }
        />
      )
    },
    [
      theme,
      isMobile,
      listExtraData,
      handlePlayingChange,
      openPreview,
      openFilePreview,
      handleMessageLayout,
      handleThoughtToggle
    ]
  )

  const renderCell = useMemo(() => createRenderCell(contentShiftStyle), [
    contentShiftStyle
  ])

  return (
    <View style={{ flex: 1 }} onLayout={viewportLayoutHandler}>
      {isHistoryLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={theme.textMuted} />
        </View>
      ) : (
        <>
          {/* 空会话：欢迎语。键盘升起时淡出，避免「啪」一下消失 */}
          <WelcomeOverlay visible={showWelcome} theme={theme} />
          {!isEmptyConversation && (
            <ListFadeIn enabled={Platform.OS !== 'web'}>
            <FlashList
              ref={scrollViewRef}
              data={displayMessages}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              getItemType={getItemType}
              extraData={listExtraData}
              // 首次布局直接定位到末条：否则列表挂载的头几帧停在顶部，
              // 等 onContentSizeChange → 帧回调再程序化贴底，原生端会看到
              // 「先闪一下顶部再跳到底部」。initialScrollIndex 只在每个列表
              // 实例（切会话 remount）首次布局时消费一次。
              // ⚠️ 生成中（新会话首发消息走「钉顶」）不能开：否则初始定位到底部
              // 会和 pinUserMessage 的「滚到用户消息顶部」抢一下。
              initialScrollIndex={
                APP_PIN_USER_MESSAGE && !isGenerating && displayMessages.length
                  ? displayMessages.length - 1
                  : undefined
              }
              {...scrollViewProps}
              {...listInteractionProps}
              style={scrollViewStyle}
              contentContainerStyle={chatAreaStyles.scrollContent}
              alwaysBounceVertical={false}
              nativeID="chat-scroll"
              drawDistance={600}
              maintainVisibleContentPosition={FLASHLIST_MVCP}
              CellRendererComponent={renderCell}
              ListFooterComponent={listFooter}
              renderScrollComponent={renderScrollComponent}
              onLoad={() => {
                if (pinnedMsgIdRef.current) recomputePinSpacer()
              }}
              // Android 12+ 默认的「边缘拉伸」会在滚到顶/底时把内容拽回来弹一下，
              // 和 alwaysBounceVertical={false} 的意图一致，直接关掉；
              // nestedScrollEnabled：思考框内层 ScrollView 滚到头后，手势能交接过来继续滚列表
              {...Platform.OS === 'android'
                ? { overScrollMode: 'never', nestedScrollEnabled: true }
                : null}
            />
            </ListFadeIn>
          )}
        </>
      )}

      {/* 悬浮「回到底部」按钮：上滑超过一定距离才显示，淡入 + 上滑出现 */}
      <ScrollToBottomFab
        visible={
          !isEmptyConversation && !isHistoryLoading && showScrollToBottom
        }
        theme={theme}
        bottomInset={bottomInset}
        onPress={
          APP_PIN_USER_MESSAGE ? scrollToBottomUI : handleScrollToBottom
        }
      />

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
