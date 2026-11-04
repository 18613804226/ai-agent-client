import React, { useEffect } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing
} from 'react-native-reanimated'
import type { ThemeType } from '../../types/chat'
import { chatAreaStyles as styles } from './chatAreaStyles'

/**
 * 空会话欢迎语（淡入淡出）。用共享值 + withTiming 走 UI 线程，
 * 避免键盘动画期间每帧过 JS bridge。隐藏后仍挂在树上（opacity 0 +
 * pointerEvents none），重新显示时直接淡回来，不用等挂载。
 */
export function WelcomeOverlay({
  visible,
  theme
}: {
  visible: boolean
  theme: ThemeType
}) {
  const welcomeOpacity = useSharedValue(0)
  useEffect(() => {
    welcomeOpacity.value = withTiming(visible ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.quad)
    })
  }, [visible, welcomeOpacity])
  const welcomeStyle = useAnimatedStyle(() => ({
    opacity: welcomeOpacity.value,
    transform: [{ translateY: (1 - welcomeOpacity.value) * 10 }]
  }))

  if (!visible) return null
  return (
    <Animated.View
      style={[styles.welcomeOverlay, welcomeStyle]}
      pointerEvents="none"
    >
      <View style={styles.emptyContainer}>
        <Text style={styles.welcomeEmoji}>👋</Text>
        <Text style={[styles.welcomeTitle, { color: theme.textMain }]}>
          你好，欢迎使用 AI 智能体
        </Text>
        <Text
          style={[styles.welcomeSubtitle, { color: theme.textMuted }]}
        >
          今天有什么想聊的？
        </Text>
      </View>
    </Animated.View>
  )
}
