import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  View
} from 'react-native'
import { inputBarStyles } from './inputBarStyles'

/**
 * 语音模式 UI（纯搬运自 ChatInputBar.tsx）：「按住说话」按钮 + 录音脉冲/光晕动画。
 * 所有录音状态由外部传入，这里只负责展示与按压交互。
 */
export function VoiceModeUI({
  theme,
  isRecording,
  isRecognizing,
  disabled,
  onPressIn,
  onPressOut,
  voiceCallout
}: {
  theme: any
  isRecording: boolean
  isRecognizing: boolean
  disabled: boolean
  onPressIn: () => void
  onPressOut: () => void
  voiceCallout: {
    ref: any
    suppressStyle: any
    contextMenuGuard: (e: any) => void
  }
}) {
  // 🖥️ Web：「按住说话」按钮悬停态
  const [isVoiceHover, setIsVoiceHover] = useState(false)
  const isWeb = Platform.OS === 'web'

  // ---- 录音科技感动画----
  const pulse = useRef(new Animated.Value(0)).current
  const glow = useRef(new Animated.Value(0)).current
  const useNative = Platform.OS !== 'web'
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.ease),
            useNativeDriver: useNative
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 0,
            useNativeDriver: useNative
          })
        ])
      ).start()

      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: useNative
          }),
          Animated.timing(glow, {
            toValue: 0.3,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: useNative
          })
        ])
      ).start()
    } else {
      pulse.stopAnimation()
      glow.stopAnimation()
      pulse.setValue(0)
      glow.setValue(0)
    }
  }, [isRecording, pulse, glow])

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.35]
  })
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0]
  })

  return (
    <View style={inputBarStyles.voiceHoldWrap}>
      {/* 脉冲外圈 */}
      {isRecording && (
        <Animated.View
          style={[
            inputBarStyles.pulseRing,
            { pointerEvents: 'none' },
            {
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity
            }
          ]}
        />
      )}

      <Pressable
        ref={voiceCallout.ref}
        style={[
          inputBarStyles.voiceHoldBtn,
          voiceCallout.suppressStyle,
          isRecording && inputBarStyles.voiceHoldBtnActive,
          { backgroundColor: theme.historyActiveBg },
          // 🖥️ Web：悬停青色提亮（与按钮青色描边同色系）
          isWeb &&
          ({
            transitionProperty: 'background-color, border-color',
            transitionDuration: '0.15s',
            transitionTimingFunction: 'ease',
            cursor: 'pointer'
          } as any),
          isWeb && isVoiceHover && !isRecording
            ? {
              backgroundColor: theme.isDark
                ? 'rgba(0, 229, 255, 0.12)'
                : 'rgba(0, 120, 150, 0.08)',
              borderColor: 'rgba(0, 229, 255, 0.5)'
            }
            : null
        ]}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        // @ts-ignore
        onMouseEnter={() => setIsVoiceHover(true)}
        // @ts-ignore
        onMouseLeave={() => setIsVoiceHover(false)}
        // ⚠️ OPPO/ColorOS 等国产浏览器：长按会弹系统「复制/全选」菜单并抢走
        // 按压事件，导致按住说话被打断。这里直接禁掉该按钮的上下文菜单。
        // @ts-ignore RNW 透传到 DOM 的 onContextMenu
        onContextMenu={voiceCallout.contextMenuGuard}
      >
        {isRecording && (
          <Animated.View
            style={[inputBarStyles.recDot, { opacity: glow }]}
          />
        )}
        <Text
          style={[
            inputBarStyles.voiceHoldText,
            { color: isRecording ? '#00E5FF' : theme.textMain },
            isRecording && inputBarStyles.voiceHoldTextActive
          ]}
        >
          {isRecognizing
            ? '识别中…'
            : isRecording
              ? '松开 结束'
              : '按住 说话'}
        </Text>
      </Pressable>
    </View>
  )
}
