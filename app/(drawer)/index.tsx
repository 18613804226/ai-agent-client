import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  StyleSheet,
  View,
  Text,
  Platform,
  ScrollView,
  PanResponder,
  AppState,
  BackHandler,
  useWindowDimensions,
  Dimensions
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RootSiblingParent } from 'react-native-root-siblings'
import { DrawerActions } from 'expo-router/react-navigation'
import { useFocusEffect, useNavigation, usePathname } from 'expo-router'
import { useDrawerStatus } from 'expo-router/drawer'

import Sidebar from '../../src/components/Sidebar'
import ChatArea from '../../src/components/ChatArea'
import ChatGlowBackground from '../../src/components/ChatGlowBackground'
import ChatInputBar, { INPUT_BAR } from '../../src/components/ChatInputBar'
import { MobileHeader } from '../../src/components/MobileHeader'
import Reanimated from 'react-native-reanimated'

import { useKeyboardAnimation } from '../../src/hooks/useKeyboardAnimation'
import { useImagePicker } from '../../src/hooks/useImagePicker'
import { useTheme, useChat, useKnowledge } from '../../src/context/appContexts' // 💡 全局 Context（与 app/_layout 共用）
import { isPCWebWidth, isMobileWebWidth } from '../../src/constants/theme'
import CustomActionSheet from '../../src/components/CustomActionSheet'
import DocumentPanel from '../../src/components/chatDocument/DocumentPanel'
import {
  clearChatDocument,
  extractDocument,
  openChatDocument,
  useChatDocumentState,
  wantsDocument
} from '../../src/utils/chatDocument'
export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation()
  const { width } = useWindowDimensions()

  // 从 Context 获取全局主题
  const { isDarkMode, themeMode, setThemeMode, theme } = useTheme()

  // 💡 2. 核心修改：直接从全局共享的 Context 获取聊天状态，不再私自调用 useChatManager()！
  const {
    conversations,
    activeId,
    currentChat,
    inputText,
    setInputText,
    isGenerating,
    isHistoryLoading,
    handleNewChat,
    handleSelectChat,
    handleDeleteChat,
    handleSend,
    handleStopGeneration,
    autoRead, // 💡 新增
    toggleAutoRead,
    isAtBottomRef,
    scrollViewRef,
    handleScroll
  } = useChat()
  const {
    selectedAttachments, // 👈 统一的附件列表（图片/文档/视频）
    setSelectedAttachments,
    handlePickImage,
    clearImages,
    isSheetVisible, // 👈 必须返回这个
    setIsSheetVisible, // 👈 必须返回这个
    handlePickDocument, // 👈 使用新名字
    openCamera,
    openImageLibrary
  } = useImagePicker()
  // 定义你的菜单列表（和截图里的风格一致）
  const menuItems = [
    ...(Platform.OS !== 'web'
      ? [
          {
            id: 'camera',
            icon: '📸',
            label: '拍照',
            onPress: openCamera
          }
        ]
      : []),
    {
      id: 'library',
      icon: '🖼️',
      label: '从相册选择',
      onPress: openImageLibrary // 👈 均打开图片库
    },
    {
      id: 'file',
      icon: '📎',
      label: '上传文件',
      onPress: handlePickDocument
    }
    // { id: 'canvas', icon: '🎨', label: 'Canvas', onPress: () => {} }
  ]
  const {
    uploadedFiles,
    handleUploadFile,
    handleDeleteFile,
    toggleKnowledgeFileEnabled
  } = useKnowledge()

  // 知识库上传进度（用于全局悬浮进度条）
  const uploadingFiles = uploadedFiles.filter((f) => f.uploading)
  const isUploadingKnowledge = uploadingFiles.length > 0
  const knowledgeUploadPercent = isUploadingKnowledge
    ? Math.round(
        uploadingFiles.reduce((sum, f) => sum + (f.progress ?? 0), 0) /
          uploadingFiles.length
      )
    : 0

  const {
    keyboardHeightStyle,
    isKeyboardUp,
    keyboardProgress,
    keyboardHeight,
    webViewportStyle
  } = useKeyboardAnimation()
  const drawerStatus = useDrawerStatus()
  const isDrawerOpen = drawerStatus === 'open'

  const [inputOverlayH, setInputOverlayH] = useState<number | null>(null)
  const handleInputOverlayHeight = useCallback((height: number) => {
    setInputOverlayH((current) => (current === height ? current : height))
  }, [])
  const chatBottomSpacer =
    inputOverlayH ??
    INPUT_BAR.pillMinH + INPUT_BAR.pillPanelGap + INPUT_BAR.panelH + insets.bottom

  // + 号菜单卡片底边：悬在输入框正上方（沿用旧版相对 pill 顶 17px 的间距）
  const sheetBottom =
    INPUT_BAR.pillMinH +
    INPUT_BAR.pillPanelGap +
    INPUT_BAR.panelH +
    INPUT_BAR.sheetMargin +
    insets.bottom

  const handleSendWithImages = useCallback(async (overrideText?: string) => {
    // 文档需求一律交给大模型：先整理内容，再按 ```markdown / ```docx 输出，
    // 落定后自动弹右侧面板预览（面板只做预览，正文照常展示整理后的内容）。
    const knowledgeFileIds = uploadedFiles
      .filter(
        (f) =>
          f.id &&
          !String(f.id).startsWith('upload_') &&
          !f.uploading &&
          !f.error &&
          f.status !== 'failed' &&
          f.status !== 'processing' &&
          f.enabled
      )
      .map((f) => f.id)
    await handleSend(
      overrideText,
      [],
      knowledgeFileIds,
      selectedAttachments,
      clearImages
    )
  }, [
    uploadedFiles,
    selectedAttachments,
    clearImages,
    handleSend
  ])

  // 💡 三端精准判断
  const screenWidth = Dimensions.get('window').width
  const isPCWeb = Platform.OS === 'web' && isPCWebWidth(screenWidth) // 电脑端网页
  const isMobileWeb = Platform.OS === 'web' && isMobileWebWidth(screenWidth) // 手机 H5 网页

  // 右侧文档面板：宽屏 Web 打开时，聊天区与悬浮输入栏同步收缩，给面板让位
  // （宽度可拖拽调整，跟随面板状态实时变化）
  const { doc, visible, width: docPanelWidth } = useChatDocumentState()
  const docPanelOpen = Platform.OS === 'web' && isPCWeb && visible && !!doc
  const panelInset = docPanelOpen ? { right: docPanelWidth } : null

  const wasGeneratingRef = useRef(false)
  const lastAutoDocMsgRef = useRef<string | null>(null)
  // 生成结束那一刻 messages 可能还在收敛（流合并 / 打字机），延迟后从 ref 取最新值
  const messagesRef = useRef(currentChat?.messages ?? [])
  messagesRef.current = currentChat?.messages ?? []

  // 切会话：面板连内容一起清掉，避免显示上一会话的文档
  useEffect(() => {
    clearChatDocument()
    lastAutoDocMsgRef.current = null
  }, [activeId])

  // 用户明确要求「整理成 md / doc」时，本轮回复落定后自动把文档推到右侧。
  // 只在「生成结束」这一瞬触发：切会话 / 翻历史不会误弹。
  useEffect(() => {
    const justFinished = wasGeneratingRef.current && !isGenerating
    wasGeneratingRef.current = isGenerating
    if (!justFinished || Platform.OS !== 'web' || isHistoryLoading) return
    const timer = setTimeout(() => {
      const msgs = messagesRef.current
      let aiId = ''
      let aiContent = ''
      let userText = ''
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i]
        if (!aiId) {
          if (
            m.role === 'assistant' &&
            !m.systemNote &&
            m.content &&
            m.content !== '...'
          ) {
            aiId = m.id
            aiContent = m.content
          }
        } else if (m.role === 'user' && m.content) {
          userText = m.content
          break
        }
      }
      if (!aiId || lastAutoDocMsgRef.current === aiId) return
      // 用户点名了格式就按用户的，没点名就让模型的围栏语言决定；
      // 面板只预览模型真正产出的文档（```markdown / ```docx），
      // 普通回答留在聊天正文，不再整篇塞进右侧面板。
      const requested = wantsDocument(userText)
      const document = extractDocument(aiContent, requested, aiId, {
        allowWholeReply: false
      })
      if (!document) return
      lastAutoDocMsgRef.current = aiId
      openChatDocument(document)
    }, 400)
    return () => clearTimeout(timer)
  }, [isGenerating, isHistoryLoading, activeId])

  // 💡 针对三端各自配置不同的悬浮菜单坐标样式
  const sheetPositionStyle = isPCWeb
    ? { bottom: sheetBottom, left: 'calc(50% - 270px)' } // 🖥️ PC 网页端：依据居中输入框进行精确定位
    : isMobileWeb
      ? { bottom: sheetBottom, left: 16 } // 📱 手机 H5 端：依据移动网页的 + 号定位
      : { bottom: sheetBottom, left: 20 }

  const openDrawer = () => {
    if (!isPCWeb) {
      navigation.dispatch(DrawerActions.openDrawer())
    }
  }

  // 偶发问题（原生 APP 为主）：从后台恢复时抽屉手势失效，表现为「侧栏展开、划不动、
  // 关不掉，安卓返回直接退出」，只有杀进程才好。回到前台时若抽屉还开着，主动关一次复位。
  useEffect(() => {
    if (isPCWeb) return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && drawerStatus === 'open') {
        navigation.dispatch(DrawerActions.closeDrawer())
      }
    })
    return () => sub.remove()
  }, [isPCWeb, navigation, drawerStatus])

  // 安卓返回：抽屉开着时优先关抽屉，而不是让 JS Stack 的返回把手势返回直接吞成「退出 app」。
  // ⚠️ 必须绑定到「聊天页聚焦」而不是仅 drawerStatus：进入 admin 后聊天页仍挂载在
  //    Stack 下层，旧写法会让它的 BackHandler 抢在 admin 的返回之前关掉底层抽屉，
  //    表现为要按两次返回才能退出 admin。
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !isDrawerOpen) return
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.dispatch(DrawerActions.closeDrawer())
        return true // 消费掉，别退出 app
      })
      return () => sub.remove()
    }, [isDrawerOpen, navigation])
  )

  // Web 端：从 admin 页返回时，抽屉状态可能保留为「打开」。
  // 用 pathname 变化检测返回,在聊天页重新渲染前同步关闭抽屉,
  // 避免用户看到抽屉关闭动画(无感)。
  const pathname = usePathname()
  const prevPathnameRef = useRef(pathname)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (prevPathnameRef.current === '/admin' && pathname !== '/admin') {
      navigation.dispatch(DrawerActions.closeDrawer())
    }
    prevPathnameRef.current = pathname
  }, [pathname, navigation])

  // 用于在 PanResponder 回调中判断抽屉状态（避免闭包读取旧值）
  const isDrawerOpenRef = useRef(isDrawerOpen)
  useEffect(() => {
    isDrawerOpenRef.current = isDrawerOpen
  }, [isDrawerOpen])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // ⚠️ 抽屉打开时禁用手势，避免与抽屉自己的 Pan 手势冲突导致「卡死」
        if (isPCWeb || isDrawerOpenRef.current) return false
        return (
          gestureState.dx > 3 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 0.6
        )
      },
      onPanResponderRelease: (_, gestureState) => {
        if (!isPCWeb && gestureState.dx > 14) {
          openDrawer()
        }
      }
    })
  ).current

  return (
    <RootSiblingParent>
      <View
        style={[
          styles.container,
          { backgroundColor: theme.bgApp },
          webViewportStyle
        ]}
        {...panResponder.panHandlers}
      >
        {!isPCWeb && (
          <MobileHeader
            theme={theme}
            insetsTop={insets.top}
            title={currentChat?.title}
            isDrawerOpen={false}
            onToggleDrawer={openDrawer}
            onNewChat={handleNewChat}
            autoRead={autoRead} // 💡 传递状态给顶栏
            onToggleAutoRead={toggleAutoRead} // 💡 传递切换方法给顶栏
          />
        )}

        <View style={styles.mainLayout}>
          {isPCWeb && (
            <View
              style={[
                styles.sidebarDesktop,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.bgSidebar
                }
              ]}
            >
              <Sidebar
                conversations={conversations}
                activeId={activeId}
                onNewChat={handleNewChat}
                onSelectChat={handleSelectChat}
                onDeleteChat={handleDeleteChat}
                isDarkMode={isDarkMode}
                themeMode={themeMode}
                onThemeModeChange={setThemeMode}
                theme={theme}
                uploadedFiles={uploadedFiles}
                onUploadFile={handleUploadFile}
                onDeleteFile={handleDeleteFile}
                onToggleFileEnabled={toggleKnowledgeFileEnabled}
              />
            </View>
          )}

          {/* ✅ keyboard-controller：原生键盘高度逐帧跟手（UI 线程），
              iOS / Android 都用，避免 iOS 上 JS 动画也卡。
              Web 上 keyboardHeightStyle 为空对象，不影响布局。 */}
          <Reanimated.View
            style={[styles.chatMainWrapper, keyboardHeightStyle]}
          >
            <View
              style={[styles.chatBlurTarget, panelInset]}
              pointerEvents="box-none"
            >
              {/* 不透明底色 + 科幻风动态光晕背景：垫底一层，消息区/输入栏盖在上面 */}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: theme.bgApp, pointerEvents: 'none' }
                ]}
              />
              <ChatGlowBackground isDark={isDarkMode} />
              <View style={styles.chatCenterContainer}>
                {/* 🌐 全局知识库上传进度条：抽屉关闭时也能看到 */}
                {isUploadingKnowledge && (
                  <View
                    style={[
                      styles.uploadBanner,
                      {
                        backgroundColor: isDarkMode
                          ? 'rgba(40,40,40,0.95)'
                          : 'rgba(255,255,255,0.97)',
                        borderColor: theme.border
                      }
                    ]}
                  >
                    <Text
                      style={[styles.uploadBannerText, { color: theme.textMain }]}
                    >
                      📁 知识库处理中 {knowledgeUploadPercent}%
                    </Text>
                    <View style={styles.uploadBannerTrack}>
                      <View
                        style={[
                          styles.uploadBannerFill,
                          {
                            width: `${knowledgeUploadPercent}%`,
                            backgroundColor: theme.sendBtnActive || '#3b82f6'
                          }
                        ]}
                      />
                    </View>
                  </View>
                )}

                {/* 列表保留悬浮输入栏的底部占位，使最后一条消息停在胶囊上方 */}
                <View style={styles.chatReserveWrap}>
                  <ChatArea
                    key={activeId}
                    messages={currentChat?.messages ?? []}
                    theme={theme}
                    isMobile={!isPCWeb}
                    isKeyboardUp={isKeyboardUp}
                    activeId={activeId}
                    isHistoryLoading={isHistoryLoading}
                    autoRead={autoRead}
                    keyboardHeightSV={keyboardHeight}
                    keyboardProgressSV={keyboardProgress}
                    isDrawerOpen={isDrawerOpen}
                    bottomInset={chatBottomSpacer}
                    bottomContentInset={chatBottomSpacer}
                  />
                </View>
              </View>
            </View>
            {/* 悬浮输入栏层：绝对覆盖在聊天区之上，box-none 让间隙的触摸穿透给消息列表 */}
            <View
              style={[styles.chatOverlayLayer, panelInset]}
              pointerEvents="box-none"
            >
              <View
                style={styles.chatCenterContainer}
                pointerEvents="box-none"
              >
                <ChatInputBar
                  inputText={inputText}
                  setInputText={setInputText}
                  onSend={handleSendWithImages}
                  theme={theme}
                  onStop={handleStopGeneration}
                  isGenerating={isGenerating}
                  isKeyboardUp={isKeyboardUp}
                  keyboardProgress={keyboardProgress}
                  attachments={selectedAttachments} // 👈 统一附件列表（图片/文档/视频）
                  setAttachments={setSelectedAttachments} // 👈 传入修改方法
                  onPickImage={handlePickImage} // 👈 绑定在这里
                  onOverlayHeightChange={handleInputOverlayHeight}
                />
                <CustomActionSheet
                  visible={isSheetVisible} // 传显隐状态
                  onClose={() => setIsSheetVisible(false)} // 传关闭方法
                  isDarkMode={isDarkMode}
                  theme={theme}
                  items={menuItems}
                  positionStyle={sheetPositionStyle}
                />
              </View>
            </View>
            {/* 桌面 Web 常驻右侧；窄屏 Web 由组件自己退化成 Modal */}
            {Platform.OS === 'web' && (
              <DocumentPanel theme={theme} isPCWeb={isPCWeb} />
            )}
            </Reanimated.View>
        </View>
      </View>
    </RootSiblingParent>
  )
}

