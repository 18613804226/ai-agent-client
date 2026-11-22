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
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing
} from 'react-native-reanimated'
import type { ThemeType } from '../types/chat'
import { RADIUS } from '../constants/theme'
import { InkTailText } from './markdown/inkTail'
import {
  THOUGHT_ANIM_MS,
  THOUGHT_ANIM_BEZIER,
  getThoughtOpen,
  setThoughtOpen
} from '../utils/chatScroll'

interface ThoughtCollapsibleProps {
  /** 消息 ID：展开状态按它持久化，FlashList 回收 cell 重新挂载后能读回来 */
  messageId: string
  thought: string
  theme: ThemeType
  /** 是否正在流式吐字：吐字结束自动收起思考框（兜底路径） */
  isStreaming?: boolean
  /** 是否正处于活跃思考阶段（含首次思考与正文吐完后再次回到思考） */
  isThinkingActive?: boolean
  /** 是否已输出部分正文后再次回到思考阶段 */
  isRethinking?: boolean
  /** 思考阶段是否已结束（正文开始吐字）—— 立即触发带动画的收起（兜底兼容） */
  thoughtDone?: boolean
  /** 思考框展开/折叠时回调：(expanding, height) —— 用于外层留白同步补偿 */
  onToggle?: (expanding: boolean, height: number) => void
}

/** 活跃思考中的轻量呼吸指示点（仅思考中挂载，静止/历史消息零动画开销） */
export const ThinkingPulseDot = memo(function ThinkingPulseDot({
  color,
  size = 6
}: {
  color: string
  size?: number
}) {
  const pulse = useSharedValue(0.35)

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.28, { duration: 650, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    )
    return () => cancelAnimation(pulse)
  }, [pulse])

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.82 + 0.28 * pulse.value }]
  }))

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color
        },
        dotStyle
      ]}
    />
  )
})

/** 时长与曲线参数来自 utils/chatScroll（与钉顶补偿单点定义），这里只把曲线对象缓存一次 */
const THOUGHT_EASING = Easing.bezier(...THOUGHT_ANIM_BEZIER)

/** 一次点击允许的纵向位移：超过就当滑动，不翻转思考框 */
const TAP_SLOP_Y = 12

