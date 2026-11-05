import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, Platform } from 'react-native'

/**
 * 流式文本「墨洇」尾部（从虚到实）。
 * 只把最后几个字渲染成略低于正文的透明度，前缀保持普通字符串子节点。
 *
 * 设计要点：
 * 1. 用 RN legacy Animated（useNativeDriver:false → setNativeProps）更新颜色，
 *    不走 React 重渲染、不重建父 Text 的 spannable → 无重排、不闪。
 * 2. 不按文本长度重挂节点（重挂会让淡入每次从头开始 → 尾字永远停在低透明度，
 *    深底上像"末尾字符不显示"）。节点保持挂载，新字到达时从「可读下限」再提亮。
 * 3. 透明度下限取 0.5，尾字任何时刻都看得清。
 */

/** 墨洇覆盖的字数（最后 N 个字） */
export const INK_TAIL = 5
/** 透明度下限：即使在动画起点也可读（修复"末尾字符不显示"）。
 *  越小对比越强、湿墨越明显；0.5 是"明显但不会看不见"的平衡点。 */
const INK_FLOOR = 0.2
/** 淡入时长 */
const INK_DURATION = 160
/** iOS / Web 的湿墨晕半径（Android 内联 span 不支持 textShadow，自动忽略） */
const INK_RADIUS = 6
const INK_SHADOW_ALPHA = 0.35

/** 把 #rrggbb / #rgb / rgb() 解析成 [r,g,b] */
export function parseRgb(color: string): [number, number, number] {
  const m6 = /^#([0-9a-f]{6})$/i.exec(color)
  if (m6) {
    const n = parseInt(m6[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const m3 = /^#([0-9a-f]{3})$/i.exec(color)
  if (m3) {
    const h = m3[1]
      .split('')
      .map((c) => c + c)
      .join('')
    const n = parseInt(h, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const m4 = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color)
  if (m4) return [+m4[1], +m4[2], +m4[3]]
  return [0, 0, 0]
}

const InkTail = ({
  text,
  selectable,
  color,
  baseStyle
}: {
  /** 完整文本（不是只有尾部）：effect 依赖它的长度变化来触发淡入 */
  text: string
  selectable: boolean
  color: string
  baseStyle: any
}) => {
  const progress = useRef(new Animated.Value(0)).current
  const rgb = useMemo(() => parseRgb(color), [color])
  const tail = text.length > INK_TAIL ? text.slice(-INK_TAIL) : text

  useEffect(() => {
    // 节点保持挂载、不重挂；新字到达时从「可读下限」提亮到 1。
    // setNativeProps 路径，无 React 重渲染。
    progress.stopAnimation()
    progress.setValue(0)
    Animated.timing(progress, {
      toValue: 1,
      duration: INK_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false
    }).start()
  }, [text.length, progress])

  return (
    <Animated.Text
      selectable={selectable}
      style={[
        baseStyle,
        {
          // 主体：颜色 alpha 在 可读下限(0.5) → 1 之间淡入（三端通用）
          color: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [
              `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${INK_FLOOR})`,
              `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`
            ]
          }),
          // 辅助：iOS/Web 的湿墨晕；Android 内联 span 不支持 textShadow，忽略
          ...(Platform.OS === 'android'
            ? null
            : {
              textShadowRadius: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [INK_RADIUS, 0]
              }),
              textShadowColor: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [
                  `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${INK_SHADOW_ALPHA})`,
                  `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`
                ]
              }),
              textShadowOffset: { width: 0, height: 0 }
            })
        }
      ]}
    >
      {tail}
    </Animated.Text>
  )
}

/**
 * 把一段流式纯文本拆成「已落定前缀 + 墨洇尾部」并渲染（可嵌在 <Text> 内使用）。
 * 整段 ≤ INK_TAIL 时整段用墨洇样式；否则前缀是普通字符串、只有尾部略湿。
 * 不按文本长度重挂节点（避免淡入被反复重启）。
 */
export function InkTailText({
  text,
  color,
  baseStyle,
  selectable = false
}: {
  text: string
  color: string
  baseStyle: any
  selectable?: boolean
}): React.ReactNode {
  if (text.length <= INK_TAIL) {
    return (
      <InkTail
        text={text}
        selectable={selectable}
        color={color}
        baseStyle={baseStyle}
      />
    )
  }
  return (
    <>
      {text.slice(0, text.length - INK_TAIL)}
      <InkTail
        text={text}
        selectable={selectable}
        color={color}
        baseStyle={baseStyle}
      />
    </>
  )
}