const styles = StyleSheet.create({
  // 💡 修改 container：在 Web 端开启 fixed 布局，锁死整个视口，禁止外部滚动
  container: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          position: 'fixed' as any,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          overscrollBehavior: 'none' as any // 禁止 iOS 浏览器回弹露白
        }
      : {})
  },
  mainLayout: { flex: 1, flexDirection: 'row' },
  sidebarDesktop: {
    width: 280,
    height: '100%',
    borderRightWidth: 0
  },
  chatMainWrapper: {
    flex: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden'
  },
  chatBlurTarget: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden'
  },
  // 悬浮输入栏层：与聊天区完全重合的透明覆盖层（box-none 穿透触摸）
  chatOverlayLayer: {
    ...StyleSheet.absoluteFill
  },
  chatCenterContainer: {
    flex: 1,
    maxWidth: 850,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'column'
  },
  /** 消息列表占满聊天视口；悬浮输入栏不参与列表布局 */
  chatReserveWrap: {
    flex: 1
  },
  uploadBanner: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    zIndex: 20,
    minWidth: 220,
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)',
    elevation: 5
  },
  uploadBannerText: {
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'center'
  },
  uploadBannerTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(150,150,150,0.25)',
    overflow: 'hidden'
  },
  uploadBannerFill: {
    height: '100%',
    borderRadius: 3
  }
})
