import React, {
  memo,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef
} from 'react'
import {
  Platform,
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withDecay,
  scrollTo,
  Easing,
  type SharedValue
} from 'react-native-reanimated'
import {
  INVERTED_CHAT_LIST,
  THOUGHT_EDGE_SCROLL_ENABLED
} from '../utils/chatScroll'
import type { ThemeType } from '../types/chat'

interface ThoughtCollapsibleProps {
  thought: string
  theme: ThemeType
  /** 是否正在流式吐字：吐字结束自动收起思考框 */
  isStreaming?: boolean
  /** 外层列表当前 offset（UI 线程可读），用于贴边联动 */
  outerOffsetSV?: SharedValue<number>
  /** 外层列表最大 offset（UI 线程可读） */
  outerMaxSV?: SharedValue<number>
  /** 外层列表的 animated ref（贴边联动 scrollTo 用） */
  scrollViewRef: any
}

// ===================== ThoughtCollapsible =====================
const ThoughtCollapsible = memo(
  function ThoughtCollapsible({
    thought,
    theme,
    isStreaming = false,
    outerOffsetSV,
    outerMaxSV,
    scrollViewRef
  }: ThoughtCollapsibleProps) {
    const [isOpen, setIsOpen] = useState(!!isStreaming)
    const progress = useSharedValue(isStreaming ? 1 : 0)

    // ── 自定义滚动（不用原生嵌套 ScrollView）────────────────────────────
    // 安卓默认 ScrollView 不是 NestedScrollingParent：外层会在同一帧抢走内层手势，
    // 贴边还会联动外层；走 JS 的 scrollEnabled 方案要等一次 JS 往返，吐字期赶不及。
    // 这里用 gesture-handler 的 Pan（原生线程仲裁）在根视图层吃掉触摸，外层拿不到事件。
    const THOUGHT_SCROLL_MAX = 200
    // 原生 inverted 外层：offset 0 = 底部，往下拖(正 excess) offset 增大；
    // Web 普通列表：scrollTop 0 = 顶部，方向相反。
    const OUTER_SIGN = INVERTED_CHAT_LIST ? 1 : -1
    const contentH = useSharedValue(0)
    const scrollY = useSharedValue(0)
    const startY = useSharedValue(0)
    const startAbsY = useSharedValue(0)
    const lastExcess = useSharedValue(0)
    const outerBase = useSharedValue(0)
    const outerPos = useSharedValue(-1)
    const dragging = useSharedValue(false)
    const followThoughtBottom = useSharedValue(true)
    const [scrollable, setScrollable] = useState(false)
    const scrollViewportRef = useRef<any>(null)

    // 贴边联动：外层 offset 由 UI 线程 scrollTo 直接驱动（丝滑 + withDecay 惯性）
    useAnimatedReaction(
      () => outerPos.value,
      (v) => {
        if (v >= 0) scrollTo(scrollViewRef, 0, v, false)
      }
    )

    const pan = useMemo(
      () =>
        Gesture.Pan()
          .enabled(scrollable)
          // 激活阈值低于安卓 touchSlop，确保在根视图层先于外层 ScrollView 抢到手势
          .activeOffsetY([-4, 4])
          .shouldCancelWhenOutside(false)
          .onBegin((e) => {
            startY.value = scrollY.value
            startAbsY.value = e.absoluteY
            lastExcess.value = 0
            outerBase.value = outerOffsetSV ? outerOffsetSV.value : 0
            dragging.value = true
          })
          .onUpdate((e) => {
            const min = Math.min(0, THOUGHT_SCROLL_MAX - contentH.value)
            // 用 absoluteY（屏幕坐标）算位移：外层滚动会让本视图移动，
            // 若用 translationY 会被自身移动污染，形成自激
            const desired = startY.value + (e.absoluteY - startAbsY.value)
            const clamped = Math.max(min, Math.min(0, desired))
            scrollY.value = clamped
            followThoughtBottom.value = clamped <= min + 1
            // 滚到边界后多出来的位移交给外层（THOUGHT_EDGE_SCROLL_ENABLED 关闭则锁死）
            const excess = desired - clamped
            lastExcess.value = excess
            if (THOUGHT_EDGE_SCROLL_ENABLED && outerMaxSV) {
              outerPos.value = Math.max(
                0,
                Math.min(
                  outerMaxSV.value,
                  outerBase.value + OUTER_SIGN * excess
                )
              )
            }
          })
          .onEnd((e) => {
            const min = Math.min(0, THOUGHT_SCROLL_MAX - contentH.value)
            if (
              THOUGHT_EDGE_SCROLL_ENABLED &&
              lastExcess.value !== 0 &&
              outerMaxSV
            ) {
              // 贴边时惯性交给外层（velocity×0.6、deceleration 0.997 更跟手、不飘）
              outerPos.value = withDecay({
                velocity: OUTER_SIGN * e.velocityY * 0.6,
                clamp: [0, outerMaxSV.value],
                deceleration: 0.997
              })
            } else {
              scrollY.value = withDecay({
                velocity: e.velocityY * 0.6,
                clamp: [min, 0],
                deceleration: 0.997
              })
            }
          })
          .onFinalize(() => {
            dragging.value = false
          }),
      [
        scrollable,
        outerOffsetSV,
        outerMaxSV,
        scrollViewRef,
        followThoughtBottom
      ]
    )

    const scrollStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: scrollY.value }]
    }))

    // 内容重新布局：更新「是否需要内层滚动」；吐字期自动贴底
    const handleContentSize = useCallback(
      (h: number) => {
        contentH.value = h
        const canScroll = h > THOUGHT_SCROLL_MAX + 1
        setScrollable((prev) => (prev === canScroll ? prev : canScroll))
        if (isStreaming && followThoughtBottom.value && !dragging.value) {
          scrollY.value = Math.min(0, THOUGHT_SCROLL_MAX - h)
        } else if (!canScroll) {
          scrollY.value = 0
        } else {
          scrollY.value = Math.max(
            Math.min(0, THOUGHT_SCROLL_MAX - h),
            Math.min(0, scrollY.value)
          )
        }
      },
      [isStreaming, followThoughtBottom]
    )

    const handleWebWheel = useCallback(
      (event: WheelEvent) => {
        if (!isOpen || !scrollable) return
        event.preventDefault?.()
        event.stopPropagation?.()
        const min = Math.min(0, THOUGHT_SCROLL_MAX - contentH.value)
        const nextY = Math.max(
          min,
          Math.min(0, scrollY.value - (event.deltaY ?? 0))
        )
        scrollY.value = nextY
        followThoughtBottom.value = nextY <= min + 1
      },
      [isOpen, scrollable, followThoughtBottom]
    )

    useEffect(() => {
      if (Platform.OS !== 'web') return
      const scrollView = scrollViewportRef.current
      const node =
        (typeof scrollView?.getScrollableNode === 'function' &&
          scrollView.getScrollableNode()) ||
        (typeof scrollView?.getInnerViewNode === 'function' &&
          scrollView.getInnerViewNode()) ||
        null
      if (!node) return

      node.addEventListener('wheel', handleWebWheel, {
        capture: true,
        passive: false
      })
      return () =>
        node.removeEventListener('wheel', handleWebWheel, { capture: true })
    }, [handleWebWheel])

    const animateTo = (open: boolean) => {
      progress.value = withTiming(open ? 1 : 0, {
        duration: 250,
        easing: Easing.bezier(0.25, 0.1, 0.5, 1)
      })
    }

    const toggleOpen = () => {
      const nextState = !isOpen
      setIsOpen(nextState)
      animateTo(nextState)
    }

    // 吐字结束自动收起思考框（用户可再手动点开）
    useEffect(() => {
      if (!isStreaming) {
        setIsOpen(false)
        animateTo(false)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isStreaming])

    // 思考内容流式增长时自动贴到底部（见 handleContentSize：内容重排时贴底）

    const bodyAnimatedStyle = useAnimatedStyle(() => ({
      opacity: progress.value,
      transform: [{ translateY: (1 - progress.value) * -8 }],
      maxHeight: progress.value * 300,
      overflow: 'hidden' as const
    }))

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
          onPress={toggleOpen}
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
        <Animated.View style={bodyAnimatedStyle}>
          <ScrollView
            ref={scrollViewportRef}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: THOUGHT_SCROLL_MAX }}
            onContentSizeChange={(_w, h) => handleContentSize(h)}
          >
            <GestureDetector gesture={pan}>
              <Animated.View style={scrollStyle}>
                <Text
                  style={[
                    styles.thoughtContent,
                    { color: theme.textMuted, marginTop: 4 }
                  ]}
                >
                  {thought}
                </Text>
              </Animated.View>
            </GestureDetector>
          </ScrollView>
        </Animated.View>
      </View>
    )
  },
  (prev, next) =>
    prev.thought === next.thought &&
    prev.theme === next.theme &&
    prev.isStreaming === next.isStreaming &&
    prev.scrollViewRef === next.scrollViewRef
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
