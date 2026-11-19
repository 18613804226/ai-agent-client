import React, { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  Easing,
  type SharedValue
} from 'react-native-reanimated'

/**
 * 列表挂载淡入：切会话时 FlashList 首帧用的是估算高度 + initialScrollIndex 定位，
 * 首批 cell 实测完成前位置/高度还会收敛一两百毫秒。直接显示会看到「加载过程」，
 * 用一次短淡入把这段过渡盖掉。
 *
 * 传入 `readySV`（UI 线程共享值，1 = 已贴底并稳定）时，会精准等到贴底落定当帧
 * 才开始淡入（兜底不超过 `maxDelay` ms），避免盲等固定 delay 过早淡入导致
 * 看到「气泡先贴错位、一两帧后再被往上推」。
 *
 * 作为 FlashList 的条件渲染子节点（随列表一起挂载/卸载），天然每次切会话播放一次，
 * 流式追加消息不会重播。
 *
 * ⚠️ 只用 opacity，**不要加 translateY/scale**：Android 的 measureLayout 会把
 * 祖先 transform 算进位置，FlashList 反推的 cell y 会整体偏移（见 ChatArea
 * renderCell 的注释）。opacity 不参与布局，测量不受影响。
 */
export function ListFadeIn({
  children,
  enabled = true,
  readySV = null,
  delay = 90,
  maxDelay = 900,
  duration = 180
}: {
  children: React.ReactNode
  enabled?: boolean
  /** UI 线程就绪信号（1 = 初始贴底已收敛）；不传则退回固定 delay */
  readySV?: SharedValue<number> | null
  /** 未传 readySV 时的固定等待时长 */
  delay?: number
  /** 传了 readySV 时的最长等待兜底，防止异常情况永久透明 */
  maxDelay?: number
  duration?: number
}) {
  const opacity = useSharedValue(enabled ? 0 : 1)
  const started = useSharedValue(enabled ? 0 : 1)

  useAnimatedReaction(
    () => (enabled && readySV ? readySV.value : 0),
    (ready) => {
      if (ready === 1 && started.value === 0) {
        started.value = 1
        opacity.value = withTiming(1, {
          duration,
          easing: Easing.out(Easing.quad)
        })
      }
    },
    [enabled, readySV, duration]
  )

  useEffect(() => {
    if (!enabled) return
    const waitMs = readySV ? maxDelay : delay
    const id = setTimeout(() => {
      if (started.value === 0) {
        started.value = 1
        opacity.value = withTiming(1, {
          duration,
          easing: Easing.out(Easing.quad)
        })
      }
    }, waitMs)
    return () => clearTimeout(id)
  }, [enabled, readySV, delay, maxDelay, duration, opacity, started])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  if (!enabled) return <View style={{ flex: 1 }}>{children}</View>
  return (
    <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>
  )
}
