import React, { memo, useEffect, useState, useCallback, useRef } from 'react'
import {
  Platform,
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing
} from 'react-native-reanimated'
import type { ThemeType } from '../types/chat'
import { InkTailText } from './markdown/inkTail'
import {
  THOUGHT_ANIM_MS,
  THOUGHT_ANIM_BEZIER
} from '../utils/chatScroll'

interface ThoughtCollapsibleProps {
  thought: string
  theme: ThemeType
  /** 是否正在流式吐字：吐字结束自动收起思考框（兜底路径） */
  isStreaming?: boolean
  /** 思考阶段是否已结束（正文开始吐字）—— 立即触发带动画的收起 */
  thoughtDone?: boolean
  /** 思考框展开/折叠时回调：(expanding, height) —— 用于外层留白同步补偿 */
  onToggle?: (expanding: boolean, height: number) => void
}

/** 时长与曲线参数来自 utils/chatScroll（与钉顶补偿单点定义），这里只把曲线对象缓存一次 */
const THOUGHT_EASING = Easing.bezier(...THOUGHT_ANIM_BEZIER)

/**
 * Web：把折叠动画的重排 / 重绘限制在思考框内部，不波及整条消息和 FlashList。
 * 放静态 style 数组里、不进 worklet；原生端为 null（RN style 数组允许）。
 */
const WEB_BODY_CONTAIN =
  Platform.OS === 'web' ? ({ contain: 'layout paint' } as any) : null

