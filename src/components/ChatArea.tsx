import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { StyleSheet, Text, View, Platform } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import ImageViewer from './ImageViewer'
import FilePreviewer, { classifyFile } from './FilePreviewer'
import { HoverTouchable } from './HoverTouchable'
import { PopAnim, POP_CSS_FALLBACK } from './PopAnim'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  runOnUI,
  withTiming,
  Easing,
  scrollTo as scrollToWorklet
} from 'react-native-reanimated'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { useChat } from '../context/appContexts'
import { useStreamingRenderMsg } from '../context/appContexts'
import { INVERTED_CHAT_LIST, APP_PIN_USER_MESSAGE } from '../utils/chatScroll'
import { useChatScroll } from '../hooks/useChatScroll'
import ChatMessageItem from './ChatMessageItem'
import { chatMessageStyles } from './ChatMessageItem.styles'
import { api, httpClient } from '../services/api'
import { playText, stopSpeech } from '../services/speechPlayer'
import { MyToast } from './GlobalToast'
import type { ChatAreaProps } from '../types/chat'
import type { Message } from '../types/chat'
import type { PickedAttachment } from '../hooks/useImagePicker'

// ===================== ChatArea 根组件 =====================
/** 钉顶时用户消息上方保留的间隙 = 相邻气泡之间的间距（messageRow.marginBottom），
 *  这样钉顶后气泡上方的留白与「和上一个气泡的间距」一致，不会显得突兀。
 *  想调多/调少改 ChatMessageItem.styles 的 messageRow.marginBottom 即可。 */
const PIN_TOP_GAP =
  (chatMessageStyles.messageRow as any)?.marginBottom ?? 20

/** 输入框底部小字行的高度差：键盘收起时展开 17px，键盘升起时折叠到 10px。
 *  它会让 ChatArea 的布局高度反向变化 7px（键盘越起，聊天区越高）。
 *  留白必须按键盘进度同步补上这 7px，否则键盘起落期间
 *  「内容高 = 钉顶位置 + 视口高」会被破坏：视口变高而留白没跟上 → maxScroll 变小、
 *  钉顶被 clamp；视口变矮而留白没收回 → maxScroll 变大、钉顶后还能往上滑。
 *  数值与 ChatInputBar 的 `height: 10 + p * 7` 对应，改那边记得同步这里。 */
const FOOTER_COLLAPSE = 7

/** FlashList cell 容器：把键盘内容位移同样作用到每个 cell 上（contentContainerStyle 不支持 transform） */
const AnimatedCellContainer = Animated.createAnimatedComponent(View)

/** 把 Reanimated animated ref 和 FlashList 自己的 ScrollView ref 合并到同一个实例上 */
function mergeRefs(...refs: any[]) {
  return (node: any) => {
    refs.forEach((r) => {
      if (!r) return
      if (typeof r === 'function') r(node)
      else r.current = node
    })
  }
}

/** 关闭 FlashList 自动位置修正：钉顶/历史贴底都由本组件显式控制 */
const FLASHLIST_MVCP = { disabled: true } as const