// ===================== ThoughtCollapsible =====================
const ThoughtCollapsible = memo(
  function ThoughtCollapsible({
    messageId,
    thought,
    theme,
    isStreaming = false,
    isThinkingActive,
    isRethinking = false,
    thoughtDone = false,
    onToggle
  }: ThoughtCollapsibleProps) {
    /** 优先认外部传入的流式阶段；未传时回退兼容 isStreaming && !thoughtDone */
    const thinkingActive =
      isThinkingActive !== undefined
        ? isThinkingActive
        : Boolean(isStreaming && !thoughtDone)

    /** 惰性初值：挂载时按 msgId 读回上次状态；没记录则仅首轮正在思考展开 / 其余收起。
     *  刻意不走 setOpen —— 初始化绝不能触发 onToggle 的钉顶补偿。 */
    const [isOpen, setIsOpen] = useState(() =>
      getThoughtOpen(messageId, thinkingActive && !isRethinking)
    )
    const contentHeightRef = useRef(0)
    const progress = useSharedValue(isOpen ? 1 : 0)
    /** 按下时的纵坐标，用于把滑动误触挡在 onPress 之外 */
    const pressStartYRef = useRef<number | null>(null)

    // 服务端（模型）偶发在 thought 末尾带换行符（1~2 个），直接进 <Text> 会
    // 渲染成末尾空行（有的一行、有的多行）。渲染前统一裁掉末尾空白。
    const displayThought = thought.trimEnd()

    // ── 思考框内层滚动：原生嵌套滚动（不用自定义 Pan）────────────────────────
    // 内层 ScrollView 用原生滚动（scrollEnabled=内容超高才开）；
    // 外层 FlashList 已开 nestedScrollEnabled → Android 形成「先内后外」的手势交接，
    // 内层贴边继续同方向拖就会自动带动外层气泡。Web 端同理交 DOM 原生处理。
    const THOUGHT_SCROLL_MAX = 200
    const [scrollable, setScrollable] = useState(false)
    /** 是否停留在内容底部：流式增长时若在底部则自动贴底 */
    const followThoughtBottom = useRef(true)
    const scrollViewportRef = useRef<any>(null)
    /** 未超过滚动阈值时的普通 View（还没有 ScrollView 可挂滚轮监听） */
    const plainWrapRef = useRef<any>(null)

    // 内容重新布局：更新「是否需要内层滚动」；活跃思考期间若停在底部则自动贴底
    const handleContentSize = useCallback(
      (h: number) => {
        contentHeightRef.current = h
        const canScroll = h > THOUGHT_SCROLL_MAX + 1
        setScrollable((prev) => (prev === canScroll ? prev : canScroll))
        if (thinkingActive && followThoughtBottom.current) {
          scrollViewportRef.current?.scrollToEnd?.({ animated: false })
        }
      },
      [thinkingActive]
    )

    const handleThoughtScroll = useCallback((e: any) => {
      const y = e.nativeEvent.contentOffset?.y ?? 0
      const h = e.nativeEvent.contentSize?.height ?? 0
      const vh = Math.max(e.nativeEvent.layoutMeasurement?.height ?? 0, 1)
      // 停在底部 → 跟随；内容还没超高（无需滚动，y 必为 0）→ 跟随。
      // 用户往上读到顶部（y≈0 但内容已超高）→ 不再跟随。
      // ⚠️ 旧写法 `y <= 0.5` 把「顶部」误当成「内容还没超高」：用户拉到顶部后
      //    一吐字又被 scrollToEnd 拽回底部。判据必须基于内容高度而非滚动位置。
      followThoughtBottom.current = y + vh >= h - 2 || h <= vh + 0.5
    }, [])

    // Web：滚轮向上时先于 onScroll 关闭贴底。
    // 吐字增长紧跟滚轮事件，若等 onScroll 再脱钩，onContentSizeChange 里的
    // scrollToEnd 早已把视口拉回底部 —— 表现就是「滚上去立刻被拽回来」。
    // 内容还没超过 200px 时没有 ScrollView，就把监听挂到普通 View 上：
    // 用户一开始上翻就先脱钩，避免内容刚涨过阈值翻成 ScrollView 的那一帧被贴一次底。
    useEffect(() => {
      if (Platform.OS !== 'web' || !thinkingActive) return
      const scroller: any = scrollViewportRef.current
      const node: HTMLElement | null = scrollable
        ? (scroller?.getScrollableNode?.() ??
          scroller?.getScrollNode?.() ??
          null)
        : (plainWrapRef.current ?? null)
      if (!node?.addEventListener) return
      const onWheel = (event: WheelEvent) => {
        if (event.deltaY > 0) {
          // 非滚动分支下往回滚 = 用户还在看最新内容，恢复跟随
          if (!scrollable) followThoughtBottom.current = true
        } else if (event.deltaY < 0) {
          followThoughtBottom.current = false
        }
      }
      node.addEventListener('wheel', onWheel, { passive: true })
      return () => node.removeEventListener('wheel', onWheel)
    }, [scrollable, thinkingActive])

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

    const isOpenRef = useRef(isOpen)
    isOpenRef.current = isOpen

    /** 幂等设置展开/收起状态（始终同步更新 isOpenRef 防止同帧两个 effect 双重反转） */
    const setOpen = (nextState: boolean) => {
      if (isOpenRef.current === nextState) return
      const measured = openBodyHRef.current
      const latestTextCap =
        contentHeightRef.current > 0
          ? Math.min(contentHeightRef.current + 4, THOUGHT_SCROLL_MAX)
          : 0
      const expandedH = nextState
        ? Math.max(measured, latestTextCap) || THOUGHT_SCROLL_MAX
        : measured > 0
          ? measured
          : latestTextCap || THOUGHT_SCROLL_MAX
      if (nextState && expandedH > bodyHSV.value) {
        bodyHSV.value = expandedH
      }
      isOpenRef.current = nextState
      onToggle?.(nextState, expandedH)
      setThoughtOpen(messageId, nextState)
      setIsOpen(nextState)
      animateTo(nextState)
      if (nextState && thinkingActiveRef.current) {
        followThoughtBottom.current = true
        requestAnimationFrame(() => {
          if (followThoughtBottom.current) {
            scrollViewportRef.current?.scrollToEnd?.({ animated: false })
          }
        })
      }
    }

    const toggleOpen = () => setOpen(!isOpenRef.current)

    // ── 吐字结束自动折叠 ──────────────────────────────────────────────
    // 只在「流式中 → 结束」的边界触发一次（历史消息挂载时 isStreaming=false，不触发）。
    // ⚠️ 必须走 setOpen(false) 带上 onToggle 补偿：钉顶模式下 handleThoughtToggle
    //    会把 expandedH 按同一条时间轴补进底部留白 / 推进 pinTarget → 动画期间
    //    内容总高恒定 → 不触发 clamp；直接改 progress 绕过补偿 = 视口被拽一下
    //    （历史上的「跳一下」就是这么来的）。
    // 延迟 400ms：错开「落定帧」（尾巴升格成稳定块、光标/墨洇摘除都挤在
    // streaming→false 的那一帧），视觉是「答完 → 片刻 → 思考框收起」。
    const AUTO_COLLAPSE_DELAY_MS = 400
    const wasStreamingRef = useRef(isStreaming)
    const autoCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const setOpenRef = useRef(setOpen)
    setOpenRef.current = setOpen
    const thinkingActiveRef = useRef(thinkingActive)
    thinkingActiveRef.current = thinkingActive
    const isRethinkingRef = useRef(isRethinking)
    isRethinkingRef.current = isRethinking

    useEffect(() => {
      const was = wasStreamingRef.current
      wasStreamingRef.current = isStreaming
      if (was && !isStreaming) {
        if (autoCollapseTimerRef.current) clearTimeout(autoCollapseTimerRef.current)
        autoCollapseTimerRef.current = setTimeout(() => {
          autoCollapseTimerRef.current = null
          // 延迟窗口内用户已手动收起 → 尊重当前状态，不重复动作
          if (isOpenRef.current) setOpenRef.current(false)
        }, AUTO_COLLAPSE_DELAY_MS)
      } else if (!was && isStreaming) {
        // 重新开始吐字（重新生成）：取消还没触发的折叠
        if (autoCollapseTimerRef.current) {
          clearTimeout(autoCollapseTimerRef.current)
          autoCollapseTimerRef.current = null
        }
        // 同一 msgId 原地重新生成且处于首次思考阶段时自动展开；正文之后的二次思考不展开，避免顶动正文
        if (thinkingActiveRef.current && !isRethinkingRef.current && !isOpenRef.current) {
          setOpenRef.current(true)
        }
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

    // ── 思考 <-> 正文阶段状态同步 ────────────────────────────────────────
    // 1. 思考 → 正文（thinkingActive: true → false）：立即带动画平滑收起思考框；
    // 2. 正文 → 再次思考（thinkingActive: false → true）：已有正文后不再自动展开，
    //    避免把下方正文顶下去造成布局跳动（只通过标题「继续思考中…」+ 呼吸点 + 正文底部提示告知用户）；
    //    若当前本就是展开态（如用户手动点开）则贴底跟随最新思考内容；
    // 3. 兜底路径（thought-only/中断）：流结束走上面的 isStreaming 400ms 延迟折叠。
    const wasThinkingActiveRef = useRef(thinkingActive)
    useEffect(() => {
      const was = wasThinkingActiveRef.current
      wasThinkingActiveRef.current = thinkingActive
      if (!isStreaming) return
      if (was && !thinkingActive) {
        if (autoCollapseTimerRef.current) {
          clearTimeout(autoCollapseTimerRef.current)
          autoCollapseTimerRef.current = null
        }
        if (isOpenRef.current) setOpenRef.current(false)
      } else if (!was && thinkingActive) {
        if (autoCollapseTimerRef.current) {
          clearTimeout(autoCollapseTimerRef.current)
          autoCollapseTimerRef.current = null
        }
        if (!isRethinkingRef.current && !isOpenRef.current) {
          setOpenRef.current(true)
        }
        if (isOpenRef.current) {
          followThoughtBottom.current = true
          requestAnimationFrame(() => {
            if (followThoughtBottom.current) {
              scrollViewportRef.current?.scrollToEnd?.({ animated: false })
            }
          })
        }
      }
    }, [thinkingActive, isStreaming])

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

    const thoughtAccentColor = theme.isDark ? '#A855F7' : '#9333EA'
    const activeBorderColor = theme.isDark
      ? 'rgba(168, 85, 247, 0.36)'
      : 'rgba(147, 51, 234, 0.28)'
    const activeSurfaceBg = theme.isDark
      ? 'rgba(168, 85, 247, 0.06)'
      : 'rgba(147, 51, 234, 0.04)'
    const idleSurfaceBg =
      theme.surfaceElevated ??
      (theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')
    const thoughtStatusTitle = thinkingActive
      ? isRethinking
        ? '🧠 继续思考中…'
        : '🧠 深度思考中…'
      : '🧠 已深度思考'
    const headerTitleColor = thinkingActive
      ? (theme.textSecondary ?? theme.textMain)
      : theme.textMuted

    return (
      <View
        style={[
          styles.thoughtBox,
          {
            borderColor: thinkingActive
              ? activeBorderColor
              : (theme.borderSubtle ?? theme.border),
            backgroundColor: thinkingActive ? activeSurfaceBg : idleSurfaceBg,
            ...(Platform.OS === 'web'
              ? ({
                  transitionProperty: 'border-color, background-color',
                  transitionDuration: '200ms',
                  transitionTimingFunction: 'ease'
                } as any)
              : null)
          }
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPressIn={(e) => {
            pressStartYRef.current = e.nativeEvent?.pageY ?? null
          }}
          onPress={(e) => {
            const startY = pressStartYRef.current
            pressStartYRef.current = null
            const endY = e.nativeEvent?.pageY
            // 滑动经过标题栏时 RN 偶发把 touch 判成 tap：纵向位移超阈值就不算点击
            if (
              startY != null &&
              endY != null &&
              Math.abs(endY - startY) > TAP_SLOP_Y
            ) {
              return
            }
            toggleOpen()
          }}
          style={[
            styles.thoughtHeader,
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null
          ]}
        >
          <View style={styles.thoughtTitleRow}>
            <Text style={[styles.thoughtTitle, { color: headerTitleColor }]}>
              {thoughtStatusTitle}
            </Text>
            {thinkingActive ? (
              <ThinkingPulseDot color={thoughtAccentColor} />
            ) : null}
          </View>
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
          style={bodyAnimatedStyle}
          onLayout={(e) => {
            // 只记「完全展开」的实测高度：折叠/展开动画期间量到的是被 maxHeight
            // 裁剪出来的中间值，写进去会把动画高度带偏（越收越小）。
            // 流式增长时 progress 停在 1，逐次上报，最后一次就是折叠前的高度。
            if (!isOpen || progress.value < 0.99) return
            const h = e.nativeEvent.layout.height
            if (h > 0) {
              openBodyHRef.current = h
              bodyHSV.value = h
            }
          }}
        >
          {Platform.OS === 'web' && !scrollable ? (
            // Web：内容不需要滚动时直接渲染文本，不套 overflow:hidden 的
            // ScrollView —— 否则触摸拖到这里带不动外层聊天列表。
            // onLayout 负责测量：流式增长超过阈值后翻成 ScrollView。
            <View
              ref={plainWrapRef}
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
                {thinkingActive ? (
                  <InkTailText
                    text={displayThought}
                    color={theme.textMuted}
                    baseStyle={styles.thoughtContent}
                  />
                ) : (
                  displayThought
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
                {/* 活跃思考期：末尾挂「墨洇」，与正文一致；离开思考阶段后回退纯文本 */}
                {thinkingActive ? (
                  <InkTailText
                    text={displayThought}
                    color={theme.textMuted}
                    baseStyle={styles.thoughtContent}
                  />
                ) : (
                  displayThought
                )}
              </Text>
            </ScrollView>
          )}
        </Animated.View>
      </View>
    )
  },
  (prev, next) =>
    prev.messageId === next.messageId &&
    prev.thought === next.thought &&
    prev.theme === next.theme &&
    prev.isStreaming === next.isStreaming &&
    prev.isThinkingActive === next.isThinkingActive &&
    prev.isRethinking === next.isRethinking &&
    prev.thoughtDone === next.thoughtDone
)

const styles = StyleSheet.create({
  thoughtBox: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderRadius: RADIUS.md
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
  thoughtTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
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
