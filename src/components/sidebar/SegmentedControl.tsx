import React, { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import HoverTouchable from '../HoverTouchable'
import { sidebarStyles } from './sidebarStyles'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  accessibilityLabel?: string
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  isDarkMode: boolean
  isPCWeb: boolean
  trackBg: string
  trackBorder: string
  hoverBg: string
  textMain: string
  textMuted: string
}

const SEG_GAP = 3

/**
 * 统一「浅色滑块」分段控件：供角色与外观共用，切换时滑块带 200ms 平滑位移动画。
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  isDarkMode,
  isPCWeb,
  trackBg,
  trackBorder,
  hoverBg,
  textMain,
  textMuted
}: SegmentedControlProps<T>) {
  const [innerWidth, setInnerWidth] = useState(0)
  const rawIndex = options.findIndex((o) => o.value === value)
  const selectedIndex = rawIndex >= 0 ? rawIndex : 0
  const segWidth =
    innerWidth > 0 && options.length > 0
      ? (innerWidth - (options.length - 1) * SEG_GAP) / options.length
      : 0
  const targetX = selectedIndex * (segWidth + SEG_GAP)

  const translateX = useSharedValue(0)
  const hasLaidOutRef = useRef(false)
  const prevIndexRef = useRef(selectedIndex)

  useEffect(() => {
    if (innerWidth <= 0) return
    if (!hasLaidOutRef.current || prevIndexRef.current === selectedIndex) {
      // 初次测量或容器尺寸变化时直接落位，避免打开侧边栏时从第 0 项误滑
      translateX.value = targetX
      hasLaidOutRef.current = true
      prevIndexRef.current = selectedIndex
      return
    }
    prevIndexRef.current = selectedIndex
    translateX.value = withTiming(targetX, {
      duration: 200,
      easing: Easing.out(Easing.cubic)
    })
  }, [innerWidth, selectedIndex, targetX, translateX])

  const thumbAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }))

  const thumbBg = isDarkMode ? 'rgba(255, 255, 255, 0.14)' : '#FFFFFF'
  const thumbBorder = isDarkMode
    ? 'rgba(255, 255, 255, 0.14)'
    : 'rgba(0, 0, 0, 0.08)'
  const selectedTextColor = isDarkMode ? '#FFFFFF' : textMain

  return (
    <View
      style={[
        sidebarStyles.appearanceOptions,
        { backgroundColor: trackBg, borderColor: trackBorder }
      ]}
    >
      <View
        style={sidebarStyles.appearanceTrackInner}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width
          if (w > 0 && Math.abs(w - innerWidth) > 0.5) {
            setInnerWidth(w)
          }
        }}
      >
        {segWidth > 0 ? (
          <Animated.View
            style={[
              sidebarStyles.appearanceThumb,
              {
                width: segWidth,
                backgroundColor: thumbBg,
                borderColor: thumbBorder
              },
              !isDarkMode && sidebarStyles.appearanceThumbLightShadow,
              thumbAnimStyle
            ]}
          />
        ) : null}

        {options.map((opt) => {
          const selected = opt.value === value
          return (
            <HoverTouchable
              key={opt.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={opt.accessibilityLabel ?? opt.label}
              style={[
                sidebarStyles.appearanceOption,
                !isPCWeb && { paddingVertical: 9 },
                { borderColor: 'transparent', backgroundColor: 'transparent' }
              ]}
              hoverBg={selected ? 'transparent' : hoverBg}
              onPress={() => onChange(opt.value)}
            >
              <Text
                style={[
                  sidebarStyles.appearanceOptionText,
                  {
                    color: selected ? selectedTextColor : textMuted,
                    fontWeight: selected ? '600' : '500'
                  }
                ]}
              >
                {opt.label}
              </Text>
            </HoverTouchable>
          )
        })}
      </View>
    </View>
  )
}