export default function ChatArea({
  messages,
  theme,
  isMobile = false,
  isKeyboardUp = false,
  activeId,
  streamingRenderMsg: _ignoredStreamingRenderMsg = null,
  autoRead = false, // 💡 新增
  isDrawerOpen = false, // 抽屉打开时禁用文本选择，防止误触
  keyboardHeightValue = 0,
  keyboardHeightSV = null,
  keyboardProgressSV = null
}: ChatAreaProps) {
  const { scrollViewRef, isGenerating } = useChat()
  const streamingRenderMsg = useStreamingRenderMsg()
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null)

  // 💡 播放归属包装：playingMsgId 被手动喇叭接管（变成非自动播的 id / 清空）时，
  // 自动朗读要让位，避免旧 effect 误判还在自动播、后续乱停别人的音
  const handlePlayingChange = useCallback((id: string | null) => {
    if (id !== autoMsgIdRef.current) autoPlayingRef.current = false
    setPlayingMsgId(id)
  }, [])

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
  const autoMsgIdRef = useRef<string | null>(null)

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

  // 供自动朗读 effect 读取最新 displayMessages，避免把它放进 deps 导致每 token 重跑
  const displayMessagesRef = useRef(displayMessages)
  displayMessagesRef.current = displayMessages

  // ===== 钉顶模式（仅 APP）=====
  // 目标：发送后把刚发的用户消息钉在视口最顶部，AI 回答在下方流式增长、不自动吸底。
  // ⚠️ 只 scrollTo 不够：回答还很短时内容总高 < 视口高，scrollTo 会被 maxScroll 钳制。
  //   解法：给「回答区」补一段留白 —— 于是用户消息以下永远至少有一屏高，滚到它顶部永远合法；
  //   且回答没长满一屏前容器高度恒定不变，外层收不到内容尺寸变化 → 没有布局回补 → 不抖。
  //   留白必须**精确**：内容总高 = 钉顶位置 + 视口高 ⇒ maxScroll === 钉顶位置，
  //   于是钉顶后列表正好在最底部，一点都不能再往上滑（多留 1px 都能滑 1px）。
  const prevLastUserIdRef = useRef<string | null>(null)
  /** 当前被钉顶的用户消息 id / index */
  const pinnedMsgIdRef = useRef<string | null>(null)
  const pinnedIndexRef = useRef(-1)
  const viewportHRef = useRef(0)
  /** 实测内容总高（自然高度：尚未加预留时） */
  const contentHRef = useRef(0)
  /**
   * 本轮钉顶期间用户是否已手动触摸/滚动过。
   * 一旦用户接管（上滑看历史 / 展开别的思考框…），就不再纠正视口 ——
   * 否则会出现「往上一滑又被拽回最新气泡」。每次发送时重置为 false。
   */
  const userTouchedRef = useRef(false)
  /** 思考框展开/折叠动画期间：暂停 recompute，避免 JS 写 pinTarget/spacer 与
   *  UI 线程 withTiming 打架 → 抽动 */
  const thoughtBusyRef = useRef(false)
  const thoughtSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 思考框连续展开/折叠时，用 JS 侧绝对基准累计，避免从动画中间值再加 delta 丢量 */
  const pinTargetBaseRef = useRef(-1)
  const manualSpacerBaseRef = useRef(0)

  /** 视口高（渲染留白用；root onLayout 量一次） */
  const [viewportHState, setViewportHState] = useState(0)
  /**
   * 流式期间底部常驻「一屏高」留白（参考 Gemini/元宝）：
   * 它和 messages 在同一个 commit 就存在 → 滚到任意消息顶部永远合法 →
   * 用户消息 onLayout 的当帧（~10ms）就能直接 scrollTo，不等任何测量、不 clamp、不二次修正。
   */
  const streamingActive =
    APP_PIN_USER_MESSAGE && !!(isGenerating || streamingRenderMsg)
  /** 留白一旦出现就保留（吐字结束也不移除），只有切会话（remount）才清 */
  const [keepSpacer, setKeepSpacer] = useState(false)
  const [pinAllowed] = useState(true)
  const spacerVisible = (streamingActive && pinAllowed) || keepSpacer
  /** 最后一条用户消息 id：发送时与消息同批渲染，入场动画挂载即生效（不会先亮一下） */
  const lastUserIdForAnim = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id
    }
    return null
  }, [messages])
  /** 留白高度（共享值 → UI 线程逐帧生效） */
  const spacerSV = useSharedValue(0)
  /** 思考框折叠/展开的 UI 线程补偿（与 spacerSV 分离，避免 recompute 双重计数） */
  const manualSpacerSV = useSharedValue(0)
  const spacerHeightStyle = useAnimatedStyle(() => ({
    height:
      spacerSV.value +
      manualSpacerSV.value +
      (keyboardProgressSV?.value ?? 0) * FOOTER_COLLAPSE,
  }))
  /** 钉顶目标（共享值）：UI 线程帧回调每帧把滚动对齐到这里 */
  const pinTargetSV = useSharedValue(-1)
  const touchedSV = useSharedValue(false)
  const hasDataSV = useSharedValue(false)
  const historyBottomSV = useSharedValue(0)
  const contentShiftStyle = useAnimatedStyle(() => {
    // 键盘把整层往上推 K；内容反向下方位移 min(K, 可用留白) —— 先吃留白、超出才顶内容。
    // 可用留白 = 基准留白 + 键盘小字折叠补的那 7px（这两块都是真实可滚动的空白）。
    const footerExtra =
      (keyboardProgressSV?.value ?? 0) * FOOTER_COLLAPSE
    return {
      transform: [
        {
          translateY: Math.min(
            Math.abs(keyboardHeightSV?.value ?? 0),
            spacerSV.value + manualSpacerSV.value + footerExtra,
          ),
        },
      ],
    }
  })

  /**
   * 精确留白：自然高 = 实测高 - 当前留白 - 键盘小字补偿；留白 = 钉顶位置 + 一屏 - 自然高。
   * ——— 这里**不能加任何缓冲** ———
   * 留白多 1px，内容就比「钉顶位置 + 一屏」高 1px，maxScroll 也就比钉顶位置大 1px，
   * 表现就是：钉顶后列表还能往上滑一点点（且底部露出多余空白）。
   * 用 ceil 只为吃掉亚像素小数（最多 1px 以内），不会产生可见的可滑动距离。
   * ⚠️ 键盘期间视口高会随底部小字折叠 ±7px，渲染层的留白已经按 keyboardProgress
   *    逐帧补了这 7px（见 spacerHeightStyle）；这里换算基准高度时要把补偿扣掉，
   *    否则会把同一份 7px 算两遍。
   */
  const recomputePinSpacer = useCallback(() => {
    if (!APP_PIN_USER_MESSAGE) return
    if (!pinnedMsgIdRef.current) return
    if (thoughtBusyRef.current) return
    const idx = pinnedIndexRef.current
    const ref = scrollViewRef.current as any
    const layout = idx >= 0 ? ref?.getLayout?.(idx) : undefined
    if (!layout) return
    const target = Math.max(
      0,
      layout.y + (ref?.getFirstItemOffset?.() ?? 0) - PIN_TOP_GAP,
    )
    // 注意：这里只重算留白，不再写 pinTargetSV —— 目标由 handleMessageLayout /
    // handleThoughtToggle 显式管理，避免动画期间被 recompute 覆盖导致抽动。
    const vh = viewportHRef.current
    const ch = contentHRef.current
    if (vh <= 0 || ch <= 0) return
    // 底部小字行随键盘进度折叠/展开 ±7px：spacerHeightStyle 负责「渲染层增长」，
    // 这里把这份临时高度从实测内容高里扣掉，避免基准留白重复计算。
    const keyboardExtra =
      (keyboardProgressSV?.value ?? 0) * FOOTER_COLLAPSE
    const baseCh = Math.max(0, ch - keyboardExtra)
    const exact = Math.max(
      0,
      Math.ceil(spacerSV.value + target + vh + 1 - baseCh),
    )
    if (exact !== spacerSV.value) spacerSV.value = exact
  }, [manualSpacerSV, scrollViewRef, keyboardProgressSV, pinTargetSV])

  /** 从 FlashList 当前 layout 重新计算钉顶目标（只在布局稳定后调用） */
  const syncPinTarget = useCallback(() => {
    const idx = pinnedIndexRef.current
    const ref = scrollViewRef.current as any
    const layout = idx >= 0 ? ref?.getLayout?.(idx) : undefined
    if (!layout) return
    const target = Math.max(
      0,
      layout.y + (ref?.getFirstItemOffset?.() ?? 0) - PIN_TOP_GAP,
    )
    pinTargetSV.value = target
    pinTargetBaseRef.current = target
  }, [scrollViewRef, pinTargetSV])

  /** 钉顶/历史贴底（纯 UI 线程逐帧）：目标由 JS 写共享值，用户一碰立即停手 */
  useFrameCallback(() => {
    'worklet'
    if (touchedSV.value) return
    if (!hasDataSV.value) return
    if (pinTargetSV.value >= 0) {
      scrollToWorklet(scrollViewRef, 0, pinTargetSV.value, false)
      return
    }
    if (historyBottomSV.value === 1) {
      scrollToWorklet(scrollViewRef, 0, 1e7, false)
    }
  })

  // 流式结束后不再清 pinTargetSV：思考框在流式结束后展开/折叠仍要贴顶。
  // 用户一碰（touchedSV）会停手；下次发送/切会话会重置目标。

  // ===== 加载历史贴底 =====
  const historyHardRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 立即收手（用户上滑 / 发送消息时） */
  const endHistoryBottom = useCallback(() => {
    historyBottomSV.value = 0
    if (historyHardRef.current) clearTimeout(historyHardRef.current)
  }, [historyBottomSV])

  /** 开始一轮「历史贴底」：置 1，2.5s 后自动收手（覆盖欢迎层→列表挂载的时序） */
  const beginHistoryBottom = useCallback(() => {
    if (!APP_PIN_USER_MESSAGE) return
    historyBottomSV.value = 1
    if (historyHardRef.current) clearTimeout(historyHardRef.current)
    historyHardRef.current = setTimeout(() => {
      historyBottomSV.value = 0
    }, 2500)
  }, [historyBottomSV])

  useEffect(
    () => () => {
      if (historyHardRef.current) clearTimeout(historyHardRef.current)
      if (thoughtSettleRef.current) clearTimeout(thoughtSettleRef.current)
    },
    [],
  )

  /** 钉顶：把某条用户消息滚到视口顶部（上方留 PIN_TOP_GAP 间隙）。
   * ⚠️ 必须先 endHistoryBottom()：否则历史贴底的轮询还在跑，会和钉顶互相抢滚动，
   *   表现为「钉顶后还能往上滑一小段就被拽回去」。
   */
  const pinUserMessage = useCallback(
    (userId: string) => {
      endHistoryBottom()
      userTouchedRef.current = false // 新一轮钉顶：重置「用户是否已接管」

      setKeepSpacer(true)
      // 新一轮：留白先回落到「一屏高」，保证内容立刻够高（否则会用上一轮的精确小值 → 被 clamp）。
      // viewportHRef 已是「键盘停稳后的基准视口高」（不含 7px），直接用。
      spacerSV.value = Math.max(0, viewportHRef.current + 1)
      manualSpacerSV.value = 0
      touchedSV.value = false
      pinTargetSV.value = -1
      pinTargetBaseRef.current = -1
      manualSpacerBaseRef.current = 0
      pinnedMsgIdRef.current = userId
      pinnedIndexRef.current = displayMessagesRef.current.findIndex(
        (m) => m.id === userId,
      )
      contentHRef.current = 0
    },
    [endHistoryBottom, spacerSV, touchedSV, pinTargetSV],
  )

  // key={activeId} 会让 ChatArea 每次切会话重挂 → 每个实例只做一次「首次历史落盘」
  const historyLoadedRef = useRef(false)
  const isGeneratingRef = useRef(false)
  isGeneratingRef.current = isGenerating

  useEffect(() => {
    if (!APP_PIN_USER_MESSAGE) return

    // 最后一条用户消息（发送时 handleSend 会同时追加「用户消息 + thinking 占位」，
    // 所以最后一条往往是 assistant —— 往回找最近的一条用户消息才是刚发的）
    const lastUser = (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') return messages[i]
      }
      return null
    })()
    const lastUserId = lastUser?.id ?? null

    // ① 本实例首次历史落盘 —— ⚠️ 这里绝不能当成「发送」：
    //    切会话是 remount，prevLastUserIdRef 从 null 起，历史一到就会「看起来像
    //    新来了一条用户消息」，若误判为发送就会去钉顶而不是贴底。
    if (!historyLoadedRef.current) {
      if (messages.length === 0) {
        // 历史还没到（此刻渲染的是 welcome 覆盖层，列表未挂载）→ 保持 pending 等列表
        beginHistoryBottom()
        return
      }
      historyLoadedRef.current = true
      prevLastUserIdRef.current = lastUserId
      if (isGeneratingRef.current && lastUserId) {
        // isGenerating=true → 是新会话刚发送的首次落盘，走钉顶
        pinUserMessage(lastUserId)
      } else {
        // 否则是加载历史 → 最后一条贴底
        beginHistoryBottom()
      }
      return
    }

    // ② 之后的「最后一条用户消息 id 变化」= 发送 → 钉顶
    if (lastUser && lastUserId !== prevLastUserIdRef.current) {
      pinUserMessage(lastUserId!)
    }
    prevLastUserIdRef.current = lastUserId
  }, [
    messages,
    beginHistoryBottom,
    pinUserMessage,
  ])

  /**
   * 消息布局上报：FlashList 的 cell 坐标不是内容绝对坐标，这里只用来触发
   * 钉顶消息的 index 校正和留白重算，不再记录 y。
   */
  const handleMessageLayout = useCallback(
    (msgId: string, _e: any) => {
      if (!APP_PIN_USER_MESSAGE) return
      if (msgId === pinnedMsgIdRef.current && !userTouchedRef.current) {
        const idx = displayMessagesRef.current.findIndex((m) => m.id === msgId)
        if (idx >= 0) pinnedIndexRef.current = idx
        // 显式写目标：只在这里（以及思考框补偿）更新 pinTargetSV。
        // 思考框动画期间不要写：否则会用动画中途的 layout.y 覆盖 withTiming，
        // 展开时目标变小 → 钉顶消息被往下拽。
        if (!thoughtBusyRef.current) {
          syncPinTarget()
        }
        recomputePinSpacer()
      } else if (pinnedMsgIdRef.current) {
        // 思考框等子组件折叠/展开 → 消息高度变化 → 立刻重算留白
        recomputePinSpacer()
      }
    },
    [recomputePinSpacer, syncPinTarget, scrollViewRef],
  )

  /**
   * 思考框展开/折叠时：立刻补偿高度变化，避免折叠时内容收缩 → maxScroll < target
   * → 钉顶被 clamp「往下带」。预补偿整段高度，recompute 在后续帧 fine-tune。
   */
  const handleThoughtToggle = useCallback(
    (msgId: string, expanding: boolean, height: number) => {
      if (!APP_PIN_USER_MESSAGE) return
      if (!pinnedMsgIdRef.current) return
      const msgIndex = displayMessagesRef.current.findIndex(
        (m) => m.id === msgId,
      )
      if (msgIndex < 0) return
      thoughtBusyRef.current = true
      if (thoughtSettleRef.current) clearTimeout(thoughtSettleRef.current)

      const above = msgIndex < pinnedIndexRef.current
      if (above) {
        // 上方：展开/折叠改变 pinned item 的绝对 y，UI 线程同步走目标
        if (pinTargetSV.value >= 0) {
          pinTargetBaseRef.current = Math.max(
            0,
            pinTargetBaseRef.current + (expanding ? height : -height),
          )
          runOnUI((sv: any, target: number) => {
            'worklet'
            if (sv.value < 0) return
            sv.value = withTiming(target, {
              duration: 250,
              easing: Easing.bezier(0.25, 0.1, 0.5, 1),
            })
          })(pinTargetSV, pinTargetBaseRef.current)
        }
      } else if (!expanding) {
        // 下方折叠：内容在动画末尾才缩 H，先立即补 H 留白防 maxScroll 掉到 target 以下
        manualSpacerBaseRef.current += height
        runOnUI((sv: any, m: number) => {
          'worklet'
          sv.value = m
        })(manualSpacerSV, manualSpacerBaseRef.current)
      }

      // 动画结束后只做一次原子汇总：重算目标 + 把 manual 折算进精确 spacer
      thoughtSettleRef.current = setTimeout(() => {
        const idx = pinnedIndexRef.current
        const ref = scrollViewRef.current as any
        const layout = idx >= 0 ? ref?.getLayout?.(idx) : undefined
        if (layout) {
          const target = Math.max(
            0,
            layout.y + (ref?.getFirstItemOffset?.() ?? 0) - PIN_TOP_GAP,
          )
          const vh = viewportHRef.current
          const ch = contentHRef.current
          const manual = manualSpacerBaseRef.current
          if (vh > 0 && ch > 0) {
            const exact = Math.max(
              0,
              Math.ceil(spacerSV.value + manual + target + vh + 1 - ch),
            )
            manualSpacerBaseRef.current = 0
            pinTargetSV.value = target
            pinTargetBaseRef.current = target
            runOnUI(
              (msp: any, ssp: any, m: number, s: number) => {
                'worklet'
                msp.value = m
                ssp.value = s
              },
            )(manualSpacerSV, spacerSV, 0, exact)
          } else {
            pinTargetSV.value = target
            pinTargetBaseRef.current = target
          }
        }
        thoughtBusyRef.current = false
      }, 300)
    },
    [manualSpacerSV, pinTargetSV, scrollViewRef],
  )

  // 💡 自动朗读：开即读 + 后续跟读
  //  - 打开开关立刻读当前最后一条已完成 AI 气泡；之后每条新 AI 气泡完成都跟读
  //  - 只在「吐字结束、内容落盘」后触发（streamingRenderMsg 为空且目标无 isStreaming），
  //    避免边吐边读频繁切分 TTS
  //  - 关闭开关 / 切会话 / 卸载时若是自动播的就停掉；手动点的喇叭不受开关影响
  useEffect(() => {
    if (!autoRead) {
      if (autoPlayingRef.current) {
        autoPlayingRef.current = false
        autoMsgIdRef.current = null
        stopSpeech()
        setPlayingMsgId(null)
      }
      return
    }
    // 吐字中不读：等流式结束、内容落盘后再跟读
    if (streamingRenderMsg) return
    const list = displayMessagesRef.current ?? []
    let target: { id: string; content: string } | null = null
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (
        m.role === 'assistant' &&
        !m.systemNote &&
        !m.isStreaming &&
        m.content?.trim()
      ) {
        target = m
        break
      }
    }
    if (!target) return
    const key = `${activeId}:${target.id}`
    if (lastAutoReadKeyRef.current === key) return
    lastAutoReadKeyRef.current = key
    // 新播放顶掉旧的（与手动喇叭语义一致），并接管 playingMsgId 让气泡显示中止态
    stopSpeech()
    const id = target.id
    const text = target.content
    setPlayingMsgId(id)
    autoPlayingRef.current = true
    autoMsgIdRef.current = id
    playText(text, {
      fetchUrl: async (sentence) => {
        const data = await api.textToSpeech(sentence, 'Nini')
        return data.url
      },
      onEnd: () => {
        if (autoMsgIdRef.current !== id) return // 已被手动喇叭接管：别动别人的状态
        autoPlayingRef.current = false
        autoMsgIdRef.current = null
        setPlayingMsgId((prev: string | null) => (prev === id ? null : prev))
      }
    }).catch((e) => {
      console.error('[自动朗读] 播放失败:', e)
      if (autoMsgIdRef.current !== id) return
      autoPlayingRef.current = false
      autoMsgIdRef.current = null
      setPlayingMsgId((prev: string | null) => (prev === id ? null : prev))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead, streamingRenderMsg, activeId])

  // 切会话重置跟读记忆（key={activeId} 本就会重挂，这里兜底同实例切会话的情况）
  useEffect(() => {
    lastAutoReadKeyRef.current = null
  }, [activeId])

  // 卸载时若是自动播的就停掉，避免切走后还在后台念
  useEffect(() => {
    return () => {
      if (autoPlayingRef.current) {
        autoPlayingRef.current = false
        stopSpeech()
      }
    }
  }, [])

  const showWelcome =
    (!displayMessages || displayMessages.length === 0) && !isKeyboardUp

  // 数据返回（列表挂载）后才允许 scrollTo，避免 uninitialized ref 警告
  useEffect(() => {
    hasDataSV.value = !showWelcome
  }, [showWelcome, hasDataSV])

  const {
    scrollViewProps,
    scrollViewStyle,
    showScrollToBottom,
    handleScrollToBottom,
    outerMaxSV,
    viewportOnLayout
  } = useChatScroll({ activeId, streamingRenderMsg, displayMessages })

  /** 「回到底部」（UI 线程）：滚到真实 maxScroll，animated=true 才有平滑动画 */
  const scrollToBottomUI = useCallback(() => {
    runOnUI((animatedRef: any, maxSV: any) => {
      'worklet'
      scrollToWorklet(animatedRef, 0, Math.max(0, maxSV.value), true)
    })(scrollViewRef, outerMaxSV)
  }, [scrollViewRef, outerMaxSV])

  /** FlashList 只在这些值变化时需要重算 cell；流式内容通过 data 本身更新 */
  const listExtraData = useMemo(
    () => ({
      playingMsgId,
      isGenerating,
      isDrawerOpen,
      theme,
      messageCount: displayMessages.length,
      animateInUserId: lastUserIdForAnim,
    }),
    [
      playingMsgId,
      isGenerating,
      isDrawerOpen,
      theme,
      displayMessages.length,
      lastUserIdForAnim,
    ],
  )

  const keyExtractor = useCallback((item: Message) => item.id, [])
  const getItemType = useCallback(
    (item: Message) => (item.systemNote ? 'system' : item.role),
    [],
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
      handleThoughtToggle,
    ],
  )

  const renderCell = useCallback(
    ({ index: _index, ...props }: any) => (
      <AnimatedCellContainer
        {...props}
        style={[props.style, contentShiftStyle]}
      />
    ),
    [contentShiftStyle],
  )

  /** FlashList 内部 ScrollView：把 animated ref 挂上去，UI 线程才能 scrollTo */
  const renderScrollComponent = useCallback(
    (props: any) => {
      const { ref: flashRef, ...rest } = props
      return (
        <Animated.ScrollView
          {...rest}
          ref={mergeRefs(scrollViewRef, flashRef)}
        />
      )
    },
    [scrollViewRef],
  )

  const listFooter =
    spacerVisible && viewportHState > 0 ? (
      <Animated.View style={spacerHeightStyle} pointerEvents="none" />
    ) : null

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height
        const p = keyboardProgressSV?.value ?? 0
        // closedH：把键盘小字折叠的 7px 从布局高里扣掉，得到「键盘收起时的基准视口高」。
        // 键盘动画期间 h 与 p 同步变化，closedH 理论上恒定；布局取整会让它抖 ±1px，
        // 所以只在变化超过 1px 时才更新并重算，避免无谓抖动。
        const closedH = h - p * FOOTER_COLLAPSE
        setViewportHState((prev) => (prev === h ? prev : h))
        if (Math.abs(closedH - viewportHRef.current) > 1) {
          viewportHRef.current = closedH
          recomputePinSpacer()
        }
        viewportOnLayout(e)
      }}
    >
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
        <FlashList
          ref={scrollViewRef}
          data={displayMessages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          extraData={listExtraData}
          {...scrollViewProps}
          style={scrollViewStyle}
          contentContainerStyle={styles.scrollContent}
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
          // 用户一碰列表 = 接管：此后不再把视口纠正回钉顶（否则会「滑上去又被拽回」）
          onScrollBeginDrag={(e: any) => {
            userTouchedRef.current = true
            touchedSV.value = true
            scrollViewProps.onScrollBeginDrag?.(e)
          }}
          // 列表挂载/内容变化时兜底滚到底（历史异步落盘 + 图片加载都会触发）
          onContentSizeChange={(...args: any[]) => {
            scrollViewProps.onContentSizeChange?.(args[0], args[1])
            const h = args[1]
            if (typeof h === 'number' && h > 0) {
              contentHRef.current = h
              if (!thoughtBusyRef.current) syncPinTarget()
              recomputePinSpacer()
            }
          }}
        />
      )}

      {/* ✅ 悬浮「回到底部」按钮：上滑超过一定距离才显示，淡入 + 上滑出现 */}
      {!showWelcome && showScrollToBottom && (
        <PopAnim kind="fab">
          {(animStyle) => (
            <Animated.View
              style={[
                styles.scrollToBottomBtnWrap,
                POP_CSS_FALLBACK,
                animStyle
              ]}
            >
              <HoverTouchable
                onPress={
                  APP_PIN_USER_MESSAGE ? scrollToBottomUI : handleScrollToBottom
                }
                activeOpacity={0.8}
                rippleColor={
                  theme.isDark
                    ? 'rgba(255, 255, 255, 0.3)'
                    : 'rgba(0, 0, 0, 0.15)'
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
            </Animated.View>
          )}
        </PopAnim>
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
  scrollToBottomBtnWrap: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center'
  },
  scrollToBottomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)',
    elevation: 4
  }
})
