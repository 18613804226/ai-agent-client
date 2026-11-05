import React, { useEffect, useRef } from 'react'
import { Animated, Pressable, Platform, View } from 'react-native'
import { sidebarStyles } from './sidebarStyles'

interface FileEnabledSwitchProps {
  value: boolean
  disabled: boolean
  onValueChange: (value: boolean) => void
  accessibilityLabel: string
  theme: any
}

export function FileEnabledSwitch({
  value,
  disabled,
  onValueChange,
  accessibilityLabel,
  theme
}: FileEnabledSwitchProps) {
  const thumbPosition = useRef(new Animated.Value(value ? 18 : 0)).current

  useEffect(() => {
    Animated.timing(thumbPosition, {
      toValue: value ? 18 : 0,
      duration: 150,
      useNativeDriver: Platform.OS !== 'web'
    }).start()
  }, [thumbPosition, value])

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="启用状态会保存到服务器，并决定文档是否参与检索"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[sidebarStyles.fileEnabledSwitch, disabled && sidebarStyles.fileSwitchDisabled]}
    >
      <View
        style={[
          sidebarStyles.fileSwitchTrack,
          {
            backgroundColor: value
              ? theme.sendBtnActive
              : theme.isDark
                ? '#3A3B3D'
                : theme.border
          }
        ]}
      >
        <Animated.View
          style={[
            sidebarStyles.fileSwitchThumb,
            // boxShadow 三端通用（原生新架构亦支持），替代已废弃的 shadow*
            { boxShadow: theme.isDark ? '0px 1px 3px 0px rgba(0,0,0,0.8)' : '0px 1px 3px 0px rgba(255,255,255,0.8)' },
            { transform: [{ translateX: thumbPosition }] }
          ]}
        />
      </View>
    </Pressable>
  )
}
