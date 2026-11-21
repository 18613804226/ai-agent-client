import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Platform, StyleSheet, Text } from 'react-native'

/**
 * 流式文本「逐字波浪墨洇」尾部（从虚到实，先到先亮、互不打断）。
 *
 * 设计要点：
 * 1. 前缀已落定文本保持普通字符串子节点，仅尾部最近刚到达的字符走独立渐入节点，
 *    活跃节点上限锁死在 MAX_ACTIVE_UNITS（12），长回答也零 DOM/Text 膨胀。
 * 2. 增量到达时只为新增字符/小块分配递增 id 与独立入场动画：先出现的字继续完成
 *    自己的淡入，绝不被后续到达的新字重置回低透明度（避免旧版整体闪烁感）。
 * 3. Web 端走 CSS animationKeyframes + animationDelay（浏览器合成层驱动，JS 零逐帧）；
 *    Android / iOS 原生内联 <Text> 不支持元素级 opacity 动画，使用 RN Animated
 *    驱动 color rgba alpha，不重排、不触发父 Text 重建。
 */

/** 尾部兜底截断码点数（用于初次挂载或外部读取） */
export const INK_TAIL = 10

const MAX_ACTIVE_UNITS = 12
const MAX_BATCH_UNITS = 6
const INK_DURATION = 240
const BATCH_SPAN_MS = 46
const INK_FLOOR = 0.06

interface FadeUnit {
  id: number
  text: string
  delayMs: number
  doneAt: number
}

interface TailState {
  lastText: string
  settled: string
  units: FadeUnit[]
  nextId: number
}

const webFadeStyles =
  Platform.OS === 'web'
    ? StyleSheet.create({
        unit: {
          animationKeyframes: [
            { from: { opacity: 0.05 }, to: { opacity: 1 } }
          ],
          animationDuration: `${INK_DURATION}ms`,
          animationTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          animationFillMode: 'both'
        } as any
      })
    : null

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

/**
 * 按码点拆分新增文本，避免把 emoji 代理对拆断：
 * 正常吐字速率下逐字成块；收尾加速或大块补齐时均分成最多 MAX_BATCH_UNITS 块。
 */
function splitUnits(str: string): string[] {
  if (!str) return []
  const chars = Array.from(str)
  if (chars.length <= MAX_BATCH_UNITS) return chars
  const groupSize = Math.ceil(chars.length / MAX_BATCH_UNITS)
  const out: string[] = []
  for (let i = 0; i < chars.length; i += groupSize) {
    out.push(chars.slice(i, i + groupSize).join(''))
  }
  return out
}

/** O(1) 按码点从末尾切片，不分配整段 Array.from，同时保护 UTF-16 代理对 */
function tailSliceByCodePoints(str: string, maxCp: number): [string, string] {
  if (!str || maxCp <= 0) return [str, '']
  let i = str.length
  let count = 0
  while (i > 0 && count < maxCp) {
    i--
    const code = str.charCodeAt(i)
    if (code >= 0xdc00 && code <= 0xdfff && i > 0) {
      const hi = str.charCodeAt(i - 1)
      if (hi >= 0xd800 && hi <= 0xdbff) {
        i--
      }
    }
    count++
  }
  return [str.slice(0, i), str.slice(i)]
}

/** 把头部连续已动画完成的单元归并回纯文本前缀 */
function partitionFinishedLeading(
  settled: string,
  units: FadeUnit[],
  now: number
): { settled: string; units: FadeUnit[]; moved: number } {
  let cut = 0
  while (cut < units.length && units[cut].doneAt <= now) {
    cut++
  }
  if (cut === 0) {
    return { settled, units, moved: 0 }
  }
  let extra = ''
  for (let i = 0; i < cut; i++) {
    extra += units[i].text
  }
  return {
    settled: settled + extra,
    units: units.slice(cut),
    moved: cut
  }
}

function buildFreshState(text: string, startId: number, now: number): TailState {
  if (!text) {
    return { lastText: '', settled: '', units: [], nextId: startId }
  }
  const [head, tail] = tailSliceByCodePoints(text, MAX_BATCH_UNITS)
  const pieces = splitUnits(tail)
  const step =
    pieces.length > 1 ? Math.min(18, Math.floor(BATCH_SPAN_MS / pieces.length)) : 0
  let id = startId
  const units: FadeUnit[] = pieces.map((piece, idx) => {
    const delayMs = idx * step
    return {
      id: id++,
      text: piece,
      delayMs,
      doneAt: now + delayMs + INK_DURATION
    }
  })
  return {
    lastText: text,
    settled: head,
    units,
    nextId: id
  }
}

