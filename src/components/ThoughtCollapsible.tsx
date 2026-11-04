import React, { memo, useEffect, useState, useCallback, useRef } from 'react'
import {
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

interface ThoughtCollapsibleProps {
  thought: string
  theme: ThemeType
  /** 是否正在流式吐字：吐字结束自动收起思考框 */
  isStreaming?: boolean
  /** 思考框展开/折叠时回调：(expanding, height) —— 用于外层留白同步补偿 */
  onToggle?: (expanding: boolean, height: number) => void
}

// ===================== ThoughtCollapsible =====================
const ThoughtCollapsible = memo(
  function ThoughtCollapsible({
    thought,
    theme,
    isStreaming = false,
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
        duration: 250,
        easing: Easing.bezier(0.25, 0.1, 0.5, 1)
      })
    }

    const toggleOpen = () => {
      const nextState = !isOpen
      const expandedH =
        contentHeightRef.current > 0
          ? Math.min(contentHeightRef.current, THOUGHT_SCROLL_MAX)
          : THOUGHT_SCROLL_MAX
      onToggle?.(nextState, expandedH)
      setIsOpen(nextState)
      animateTo(nextState)
    }

    // 默认展开、不自动折叠：吐字结束不再收起思考框 → 高度不自动变化，
// 也就不会触发外层滚动的 clamp / 跳动（这正是之前"跳一下"的根源）。
// 用户可以手动点标题栏收起。

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
        </Animated.View>
      </View>
    )
  },
  (prev, next) =>
    prev.thought === next.thought &&
    prev.theme === next.theme &&
    prev.isStreaming === next.isStreaming
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