// ===================== ThoughtCollapsible =====================
const ThoughtCollapsible = memo(
  function ThoughtCollapsible({
    thought,
    theme,
    isStreaming = false,
    thoughtDone = false,
    onToggle
  }: ThoughtCollapsibleProps) {
    const [isOpen, setIsOpen] = useState(true)
    const contentHeightRef = useRef(0)
    const progress = useSharedValue(1)

    // ── 思考框内层滚动：原生嵌套滚动（不用自定义 Pan）────────────────────────
    // 内层 ScrollView 用原生滚动（scrollEnabled=内容超高才开）；
    // 外层 FlashList 已开 nestedScrollEnabled → Android 形成「先内后外」的手势交接，
    // 内层贴边继续同方向拖就会自动带动外层气泡。Web 端同理交 DOM 原生处理。
    const THOUGHT_SCROLL_MAX = 200
    const [scrollable, setScrollable] = useState(false)
    /** 是否停留在内容底部：流式增长时若在底部则自动贴底 */
    const followThoughtBottom = useRef(true)
    const scrollViewportRef = useRef<any>(null)

    // 内容重新布局：更新「是否需要内层滚动」；吐字期若停在底部则自动贴底
    const handleContentSize = useCallback(
      (h: number) => {
        contentHeightRef.current = h
        const canScroll = h > THOUGHT_SCROLL_MAX + 1
        setScrollable((prev) => (prev === canScroll ? prev : canScroll))
        if (isStreaming && followThoughtBottom.current) {
          scrollViewportRef.current?.scrollToEnd?.({ animated: false })
        }
      },
      [isStreaming]
    )

    const handleThoughtScroll = useCallback((e: any) => {
      const y = e.nativeEvent.contentOffset?.y ?? 0
      const h = e.nativeEvent.contentSize?.height ?? 0
      const vh = Math.max(e.nativeEvent.layoutMeasurement?.height ?? 0, 1)
      // 在底部（或内容还没超高）保持跟随；用户往上读 → 停在原位、不再自动贴底
      followThoughtBottom.current = y + vh >= h - 2 || y <= 0.5
    }, [])

    const animateTo = (open: boolean) => {
      progress.value = withTiming(open ? 1 : 0, {
        duration: THOUGHT_ANIM_MS,
        easing: THOUGHT_EASING
      })
    }

    /** 折叠补偿高度：用「展开态实测的 body 高度」（含滚动视口、margin），
     *  比只算正文内容更准 —— 钉顶补偿若少算，动画期间内容净高偏小，
     *  maxScroll 短暂低于钉顶目标 → 视口会被 clamp 小抖一下。 */
    const openBodyHRef = useRef(0)

    /** 同一份实测高度的 UI 线程副本：折叠时按真实高度收。
     *  固定 maxHeight(旧实现是 300) 会在动画前 1/3 出现「只淡不收」的死区，
     *  收尾阶段才猛地一缩 —— 这就是「一下锁起来」的来源。 */
    const bodyHSV = useSharedValue(300)

    /** 展开/折叠。总是走 onToggle 补偿：钉顶的留白与折叠动画同帧起步，
     *  动画期间内容总高不变 → 不会被 clamp 拽动。 */
    const toggleOpen = () => {
      const nextState = !isOpen
      const measured = openBodyHRef.current
      const expandedH =
        measured > 0
          ? measured
          : contentHeightRef.current > 0
            ? Math.min(contentHeightRef.current, THOUGHT_SCROLL_MAX)
            : THOUGHT_SCROLL_MAX
      onToggle?.(nextState, expandedH)
      setIsOpen(nextState)
      animateTo(nextState)
    }

    // ── 吐字结束自动折叠 ──────────────────────────────────────────────
    // 只在「流式中 → 结束」的边界触发一次（历史消息挂载时 isStreaming=false，不触发）。
    // ⚠️ 必须走 toggleOpen() 带上 onToggle 补偿：钉顶模式下 handleThoughtToggle
    //    会把 expandedH 按同一条时间轴补进底部留白 / 推进 pinTarget → 动画期间
    //    内容总高恒定 → 不触发 clamp；直接改 progress 绕过补偿 = 视口被拽一下
    //    （历史上的「跳一下」就是这么来的）。
    // 延迟 400ms：错开「落定帧」（尾巴升格成稳定块、光标/墨洇摘除都挤在
    // streaming→false 的那一帧），视觉是「答完 → 片刻 → 思考框收起」。
    const AUTO_COLLAPSE_DELAY_MS = 400
    const wasStreamingRef = useRef(isStreaming)
    const autoCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isOpenRef = useRef(isOpen)
    isOpenRef.current = isOpen
    const toggleOpenRef = useRef(toggleOpen)
    toggleOpenRef.current = toggleOpen

    useEffect(() => {
      const was = wasStreamingRef.current
      wasStreamingRef.current = isStreaming
      if (was && !isStreaming) {
        if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current)
        autoCollapseTimerRef.current = setTimeout(() => {
          autoCollapseTimerRef.current = null
          // 延迟窗口内用户已手动收起 → 尊重当前状态，不重复动作
          if (isOpenRef.current) toggleOpenRef.current()
        }, AUTO_COLLAPSE_DELAY_MS)
      } else if (isStreaming && autoCollapseTimerRef.current) {
        // 重新开始吐字（重新生成）：取消还没触发的折叠
        clearTimeout(autoCollapseTimerRef.current)
        autoCollapseTimerRef.current = null
      }
      return () => {
        // 依赖只有 isStreaming：普通重渲染不会重跑本 effect，不会误杀定时器；
        // 只在 isStreaming 变化 / 卸载时清理（防卸载后 setState）
        if (autoCollapseTimerRef.current) {
          clearTimeout(autoCollapseTimerRef.current)
          autoCollapseTimerRef.current = null
        }
      }
    }, [isStreaming])

    // ── 思考阶段结束（正文开始吐字）→ 顺手收起 ────────────────────────
    // 流式层按 type: 'thought' | 'content' 分阶段推送；ChatMessageItem 传入的
    // thoughtDone =「正文已有内容」，第一个 content 片段到达即阶段边界。
    // 零延迟触发，但走正常时长动画（250ms）：正文刚开始吐字，折叠与补偿同步进行，
    // 视觉上是「思考框退场、正文登场」，而不是被「啪」地锁上。
    // 兜底路径（thought-only/中断：正文始终没来）仍走上面的 isStreaming 400ms。
    const wasThoughtDoneRef = useRef(thoughtDone)
    useEffect(() => {
      const was = wasThoughtDoneRef.current
      wasThoughtDoneRef.current = thoughtDone
      if (!was && thoughtDone && isOpenRef.current) {
        toggleOpenRef.current()
      }
    }, [thoughtDone])

    // 思考内容流式增长时自动贴到底部（见 handleContentSize：内容重排时贴底）
    // 手动点标题栏可随时展开/收起；自动折叠后想再看就点一下展开。

    const bodyAnimatedStyle = useAnimatedStyle(() => {
      const p = progress.value
      return {
        // 淡出与收高共用 p：文字透明度随时间轴同步衰减，不会「先裁一刀再消失」
        opacity: p,
        transform: [{ translateY: (1 - p) * -6 }],
        // 按实测高度收（不再是固定 300 的死区），展开态给足余量不裁剪
        maxHeight: p >= 1 ? 9999 : Math.max(0, p * bodyHSV.value),
        overflow: 'hidden' as const
      }
    })

    const arrowAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ rotate: `${progress.value * 180}deg` }]
    }))

    return (
      <View
        style={[
          styles.thoughtBox,
          {
            borderColor: theme.border,
            backgroundColor: theme.isDark
              ? 'rgba(255,255,255,0.03)'
              : 'rgba(0,0,0,0.03)'
          }
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleOpen()}
          style={styles.thoughtHeader}
        >
          <Text style={[styles.thoughtTitle, { color: theme.textMuted }]}>
            🧠 已深度思考
          </Text>
          <View style={styles.thoughtRightAction}>
            <Text
              style={{ color: theme.textMuted, fontSize: 12, marginRight: 4 }}
            >
              {isOpen ? '收起' : '展开'}
            </Text>
            <Animated.View style={arrowAnimatedStyle}>
              <Svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <Path
                  d="M6 9l6 6 6-6"
                  stroke={theme.textMuted}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Animated.View>
          </View>
        </TouchableOpacity>
        <Animated.View
          style={[bodyAnimatedStyle, WEB_BODY_CONTAIN]}
          // 折叠期间不挂 onLayout：动画每帧改 maxHeight 都会派一次布局事件到 JS，
          // 而这段时间量到的都是被裁剪的中间值、本来就会被守卫丢掉。
          // 不挂 handler 直接省掉这 ~15 次跨线程往返；展开时重新挂上测量。
          onLayout={
            isOpen
              ? (e) => {
                  // 只记「完全展开」的实测高度：展开动画期间量到的是裁剪值。
                  if (progress.value < 0.99) return
                  const h = e.nativeEvent.layout.height
                  if (h > 0) {
                    openBodyHRef.current = h
                    bodyHSV.value = h
                  }
                }
              : undefined
          }
        >
          {Platform.OS === 'web' && !scrollable ? (
            // Web：内容不需要滚动时直接渲染文本，不套 overflow:hidden 的
            // ScrollView —— 否则触摸拖到这里带不动外层聊天列表。
            // onLayout 负责测量：流式增长超过阈值后翻成 ScrollView。
            <View
              onLayout={(e) =>
                handleContentSize(e.nativeEvent.layout.height)
              }
            >
              <Text
                style={[
                  styles.thoughtContent,
                  { color: theme.textMuted, marginTop: 4 }
                ]}
              >
                {isStreaming ? (
                  <InkTailText
                    text={thought}
                    color={theme.textMuted}
                    baseStyle={styles.thoughtContent}
                  />
                ) : (
                  thought
                )}
              </Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollViewportRef}
              scrollEnabled={scrollable}
              // Android：参与嵌套滚动（内层滚到头自动交接给外层）
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: THOUGHT_SCROLL_MAX }}
              onContentSizeChange={(_w, h) => handleContentSize(h)}
              onScroll={handleThoughtScroll}
              scrollEventThrottle={16}
            >
              <Text
                style={[
                  styles.thoughtContent,
                  { color: theme.textMuted, marginTop: 4 }
                ]}
              >
                {/* 流式期间：末尾挂「墨洇」，与正文一致；结束落定后回退纯文本 */}
                {isStreaming ? (
                  <InkTailText
                    text={thought}
                    color={theme.textMuted}
                    baseStyle={styles.thoughtContent}
                  />
                ) : (
                  thought
                )}
              </Text>
            </ScrollView>
          )}
        </Animated.View>
      </View>
    )
  },
  (prev, next) =>
    prev.thought === next.thought &&
    prev.theme === next.theme &&
    prev.isStreaming === next.isStreaming &&
    prev.thoughtDone === next.thoughtDone
)

const styles = StyleSheet.create({
  thoughtBox: {
    borderLeftWidth: 0,
    borderLeftColor: '#4b92ee',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
    borderRadius: 4
  },
  thoughtRightAction: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  thoughtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  thoughtTitle: {
    fontSize: 12,
    fontWeight: '600',
    paddingRight: 2
  },
  thoughtContent: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18
  }
})

export default ThoughtCollapsible