function advanceTailState(prev: TailState, text: string, now: number): TailState {
  if (text === prev.lastText) return prev

  if (
    prev.lastText.length > 0 &&
    text.length > prev.lastText.length &&
    text.startsWith(prev.lastText)
  ) {
    const folded = partitionFinishedLeading(prev.settled, prev.units, now)
    let nextSettled = folded.settled
    const nextUnits = folded.units.slice()

    const delta = text.slice(prev.lastText.length)
    const pieces = splitUnits(delta)
    const step =
      pieces.length > 1
        ? Math.min(18, Math.floor(BATCH_SPAN_MS / pieces.length))
        : 0
    let id = prev.nextId
    for (let i = 0; i < pieces.length; i++) {
      const delayMs = i * step
      nextUnits.push({
        id: id++,
        text: pieces[i],
        delayMs,
        doneAt: now + delayMs + INK_DURATION
      })
    }

    while (nextUnits.length > MAX_ACTIVE_UNITS) {
      const oldest = nextUnits.shift()!
      nextSettled += oldest.text
    }

    return {
      lastText: text,
      settled: nextSettled,
      units: nextUnits,
      nextId: id
    }
  }

  // 文本被重置或前段刚升格成稳定块：保持 nextId 单调递增，避免复用到旧段 key
  return buildFreshState(text, prev.nextId, now)
}

function flushExpiredUnits(prev: TailState, now: number): TailState {
  if (prev.units.length === 0) return prev
  const res = partitionFinishedLeading(prev.settled, prev.units, now)
  if (res.moved === 0) return prev
  return {
    lastText: prev.lastText,
    settled: res.settled,
    units: res.units,
    nextId: prev.nextId
  }
}

const WebFadeUnit = React.memo(function WebFadeUnit({
  text,
  delayMs,
  selectable,
  color,
  baseStyle
}: {
  text: string
  delayMs: number
  selectable: boolean
  color: string
  baseStyle: any
}) {
  return (
    <Text
      selectable={selectable}
      style={[
        baseStyle,
        webFadeStyles?.unit,
        {
          color,
          animationDelay: `${delayMs}ms`
        } as any
      ]}
    >
      {text}
    </Text>
  )
})

const NativeFadeUnit = React.memo(function NativeFadeUnit({
  text,
  delayMs,
  selectable,
  r,
  g,
  b,
  baseStyle
}: {
  text: string
  delayMs: number
  selectable: boolean
  r: number
  g: number
  b: number
  baseStyle: any
}) {
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: INK_DURATION,
      delay: delayMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    })
    anim.start()
    return () => anim.stop()
  }, [progress, delayMs])

  return (
    <Animated.Text
      selectable={selectable}
      style={[
        baseStyle,
        {
          color: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [
              `rgba(${r},${g},${b},${INK_FLOOR})`,
              `rgba(${r},${g},${b},1)`
            ]
          })
        }
      ]}
    >
      {text}
    </Animated.Text>
  )
})

/**
 * 把一段流式纯文本拆成「已落定前缀 + 独立波浪淡入尾部」并渲染（可嵌在 <Text> 内使用）。
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
  const [state, setState] = useState<TailState>(() =>
    buildFreshState(text, 1, Date.now())
  )

  if (state.lastText !== text) {
    setState(advanceTailState(state, text, Date.now()))
  }

  useEffect(() => {
    if (state.units.length === 0) return
    const lastDoneAt = state.units[state.units.length - 1].doneAt
    const waitMs = Math.max(0, lastDoneAt - Date.now()) + 30
    const timer = setTimeout(() => {
      setState((prev) => flushExpiredUnits(prev, Date.now()))
    }, waitMs)
    return () => clearTimeout(timer)
  }, [state.units])

  const [r, g, b] = useMemo(() => parseRgb(color), [color])

  return (
    <>
      {state.settled || null}
      {state.units.map((u) =>
        Platform.OS === 'web' ? (
          <WebFadeUnit
            key={u.id}
            text={u.text}
            delayMs={u.delayMs}
            selectable={selectable}
            color={color}
            baseStyle={baseStyle}
          />
        ) : (
          <NativeFadeUnit
            key={u.id}
            text={u.text}
            delayMs={u.delayMs}
            selectable={selectable}
            r={r}
            g={g}
            b={b}
            baseStyle={baseStyle}
          />
        )
      )}
    </>
  )
}
