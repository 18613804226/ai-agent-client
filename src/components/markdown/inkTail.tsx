import React, { useEffect, useMemo } from 'react'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing
} from 'react-native-reanimated'

/**
 * 流式文本「墨洇」尾部（从虚到实）。
 * 只包最后几个字：随文本长度换 key 重挂，挂载时播一段淡入 + 墨晕收敛。
 * 前缀保持普通字符串子节点不动 → 长文本也只多一个微型动画节点。
 *
 * 文本色解析：跑到 JS 层算好 rgb，worklet 里只做数字插值（避免在 UI 线程跑正则）。
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
  const p = useSharedValue(0)
  const rgb = useMemo(() => parseRgb(color), [color])
  useEffect(() => {
    p.value = withTiming(1, {
      duration: INK_DURATION,
      easing: Easing.out(Easing.quad)
    })
  }, [p])
  const inkStyle = useAnimatedStyle(() => {
    const wet = 1 - p.value
    return {
      opacity: INK_OPACITY_FROM + (1 - INK_OPACITY_FROM) * p.value,
      textShadowRadius: wet * INK_RADIUS,
      textShadowColor: `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${wet * INK_ALPHA})`,
      textShadowOffset: { width: 0, height: 0 }
    }
  })
  return (
    <Animated.Text
      selectable={selectable}
      style={[baseStyle, { color }, inkStyle]}
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