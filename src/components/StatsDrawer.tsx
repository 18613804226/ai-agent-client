import React, { useEffect, useMemo } from 'react'
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView
} from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'

interface StatsDrawerTheme {
  isDark: boolean
  textMain: string
  textMuted: string
  border: string
}

/** 统计详情的一节：标题 + 若干行；hint 节（口径说明）排脚注样式 */
export interface StatsSection {
  title: string
  rows: string[]
  hint?: boolean
}

/**
 * 底部抽屉：放窄屏 meta 行装不下的统计明细与口径说明。
 *
 * 用 Modal 挂到根视图，所以**不会把聊天气泡下方的内容顶开** —— 之前的
 * 「行内展开」会让整条消息变高，把下面的消息挤走。
 * 动画自己用 sharedValue 驱动（不用 entering/exiting）：项目里 PopAnim 也是
 * 这么做的，reanimated 在 RNW 兼容模式下的布局动画不稳定。
 */
export default function StatsDrawer({
  visible,
  onClose,
  sections,
  theme
}: {
  visible: boolean
  onClose: () => void
  sections: StatsSection[]
  theme: StatsDrawerTheme
}) {
  const t = useSharedValue(0)
  /** 手指下拉的实时位移（只允许向下，向上拖不动） */
  const dragY = useSharedValue(0)
  /** 正文限高：屏高 62%，尽量整屏放下全部分节不滚动 */
  const bodyMaxHeight = Dimensions.get('window').height * 0.62

  useEffect(() => {
    // 关闭时归零（此时不渲染，无退出动画），保证下次打开从底部重新滑入、
    // 且不会残留上一次下拉的位移
    dragY.value = 0
    t.value = visible
      ? withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) })
      : 0
  }, [visible, t, dragY])

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          dragY.value = Math.max(0, e.translationY)
        })
        .onEnd((e) => {
          // 拖过 110px，或快速下滑（>900px/s）→ 关闭；否则弹回原位
          if (e.translationY > 110 || e.velocityY > 900) {
            runOnJS(onClose)()
          } else {
            dragY.value = withSpring(0, { damping: 26, stiffness: 500 })
          }
        })
        .onFinalize(() => {
          // 手势被系统/其他手势打断时也要复位，避免卡片停在半路
          if (dragY.value > 0) {
            dragY.value = withSpring(0, { damping: 26, stiffness: 500 })
          }
        }),
    [dragY, onClose]
  )

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [
      { translateY: (1 - t.value) * 280 + dragY.value }
    ]
  }))

  /** 下拉时遮罩跟着变淡，手势反馈更连贯 */
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: t.value * Math.max(0.25, 1 - dragY.value / 400)
  }))

  if (!visible) return null

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {/* Modal 是独立的原生视图层级，RNGH 手势必须自带 RootView ——
          否则它落在 App 根的 GestureHandlerRootView 之外，手势完全不响应 */}
      <GestureHandlerRootView style={styles.overlay}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.backdropPress} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            sheetStyle,
            styles.sheet,
            {
              backgroundColor: theme.isDark ? '#212225' : '#FFFFFF',
              borderColor: theme.border
            }
          ]}
        >
          {/* 下滑关闭只挂在顶部把手/标题区：内容区要留给 ScrollView，
              否则 Pan 会和原生滚动抢手势，正文滚不动。
              动画仍作用在外层整张卡片上，拖把手时整卡跟着走。 */}
          <GestureDetector gesture={pan}>
            <View style={styles.grabArea}>
              <View
                style={[styles.handle, { backgroundColor: theme.border }]}
              />
              <Text style={[styles.title, { color: theme.textMain }]}>
                本轮统计
              </Text>
            </View>
          </GestureDetector>

          {/* 字段全表 + 口径说明比较长，限高后内部滚动，别把抽屉顶到屏幕外。
              分节排版：标题一行、数据各自一行，不再糊成一整段缩进文本 */}
          <ScrollView
            style={{ maxHeight: bodyMaxHeight }}
            showsVerticalScrollIndicator={false}
          >
            {sections.map((s, idx) => (
              <View
                key={s.title}
                style={idx > 0 ? styles.sectionSpacing : null}
              >
                {s.hint ? (
                  <View
                    style={[styles.divider, { backgroundColor: theme.border }]}
                  />
                ) : null}
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: theme.textMuted }
                  ]}
                >
                  {s.title}
                </Text>
                {s.rows.map((r, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.row,
                      s.hint && styles.hintRow,
                      { color: s.hint ? theme.textMuted : theme.textMain }
                    ]}
                  >
                    {r}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)'
  },
  backdropPress: { flex: 1 },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 24
  },
  grabArea: { paddingBottom: 4 },
  handle: {
    width: 32,
    height: 3,
    borderRadius: 1.5,
    alignSelf: 'center',
    marginBottom: 8
  },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  /** 脚注节（口径）与数据节之间的分隔线 */
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 3
  },
  sectionSpacing: { marginTop: 13 },
  row: { fontSize: 13, lineHeight: 21 },
  hintRow: { fontSize: 12, lineHeight: 19 }
})
