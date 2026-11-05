import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type MutableRefObject
} from 'react'
import { Platform } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  withTiming,
  Easing,
  scrollTo as scrollToWorklet,
  type SharedValue
} from 'react-native-reanimated'
import { scheduleOnUI } from 'react-native-worklets'
import { useChat } from '../../context/appContexts'
import {
  APP_PIN_USER_MESSAGE,
  THOUGHT_ANIM_MS,
  THOUGHT_ANIM_BEZIER
} from '../../utils/chatScroll'
import { useChatScroll } from '../../hooks/useChatScroll'
import { PIN_TOP_GAP, FOOTER_COLLAPSE, mergeRefs } from './chatAreaConstants'
import type { Message, StreamingRenderMsg } from '../../types/chat'

interface UseChatPinScrollOptions {
  activeId: string
  messages: Message[]
  displayMessages: Message[]
  displayMessagesRef: MutableRefObject<Message[]>
  isGenerating: boolean
  streamingRenderMsg: StreamingRenderMsg | null
  isHistoryLoading: boolean
  isKeyboardUp: boolean
  keyboardHeightSV?: SharedValue<number> | null
  keyboardProgressSV?: SharedValue<number> | null
  bottomContentInset: number
}

/**
 * ChatArea 的全部「钉顶 / 历史贴底 / 输入栏占位 / 键盘位移」逻辑。
 * 由原 ChatArea.tsx 原样搬出，返回列表渲染所需的全部句柄与组件 props。
 */
