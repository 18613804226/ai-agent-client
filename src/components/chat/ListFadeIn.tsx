import React, { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing
} from 'react-native-reanimated'

/**
 * 列表挂载淡入：切会话时 FlashList 首帧用的是估算高度 + initialScrollIndex 定位，
 * 首批 cell 实测完成前位置/高度还会收敛一两百毫秒。直接显示会看到「加载过程」，
 * 用一次短淡入把这段过渡盖掉。
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
  delay = 90,
  duration = 220
}: {
  children: React.ReactNode
  enabled?: boolean
  /** 等初始定位 + 首批布局落定再开始淡入 */
  delay?: number
  duration?: number
}) {
  const opacity = useSharedValue(enabled ? 0 : 1)

  useEffect(() => {
    if (!enabled) return
    // 延迟期间保持全透明，把 initialScrollIndex 的定位和首批真实测量盖在后面；
    // 当前 Reanimated 的 TimingConfig 没有 delay，用 setTimeout 启动。
    const id = setTimeout(() => {
      opacity.value = withTiming(1, {
        duration,
        easing: Easing.out(Easing.quad)
      })
    }, delay)
    return () => clearTimeout(id)
  }, [enabled, delay, duration, opacity])

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))

  if (!enabled) return <View style={{ flex: 1 }}>{children}</View>
  return (
    <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>
  )
}
