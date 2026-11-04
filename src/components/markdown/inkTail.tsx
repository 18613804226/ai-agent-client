import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing } from 'react-native'

/**
 * 流式文本「墨洇」尾部（从虚到实）。
 * 只包最后几个字：随文本长度换 key 重挂，挂载时播一段淡入 + 墨晕收敛。
 * 前缀保持普通字符串子节点不动 → 长文本也只多一个微型动画节点。
 *
 * ⚠️ 为什么用 RN legacy Animated 而不是 Reanimated：
 *    Reanimated（Fabric 新架构）对**嵌套在 <Text> 内部的 Animated.Text**
 *    逐帧更新 opacity / textShadowRadius 这类 shadowNode 文本属性支持不完整，
 *    实测 Android/iOS 上动画不生效（Web 走 DOM/CSS 正常）。
 *    RN legacy Animated 对「Text 内嵌套 Text」的属性动画在原生 + Web 都是成熟路径。
 */

/** 墨晕覆盖的字数 */
export const INK_TAIL = 5
/** 墨晕起始半径（收干到 0） */
const INK_RADIUS = 8
/** 墨晕起始透明度（随收干衰减） */
const INK_ALPHA = 0.45
/** 淡入起点：文字从多"虚"开始（0=完全透明，1=全实） */
const INK_OPACITY_FROM = 0.1
/** 淡入时长 */
const INK_DURATION = 200

function parseRgb(color: string): [number, number, number] {
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
  text: string
  selectable: boolean
  color: string
  baseStyle: any
}) => {
  // 0 = 刚出现（最虚、最洇），1 = 干透（全实、无晕）
  const progress = useRef(new Animated.Value(0)).current
  const rgb = useMemo(() => parseRgb(color), [color])

  useEffect(() => {
    progress.setValue(0)
    Animated.timing(progress, {
      toValue: 1,
      duration: INK_DURATION,
      easing: Easing.out(Easing.quad),
      // textShadow* 不是原生驱动支持的属性，只能 JS 驱动；
      // 节点只有几个字、且整条链路本来就是 JS 侧按帧更新文本，开销可忽略。
      useNativeDriver: false
    }).start()
  }, [progress])

  return (
    <Animated.Text
      selectable={selectable}
      style={[
        baseStyle,
        { color },
        {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [INK_OPACITY_FROM, 1]
          }),
          textShadowRadius: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [INK_RADIUS, 0]
          }),
          textShadowColor: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [
              `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${INK_ALPHA})`,
              `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`
            ]
          }),
          textShadowOffset: { width: 0, height: 0 }
        }
      ]}
    >
      {text}
    </Animated.Text>
  )
}

/**
 * 把一段流式纯文本拆成「已落定前缀 + 墨洇尾部」并渲染（可嵌在 <Text> 内使用）。
 * 整段 ≤ INK_TAIL 时整段挂墨晕；否则前缀是普通字符串、只有尾部带动画。
 */
export function InkTailText({
  text,
  color,
  baseStyle,
  selectable = false,
  segIndex = 0
}: {
  text: string
  color: string
  baseStyle: any
  selectable?: boolean
  segIndex?: number
}): React.ReactNode {
  if (text.length <= INK_TAIL) {
    return (
      <InkTail
        key={`ink${segIndex}.${text.length}`}
        text={text}
        selectable={selectable}
        color={color}
        baseStyle={baseStyle}
      />
    )
  }
  return (
    <React.Fragment key={`inkFrag${segIndex}.${text.length}`}>
      {text.slice(0, text.length - INK_TAIL)}
      <InkTail
        text={text.slice(-INK_TAIL)}
        selectable={selectable}
        color={color}
        baseStyle={baseStyle}
      />
    </React.Fragment>
  )
}