export function useChatPinScroll({
  activeId,
  messages,
  displayMessages,
  displayMessagesRef,
  isGenerating,
  streamingRenderMsg,
  isHistoryLoading,
  isKeyboardUp,
  keyboardHeightSV = null,
  keyboardProgressSV = null,
  bottomContentInset
}: UseChatPinScrollOptions) {
  const { scrollViewRef, isAtBottomRef } = useChat()

  // ⚠️ 卸载时清空共享 ref：scrollViewRef 由 ChatHost 常驻持有，而 ChatArea 因
  //    key={activeId} 在切会话/删会话/新建会话时频繁 remount。FlashList 卸载后其
  //    公开句柄对象可能仍留在共享 ref 里（内部 ScrollView 已置 null），新实例的
  //    layout effect 拿到这个「死句柄」调 getScrollableNode 会在 FlashList 内部抛
  //    TypeError —— 没有错误边界时整棵 React 树直接卸载，H5 表现为全屏白/黑。
  //    layout cleanup 在同一 commit 里先于新树的 layout effect 执行，
  //    保证新 ChatArea 挂载时读到的是 null（走各调用点的空保护）。
  useLayoutEffect(
    () => () => {
      scrollViewRef.current = null
    },
    [scrollViewRef]
  )

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
   * 自然内容高 = 实测内容高 − 当前留白 − 键盘小字补偿。
   * 与留白解耦后，recomputePinSpacer 的「目标留白」是**绝对值**而不是增量：
   * 同一帧内被多次调用（多条 cell onLayout 连续上报）不会累加 overshoot。
   * 用实测总高做 delta 时，第二次调用会基于「还没长出新留白」的旧高度再补一次，
   * 留白越补越多 → maxScroll 虚高 → 钉顶目标被顶到视口外（新消息看不到）。
   */
  const naturalHRef = useRef(0)
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

  /** 视口是否已测量（只用于决定留白占位是否渲染；精确高度走 viewportHRef） */
  const [hasViewport, setHasViewport] = useState(false)
  /**
   * 历史贴底跟随是否进行中：为 true 时「回到底部」按钮一律不显示。
   * 冷启动/切会话时列表会先停在顶部/估算位置，再由帧回调程序化贴底；这段滚动
   * 不是用户上滑，按钮不该出现。用户一碰列表（onTouchStart/onScrollBeginDrag）
   * 或发送消息（pinUserMessage）即结束跟随，按钮恢复按距离判定。
   */
  const [historyFollowActive, setHistoryFollowActive] = useState(false)
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
  /**
   * 视口高（键盘收起基准）与内容总高的 UI 线程副本。
   * 键盘位移 worklet 需要它们来算「内容不足一屏时下方自然留出的空白」：
   * 加载历史后只有一两条消息时，这段空白不在 spacer 里，但同样应先被键盘吃掉。
   * （JS 侧 ref 在 worklet 里读不到最新值，必须同步到 shared value）
   */
  const viewportHeightSV = useSharedValue(0)
  const contentHeightSV = useSharedValue(0)
  const spacerHeightStyle = useAnimatedStyle(() => ({
    height:
      spacerSV.value +
      manualSpacerSV.value +
      (keyboardProgressSV?.value ?? 0) * FOOTER_COLLAPSE
  }))
  /** 钉顶目标（共享值）：UI 线程帧回调每帧把滚动对齐到这里 */
  const pinTargetSV = useSharedValue(-1)
  const touchedSV = useSharedValue(false)
  const hasDataSV = useSharedValue(false)
  const historyBottomSV = useSharedValue(0)
  /**
   * 上一次帧回调看到的列表 offset（UI 线程可读）。
   * 用来区分「内容长高（offset 没动、目标变大）」和「用户正在拖（offset 在动）」，
   * 后者绝不能抢滚动 —— 这是「第一次往回滑被卡住/弹回」的根源。
   */
  const lastFrameOffsetSV = useSharedValue(0)
  /** 首次贴底待办：历史刚落盘时允许一次「从顶部到底部」的跟随 */
  const pendingFollowSV = useSharedValue(0)
  /** 上次跟随时的内容总高：只有内容又长高了才继续跟（避免无谓地抢滚动） */
  const lastFollowContentHSV = useSharedValue(0)
  /**
   * 距上一次滚动事件过了多少帧（UI 线程可读）。
   * 用户手指刚按下时 JS 的 touch 事件有延迟，这段时间里 offset 还是陈旧的，
   * 光靠「offset 有没有动」挡不住抢滚动；用它再兜一层：
   * 只要最近 ~130ms 内有滚动事件（用户正在拖/惯性），贴底跟随就一律不滚。
   */
  const framesSinceScrollSV = useSharedValue(999)
  /**
   * 用户「正在」触摸/拖动列表（UI 线程可读）：为 true 时一切贴底跟随都停手。
   * 和 touchedSV 的区别：touchedSV 是「碰过一次就永久停手」（钉顶用），
   * 这个是「当前正在交互」，松手/惯性结束就恢复 —— 用来区分
   * 「用户停在底部」和「用户正在往回滑」，后者绝不能被贴底拽回去。
   */
  const interactingSV = useSharedValue(false)
  const contentShiftStyle = useAnimatedStyle(() => {
    // 键盘把整层往上推 K；内容反向下方位移 min(K, 可用空白) —— 先吃空白、超出才顶内容。
    // 可用空白 = 内容下方的全部空白：
    //   ① 钉顶留白（spacer + manual + 键盘小字折叠补的 7px）；
    //   ② 内容不足一屏时列表下方自然空出来的那块（视口高 - 自然内容高）。
    // ② 正是短会话（加载历史后只有一两条消息）的来源：没有它，键盘一升整条消息
    // 就被顶上去，而不是先吃掉下方空白。
    //
    // ⚠️ 可用空白必须扣掉悬浮输入栏的占位（bottomContentInset）：
    //    最后一条消息本来就停在这段占位之上（占位是留白的一部分），
    //    若把它也算进可位移量，内容会被往下顶进输入栏 —— 表现为气泡与输入框重叠。
    //    扣掉后：长会话（占位=输入栏高）位移为 0，消息始终贴在输入栏上方；
    //    钉顶/短会话（留白远大于占位）仍可下移补足键盘抬升的 K。
    const footerExtra = (keyboardProgressSV?.value ?? 0) * FOOTER_COLLAPSE
    const pinSpacer =
      spacerSV.value +
      manualSpacerSV.value +
      footerExtra +
      bottomContentInset
    // 自然内容高 = 总内容高 - 留白（留白本身也计入内容高度）
    const naturalH = Math.max(0, contentHeightSV.value - pinSpacer)
    const emptyBelow = Math.max(0, viewportHeightSV.value - naturalH)
    // 可安全下移的量 = 最后一条消息与输入栏顶之间真正的空隙
    const safeBlank = Math.max(
      0,
      Math.max(pinSpacer, emptyBelow) - bottomContentInset
    )
    return {
      transform: [
        {
          translateY: Math.min(
            Math.abs(keyboardHeightSV?.value ?? 0),
            safeBlank
          )
        }
      ]
    }
  })

  /**
   * 钉顶目标的「输入栏高度补偿」：输入栏每变高一次，钉顶目标就加上相应的距离，
   * 让内容整体上移（最后一条消息被顶回输入栏上方）。
   * 单独存一份的原因：syncPinTarget / 钉顶收敛每次都会用 getLayout 重算目标，
   * 不把补偿记下来的话，一次 contentSizeChange 就把它擦掉了。
   */
  const pinBottomPadRef = useRef(0)

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
      layout.y +
        (ref?.getFirstItemOffset?.() ?? 0) -
        PIN_TOP_GAP +
        // 输入栏变高后的补偿必须一起算进来，和 syncPinTarget / 收敛窗口保持同一个目标；
        // 否则留白会按「不含补偿」算，maxScroll 追不上新的钉顶位置。
        pinBottomPadRef.current
    )
    // 注意：这里只重算留白，不再写 pinTargetSV —— 目标由 handleMessageLayout /
    // handleThoughtToggle 显式管理，避免动画期间被 recompute 覆盖导致抽动。
    const vh = viewportHRef.current
    const naturalH = naturalHRef.current
    if (vh <= 0 || naturalH <= 0) return
    // 目标：内容总高 = 钉顶位置 + 一屏（⇒ maxScroll === 钉顶位置，钉顶后不能再往上滑）。
    // ⚠️ footer 除 spacer 外还渲染了 manualSpacer / 键盘补偿 / bottomContentInset，
    //    它们都已计入内容总高，而 naturalH 已把它们从 h 里扣掉；若这里只算
    //    `target + vh - naturalH`，maxScroll 会比钉顶位置多出「spacer 之外的 footer 高度」
    //    （≈ 输入栏占位，正好一行气泡的距离）—— 表现为钉顶后还能往上滑一小段。
    const footerExtra =
      manualSpacerSV.value +
      (keyboardProgressSV?.value ?? 0) * FOOTER_COLLAPSE +
      bottomContentInset
    const exact = Math.max(
      0,
      Math.ceil(target + vh + 1 - naturalH - footerExtra)
    )
    if (exact !== spacerSV.value) spacerSV.value = exact
  }, [
    manualSpacerSV,
    scrollViewRef,
    keyboardProgressSV,
    pinTargetSV,
    bottomContentInset
  ])

  /** 从 FlashList 当前 layout 重新计算钉顶目标（只在布局稳定后调用） */
  const syncPinTarget = useCallback(() => {
    const idx = pinnedIndexRef.current
    const ref = scrollViewRef.current as any
    const layout = idx >= 0 ? ref?.getLayout?.(idx) : undefined
    if (!layout) return
    const target = Math.max(
      0,
      layout.y +
        (ref?.getFirstItemOffset?.() ?? 0) -
        PIN_TOP_GAP +
        pinBottomPadRef.current
    )
    pinTargetSV.value = target
    pinTargetBaseRef.current = target
  }, [scrollViewRef, pinTargetSV])

  /**
   * 钉顶收敛窗口：发送后 FlashList 要把新消息从「估算高度」测成「实测高度」需要几帧，
   * 期间 getLayout(pinnedIndex).y 一直在变。若只信第一次 onLayout 的结果，目标可能
   * 偏小 → 视口停在被钉消息上方 → 「新发的消息看不到 / 布局错乱」。
   * 这里在窗口内每帧用 getLayout 重算目标（UI 线程帧回调负责真正滚过去），
   * 数值稳定或超时即停手；用户一碰列表立即停。
   */
  const pinConvergeRafRef = useRef<number | null>(null)
  const stopPinConverge = useCallback(() => {
    if (pinConvergeRafRef.current != null) {
      cancelAnimationFrame(pinConvergeRafRef.current)
      pinConvergeRafRef.current = null
    }
  }, [])
  const startPinConverge = useCallback(() => {
    stopPinConverge()
    const startedAt = Date.now()
    const tick = () => {
      if (Date.now() - startedAt > 900) {
        pinConvergeRafRef.current = null
        return
      }
      const idx = pinnedIndexRef.current
      const ref = scrollViewRef.current as any
      const layout = idx >= 0 ? ref?.getLayout?.(idx) : undefined
      if (layout && !thoughtBusyRef.current && pinTargetSV.value >= 0) {
        const target = Math.max(
          0,
          layout.y +
            (ref?.getFirstItemOffset?.() ?? 0) -
            PIN_TOP_GAP +
            pinBottomPadRef.current
        )
        if (Math.abs(target - pinTargetSV.value) > 0.5) {
          pinTargetSV.value = target
          pinTargetBaseRef.current = target
        }
      }
      pinConvergeRafRef.current = requestAnimationFrame(tick)
    }
    pinConvergeRafRef.current = requestAnimationFrame(tick)
  }, [pinTargetSV, scrollViewRef, stopPinConverge])

  useEffect(() => stopPinConverge, [stopPinConverge])

  // 流式结束后不再清 pinTargetSV：思考框在流式结束后展开/折叠仍要贴顶。
  // 用户一碰（touchedSV）会停手；下次发送/切会话会重置目标。

  // ===== 加载历史贴底 =====
  /** 立即收手（用户触摸 / 发送消息时） */
  const endHistoryBottom = useCallback(() => {
    historyBottomSV.value = 0
    setHistoryFollowActive(false)
  }, [historyBottomSV])

  /**
   * 历史贴底：保持到用户真正触摸列表为止。
   * 旧实现 2.5s 后就收手，长会话的图片/Markdown 在 2.5s 后才完成测量，
   * 内容继续变高时已经没人跟随 → 打开历史会话会慢慢漂离底部。
   */
  const beginHistoryBottom = useCallback(() => {
    if (!APP_PIN_USER_MESSAGE) return
    // 只置标记：真正的「贴底滚动」由 UI 线程帧回调执行（列表可能还停在顶部，
    // 且内容会继续长高）。
    setHistoryFollowActive(true)
    historyBottomSV.value = 1
    pendingFollowSV.value = 1
  }, [historyBottomSV, pendingFollowSV])

  useEffect(
    () => () => {
      if (thoughtSettleRef.current) clearTimeout(thoughtSettleRef.current)
    },
    []
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
      // 新一轮钉顶：输入栏补偿归零（以建立钉顶时的输入栏高度为基准）
      pinBottomPadRef.current = 0
      pinnedMsgIdRef.current = userId
      const nextIndex = displayMessagesRef.current.findIndex(
        (m) => m.id === userId
      )
      pinnedIndexRef.current = nextIndex
      // 用户可能正停在很早的历史位置：新消息不在 FlashList 的渲染窗口里，
      // 它的 onLayout 就永远不会触发，钉顶目标也永远不会建立（表现为
      // SSE 在吐字、滚动条在变，但视口里什么都没有）。
      // 先按 index 把这条消息滚进渲染窗口，保证 onLayout 一定会到。
      if (nextIndex >= 0) {
        // scrollToIndex 在 FlashList 还没把新 data 登记进 layout 时会静默 no-op，
        // 于是下一帧再补一次；一旦 onLayout 已写出 pinTarget 就立即停手。
        const scrollPinnedIntoView = (attempts: number) => {
          if (pinTargetSV.value >= 0) return
          const list = scrollViewRef.current as any
          try {
            list?.scrollToIndex?.({
              index: nextIndex,
              animated: false,
              viewPosition: 0
            })
          } catch {}
          if (attempts > 0) {
            requestAnimationFrame(() => scrollPinnedIntoView(attempts - 1))
          }
        }
        scrollPinnedIntoView(2)
      }
      contentHRef.current = 0
      naturalHRef.current = 0
      // 新消息刚进列表时 FlashList 只有估算高度，让目标在窗口内持续收敛
      startPinConverge()
    },
    [
      endHistoryBottom,
      spacerSV,
      touchedSV,
      pinTargetSV,
      scrollViewRef,
      startPinConverge,
      displayMessagesRef
    ]
  )

  // key={activeId} 会让 ChatArea 每次切会话重挂 → 每个实例只做一次「首次历史落盘」
  const historyLoadedRef = useRef(false)
  const isGeneratingRef = useRef(false)
  isGeneratingRef.current = isGenerating

  useEffect(() => {
    if (!APP_PIN_USER_MESSAGE) return

    // 切会话的详情还在路上：不要用旧 messages 参与「首屏历史 / 新消息」判定。
    // 等 loading 结束、新数据落盘后，再从干净状态走一次历史贴底。
    if (isHistoryLoading) {
      historyLoadedRef.current = false
      prevLastUserIdRef.current = null
      endHistoryBottom()
      // 重新拉历史时清掉上一轮「钉顶/流式留白」的布局状态。
      // 否则同一个会话被再次点开（activeId 不变、ChatArea 不 remount）时，
      // keepSpacer 还在，ListFooter 会留下整屏空白，贴底也会贴到空白后面。
      setKeepSpacer(false)
      spacerSV.value = 0
      manualSpacerSV.value = 0
      pinTargetSV.value = -1
      pinTargetBaseRef.current = -1
      manualSpacerBaseRef.current = 0
      pinnedMsgIdRef.current = null
      pinnedIndexRef.current = -1
      pinBottomPadRef.current = 0
      contentHRef.current = 0
      naturalHRef.current = 0
      touchedSV.value = false
      userTouchedRef.current = false
      pendingFollowSV.value = 0
      lastFollowContentHSV.value = 0
      lastFrameOffsetSV.value = 0
      return
    }

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

    // ② 之后的「最后一条用户消息 id 变化」只有在生成中才算「发送」→ 钉顶。
    //    重新拉取历史时 id 也可能变化（重复 id 归一化、消息同步），
    //    此时必须继续贴底，不能把历史消息钉到视口顶部。
    if (lastUser && lastUserId !== prevLastUserIdRef.current) {
      if (isGeneratingRef.current) {
        pinUserMessage(lastUserId!)
      } else {
        beginHistoryBottom()
      }
    }
    prevLastUserIdRef.current = lastUserId
  }, [
    messages,
    isHistoryLoading,
    beginHistoryBottom,
    endHistoryBottom,
    pinUserMessage
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
    [recomputePinSpacer, syncPinTarget, displayMessagesRef]
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
        (m) => m.id === msgId
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
            pinTargetBaseRef.current + (expanding ? height : -height)
          )
          scheduleOnUI(
            (sv: any, target: number, ms: number, b: number[]) => {
              'worklet'
              if (sv.value < 0) return
              sv.value = withTiming(target, {
                duration: ms,
                easing: Easing.bezier(b[0], b[1], b[2], b[3])
              })
            },
            pinTargetSV,
            pinTargetBaseRef.current,
            THOUGHT_ANIM_MS,
            THOUGHT_ANIM_BEZIER
          )
        }
      } else if (!expanding) {
        // 下方折叠：留白与 ThoughtCollapsible 的折叠动画「同时长同曲线」补高，
        // 动画期间「正文高度 + 留白」恒等于折叠前总高 → maxScroll 不会掉到
        // target 以下被 clamp，也不会出现留白先跳一截的顿挫。
        // 时长/曲线由 utils/chatScroll 的 THOUGHT_ANIM_* 单点定义，显式传进 worklet。
        manualSpacerBaseRef.current += height
        scheduleOnUI(
          (sv: any, m: number, ms: number, b: number[]) => {
            'worklet'
            sv.value = withTiming(m, {
              duration: ms,
              easing: Easing.bezier(b[0], b[1], b[2], b[3])
            })
          },
          manualSpacerSV,
          manualSpacerBaseRef.current,
          THOUGHT_ANIM_MS,
          THOUGHT_ANIM_BEZIER
        )
      }

      // 动画结束后只做一次原子汇总：重算目标 + 把 manual 折算进精确 spacer。
      // 固定 300ms = THOUGHT_ANIM_MS(250) + 约 3 帧掉帧余量；刻意不写成
      // THOUGHT_ANIM_MS + 50，避免调动画时长时顺带把收敛窗口也改掉。
      thoughtSettleRef.current = setTimeout(() => {
        const idx = pinnedIndexRef.current
        const ref = scrollViewRef.current as any
        const layout = idx >= 0 ? ref?.getLayout?.(idx) : undefined
        if (layout) {
          const target = Math.max(
            0,
            layout.y +
              (ref?.getFirstItemOffset?.() ?? 0) -
              PIN_TOP_GAP +
              pinBottomPadRef.current
          )
          const vh = viewportHRef.current
          const ch = contentHRef.current
          const manual = manualSpacerBaseRef.current
          if (vh > 0 && ch > 0) {
            // ch 已含当前留白、manual 和底部占位（bottomContentInset）。
            // 目标仍为「内容总高 = 钉顶位置 + 一屏」：把 manual 折算进 spacer、
            // manual 归零后总高不变，所以这里不能再额外加 bottomContentInset
            //（它会多出一段输入栏占位，钉顶后就能多滑一截）。
            const exact = Math.max(
              0,
              Math.ceil(spacerSV.value + manual + target + vh + 1 - ch)
            )
            manualSpacerBaseRef.current = 0
            pinTargetSV.value = target
            pinTargetBaseRef.current = target
            scheduleOnUI(
              (msp: any, ssp: any, m: number, s: number) => {
                'worklet'
                msp.value = m
                ssp.value = s
              },
              manualSpacerSV,
              spacerSV,
              0,
              exact
            )
          } else {
            pinTargetSV.value = target
            pinTargetBaseRef.current = target
          }
        }
        thoughtBusyRef.current = false
      }, 300)
    },
    [manualSpacerSV, pinTargetSV, scrollViewRef, displayMessagesRef]
  )

  /** 数据层面「空会话」——与键盘无关，决定 hasDataSV / 是否走钉顶 */
  const isEmptyConversation =
    !isHistoryLoading && (!displayMessages || displayMessages.length === 0)

  /**
   * 键盘升起来时把欢迎语收掉：视口被键盘吃掉大半，欢迎语挤在剩下的窄条里既难看
   * 又占位（用户此刻是要打字，不是要看欢迎语）。
   * 注意别直接改 isEmptyConversation —— 它还要喂给 hasDataSV（钉顶的「有没有数据」
   * 判据），键盘状态不该影响那套滚动逻辑。
   */
  const showWelcome = isEmptyConversation && !isKeyboardUp

  // 数据返回（列表挂载）后才允许 scrollTo，避免 uninitialized ref 警告
  useEffect(() => {
    hasDataSV.value = !isEmptyConversation
  }, [isEmptyConversation, hasDataSV])

  const getListFooterHeight = useCallback(() => {
    const pinSpacer =
      spacerVisible && hasViewport
        ? spacerSV.value +
          manualSpacerSV.value +
          (keyboardProgressSV?.value ?? 0) * FOOTER_COLLAPSE
        : 0
    return pinSpacer + bottomContentInset
  }, [
    spacerVisible,
    hasViewport,
    spacerSV,
    manualSpacerSV,
    keyboardProgressSV,
    bottomContentInset
  ])

  const {
    scrollViewProps,
    scrollViewStyle,
    showScrollToBottom,
    handleScrollToBottom,
    outerOffsetSV,
    outerMaxSV,
    viewportOnLayout
  } = useChatScroll({
    activeId,
    streamingRenderMsg,
    displayMessages,
    getFooterHeight: getListFooterHeight
  })

  /**
   * 贴底：**只发一条**原生滚动命令。
   *
   * ⚠️ 不能用 FlashList v2 的 `scrollToEnd`：它是异步两步——
   *   末条未渲染时先 `await scrollToIndex`（内部要走 5 步布局、再等 300ms 才 resolve），
   *   随后 `setTimeout(0)` 再补一次原生 `scrollToEnd`。第二条命令经常落在
   *   「贴底后用户第一次往回拖」期间，把用户直接拽回底部；第二次拖动时没有待执行
   *   命令，所以又恢复正常 —— 这正是回弹现象的主要来源。
   *
   * 目标用 JS 侧最新的内容高/视口高现算（`onContentSizeChange` / `onLayout` 维护），
   * 比共享值 `outerMaxSV` 更不容易滞后。
   *
   * `extraOffset`：调用方已知内容还会长高多少（输入栏变高时 = delta），
   * 但 `onContentSizeChange` 还没回报，需要先加进目标，否则会滚到旧的 max 原地不动。
   */
  const scrollToEndUI = useCallback(
    (animated: boolean, extraOffset = 0) => {
      const baseMax =
        contentHRef.current > 0
          ? contentHRef.current - viewportHRef.current
          : outerMaxSV.value
      const maxOffset = Math.max(0, baseMax) + extraOffset
      const list = scrollViewRef.current as any
      if (list && typeof list.scrollToOffset === 'function') {
        try {
          list.scrollToOffset({ offset: maxOffset, animated })
          return
        } catch {}
      }
      // 兜底：Reanimated 的 scrollTo（目标已现算好，只下发一次）
      scheduleOnUI(
        (ref: any, target: number) => {
          'worklet'
          scrollToWorklet(ref, 0, target, animated)
        },
        scrollViewRef,
        maxOffset
      )
    },
    [scrollViewRef, outerMaxSV]
  )

  /**
   * 输入栏高度变化（出现/移除附件缩略图、多行输入等）时，把内容整体上移相应距离。
   * 否则会出现「底下的距离已经算进 bottomContentInset，但内容没顶上去」——
   * 最后一条消息被新出现的缩略图行盖住。
   *
   * - 钉顶：补偿记进 pinBottomPadRef 并同步重算留白，让 maxScroll 跟着长高，
   *   再把视口滚到新的钉顶目标。
   * - 非钉顶（历史贴底 / 用户停在底部）：内容总高长了 delta，补一次贴底滚动；
   *   `onContentSizeChange` 还没回报新高度，所以目标要显式带上 delta。
   *
   * 放在 useChatScroll 之后：非钉顶分支要用 outerMaxSV / outerOffsetSV 判断
   * 「用户是不是正停在底部」。
   */
  const prevBottomInsetRef = useRef(bottomContentInset)
  /** 挂载时间：进页面输入栏刚量完高度的那次上顶要跳过（和贴底跟随撞在一起） */
  const mountedAtRef = useRef(Date.now())
  useEffect(() => {
    const prev = prevBottomInsetRef.current
    prevBottomInsetRef.current = bottomContentInset
    const delta = bottomContentInset - prev
    if (!APP_PIN_USER_MESSAGE || delta === 0) return
    if (pinTargetSV.value >= 0) {
      // 钉顶：输入栏变高 → 内容整体上移 delta（最后一条消息被顶回输入栏上方）。
      // 补偿记进 pinBottomPadRef，这样 syncPinTarget / 钉顶收敛重算目标时
      // 不会把它擦掉。
      pinBottomPadRef.current += delta
      const next = Math.max(0, pinTargetSV.value + delta)
      pinTargetSV.value = next
      pinTargetBaseRef.current = next
      // 新补偿要立刻反映到留白里：maxScroll 先长高，下面的滚动才不会被 clamp。
      recomputePinSpacer()
      // 上顶：平滑滚到新目标（原生动画滚，UI 线程执行）
      if (!interactingSV.value) {
        scheduleOnUI(
          (ref: any, targetSV: any) => {
            'worklet'
            scrollToWorklet(ref, 0, Math.max(0, targetSV.value), true)
          },
          scrollViewRef,
          pinTargetSV
        )
      }
      return
    }
    // 非钉顶（历史贴底 / 用户停在底部）：输入栏变高（选中图片后出现缩略图行、
    // 多行输入等）→ 底部占位变高、内容总长变高，但列表 offset 不会自己动，
    // 最后一条消息会被新出现的行盖住。用户正停在底部时补一次贴底滚动，
    // 把气泡顶回输入栏上方。
    // ⚠️ 用「变化前的最大可滚距离」判断，且必须没在交互中（否则就是拽人）。
    // ⚠️ 进页面 600ms 内（输入栏刚量完高度）不推：这时候贴底跟随本来就
    //    在滚动，再推一次动画会和用户的第一下拖动抢 —— 表现为「切换后
    //    第一次往回滑被什么东西挡住，第二次才正常」。
    if (
      delta > 0 &&
      Date.now() - mountedAtRef.current > 600 &&
      !interactingSV.value &&
      outerOffsetSV.value > 2 &&
      (isAtBottomRef.current ||
        outerOffsetSV.value >= outerMaxSV.value - delta - 2)
    ) {
      // 上顶：原生动画滚动（UI 线程执行）。
      // ⚠️ 必须带上 delta：此刻 footer 的新高度还只存在 React 状态里，
      //    contentHRef 仍是变化前的内容高，不补 delta 就会滚到旧 max（看起来没顶起来）。
      scrollToEndUI(true, delta)
    }
  }, [
    bottomContentInset,
    pinTargetSV,
    isAtBottomRef,
    interactingSV,
    scrollToEndUI,
    recomputePinSpacer,
    scrollViewRef,
    outerMaxSV,
    outerOffsetSV
  ])

  /**
   * 列表内容尺寸变化：记自然高/总高 + 重算钉顶与留白。
   * ⚠️ 必须 useCallback：它是 FlashList 的 prop，每帧新建一个闭包会让
   * FlashList 重新处理内部 ScrollView（流式期 20×/s）。
   */
  const handleListContentSizeChange = useCallback(
    (_w: number, h: number) => {
      scrollViewProps.onContentSizeChange?.(_w, h)
      if (typeof h === 'number' && h > 0) {
        const keyboardExtra =
          (keyboardProgressSV?.value ?? 0) * FOOTER_COLLAPSE
        naturalHRef.current = Math.max(
          0,
          h -
            (spacerSV.value +
              manualSpacerSV.value +
              keyboardExtra +
              bottomContentInset)
        )
        contentHRef.current = h
        contentHeightSV.value = h
        if (!thoughtBusyRef.current) syncPinTarget()
        recomputePinSpacer()
        // 贴底跟随不在这里做：交给 UI 线程的帧回调（见下面的 useFrameCallback）。
        // 在 JS 侧「内容长高 → 滚回底部」会引入延迟与抢滚动（第一次滑被弹回）。
      }
    },
    [
      scrollViewProps,
      spacerSV,
      manualSpacerSV,
      keyboardProgressSV,
      bottomContentInset,
      syncPinTarget,
      recomputePinSpacer
    ]
  )

  /**
   * 钉顶 / 历史贴底（纯 UI 线程逐帧）：目标由 JS 写共享值，用户一碰立即停手。
   * 只有与当前 offset 相差超过 0.5px 时才下发 scrollTo —— 目标稳定时
   * （钉顶不动、已贴底）不再每帧 dispatch 原生滚动命令。
   *
   * ⚠️ 关键防线：offset 在动 → 说明是**用户正在拖**（不是我滚的），
   *    这时一律不抢滚动。之前「第一次往回滑卡住/回弹」就是抢了用户
   *    拖动中的一帧。内容长高时 offset 不会动（只有 target 变大），
   *    所以这道闸门不会挡住正常的贴底跟随。
   */
  useFrameCallback(() => {
    'worklet'
    framesSinceScrollSV.value += 1
    if (touchedSV.value) return
    if (!hasDataSV.value) return
    if (interactingSV.value) return
    const offset = outerOffsetSV.value
    const moved = Math.abs(offset - lastFrameOffsetSV.value) > 0.5
    lastFrameOffsetSV.value = offset
    if (moved) return
    const isPin = pinTargetSV.value >= 0
    const rawTarget = isPin
      ? pinTargetSV.value
      : historyBottomSV.value === 1 && outerMaxSV.value > 0
        ? outerMaxSV.value
        : -1
    if (rawTarget < 0) return
    // ⚠️ 必须把目标钳到真实可滚区间：pinTargetSV 来自 getLayout()，
    // 代码块出现/高度变化时 layout manager 会滞后几帧，那几帧里
    // target 可能 > outerMaxSV（够不到）。不钳的话 scrollTo 每帧都被 clamp
    // 回 maxScroll，offset 永远追不上 target → 每帧都发一次滚动 →
    // 无限重绘 + 满 CPU（表现为出代码块时气泡被拉长再缩回、界面像卡住）。
    const target = Math.max(0, Math.min(rawTarget, outerMaxSV.value))
    if (target < 0) return
    if (Math.abs(offset - target) <= 0.5) return
    // 钉顶：目标由被钉消息的布局决定，直接跟（不受「内容长高」闸门限制）
    if (isPin) {
      scrollToWorklet(scrollViewRef, 0, target, false)
      return
    }
    // 最近 ~130ms 内有滚动事件 → 用户正在拖/惯性，别抢
    if (framesSinceScrollSV.value <= 8) return
    // 首次贴底：历史刚落盘，列表可能还停在顶部 → 直接滚到底
    if (pendingFollowSV.value === 1) {
      pendingFollowSV.value = 0
      lastFollowContentHSV.value = contentHeightSV.value
      scrollToWorklet(scrollViewRef, 0, target, false)
      return
    }
    // 之后只有「内容又长高了」才继续跟：用户停在底部时图片/Markdown
    // 陆续完成测量，内容一点点变高，这里保持贴底；没有长高就不动，
    // 避免任何无谓的抢滚动。
    const grew = contentHeightSV.value - lastFollowContentHSV.value
    if (grew > 0.5) {
      lastFollowContentHSV.value = contentHeightSV.value
      scrollToWorklet(scrollViewRef, 0, target, false)
    }
  })

  /**
   * 「回到底部」：原生动画滚到内容末尾（只下发一条滚动命令，见 scrollToEndUI）。
   */
  const scrollToBottomUI = useCallback(() => {
    scrollToEndUI(true)
  }, [scrollToEndUI])

  /** 外层 View 的 onLayout：记录视口高 + 通知 useChatScroll */
  const viewportLayoutHandler = useCallback(
    (e: any) => {
      const h = e.nativeEvent.layout.height
      const p = keyboardProgressSV?.value ?? 0
      // closedH：扣除键盘动画期间输入栏可能带来的布局高度差，
      // 得到「键盘收起时的基准视口高」。
      // 键盘动画期间 h 与 p 同步变化，closedH 理论上恒定；布局取整会让它抖 ±1px，
      // 所以只在变化超过 1px 时才更新并重算，避免无谓抖动。
      const closedH = h - p * FOOTER_COLLAPSE
      if (h > 0) setHasViewport(true)
      if (Math.abs(closedH - viewportHRef.current) > 1) {
        viewportHRef.current = closedH
        viewportHeightSV.value = closedH
        recomputePinSpacer()
      }
      viewportOnLayout(e)
    },
    [keyboardProgressSV, recomputePinSpacer, viewportOnLayout, viewportHeightSV]
  )

  const listFooter =
    spacerVisible && hasViewport ? (
      <Animated.View pointerEvents="none">
        <Animated.View style={spacerHeightStyle} />
        {bottomContentInset > 0 && (
          <Animated.View style={{ height: bottomContentInset }} />
        )}
      </Animated.View>
    ) : bottomContentInset > 0 ? (
      <Animated.View
        style={{ height: bottomContentInset }}
        pointerEvents="none"
      />
    ) : null

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
    [scrollViewRef]
  )

  /** 列表的触摸/滚动事件集合：用户一碰 = 接管，贴底跟随与钉顶全部停手 */
  const listInteractionProps = useMemo(
    () => ({
      onScroll: (e: any) => {
        framesSinceScrollSV.value = 0
        scrollViewProps.onScroll?.(e)
      },
      // 用户一碰列表 = 接管：此后不再把视口纠正回钉顶（否则会「滑上去又被拽回」）
      onTouchStart: () => {
        userTouchedRef.current = true
        touchedSV.value = true
        interactingSV.value = true
        stopPinConverge()
        endHistoryBottom()
      },
      onTouchEnd: () => {
        interactingSV.value = false
      },
      onTouchCancel: () => {
        interactingSV.value = false
      },
      onScrollBeginDrag: (e: any) => {
        userTouchedRef.current = true
        touchedSV.value = true
        interactingSV.value = true
        stopPinConverge()
        endHistoryBottom()
        scrollViewProps.onScrollBeginDrag?.(e)
      },
      onScrollEndDrag: () => {
        // 松手即解除「正在交互」；若还有惯性，onMomentumScrollBegin 会再置回
        interactingSV.value = false
      },
      onMomentumScrollBegin: () => {
        interactingSV.value = true
      },
      onMomentumScrollEnd: () => {
        interactingSV.value = false
      },
      // 列表挂载/内容变化时兜底滚到底（历史异步落盘 + 图片加载都会触发）
      onContentSizeChange: handleListContentSizeChange
    }),
    [
      framesSinceScrollSV,
      touchedSV,
      interactingSV,
      scrollViewProps,
      stopPinConverge,
      endHistoryBottom,
      handleListContentSizeChange
    ]
  )

  return {
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
    spacerVisible,
    hasViewport,
    // 历史贴底跟随期间不显示「回到底部」：此时列表正被程序化贴底，
    // 高 distance 是定位过程而非用户上滑，显示按钮属于误报。
    showScrollToBottom: showScrollToBottom && !historyFollowActive,
    showWelcome,
    isEmptyConversation,
    scrollToBottomUI,
    handleScrollToBottom,
    recomputePinSpacer,
    pinnedMsgIdRef
  }
}
