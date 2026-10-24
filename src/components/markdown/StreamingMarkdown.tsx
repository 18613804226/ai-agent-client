import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Markdown, { RenderRules } from 'react-native-markdown-display'
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { splitStableBlocks } from './streamingSplit'
import { normalizeInlineEmphasis } from '../../utils/normalizeEmphasis'
import {
  hasInlineMarkup,
  splitInlineSegments,
  type InlineSeg
} from '../../utils/emphasisSplit'
import { MONO_FONT, CodeCopyButton } from './markdownRules'

/**
 * 已成形段落：props 只有字符串 + 两个稳定引用，内容不变时 memo 直接跳过，
 * DOM 保持原样（浏览器无需为它重新断行/重绘）。
 */
const StableMarkdown = memo(function StableMarkdown({
  text,
  style,
  rules
}: {
  text: string
  style: any
  rules: RenderRules
}) {
  return (
    <Markdown style={style} rules={rules}>
      {text}
    </Markdown>
  )
})

/** 月相序列：一轮「新→满→新」，视觉上是月球自转、暗面逐片扫过 */
const PHASES = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']

/**
 * 内联在正文末尾的「月球自转」提示。
 * 用月相 emoji 字形轮换，纯文本内联 → 贴着最后一个字、随文字换行，安卓也不用 transform。
 * 月相按固定间隔匀速推进，不叠加透明度变化。
 */
const InlineMoonPhase = memo(function InlineMoonPhase() {
  const [i, setI] = useState(0)
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(PHASES.length, {
        duration: PHASES.length * 250,
        easing: Easing.linear
      }),
      -1
    )
    return () => cancelAnimation(progress)
  }, [progress])

  useAnimatedReaction(
    () => Math.floor(progress.value) % PHASES.length,
    (phase, previousPhase) => {
      if (phase !== previousPhase) scheduleOnRN(setI, phase)
    }
  )

  return <Text style={styles.inlineMoon}>{PHASES[i]}</Text>
})

/**
 * 流式尾巴切块：文本段 / 代码栅栏段。
 *
 * 代码栅栏在吐字期就渲染成与最终一致的 codeBox（而不是等「空行切点」把它升级成
 * 稳定块才变盒子）。否则尾巴会从「纯文本（行高 24、无上下留白）」跳成 codeBox
 * （paddingTop 34 + 行高 20 + 上下外边距），气泡高度当场跳一下 ——
 * 即「第一次生成代码块，气泡闪一下」。
 *
 * 未闭合的栅栏（还没吐到收尾 ```）也按盒子渲染：此时它与最终渲染同高，不产生跳变。
 */
type TailSeg = { kind: 'text'; text: string } | { kind: 'fence'; code: string }

const FENCE_OPEN = /^\s*(```|~~~)/
const FENCE_CLOSE = /^\s*(```|~~~)\s*$/

function splitTailSegments(text: string): TailSeg[] {
  const segs: TailSeg[] = []
  const lines = text.split('\n')
  const buf: string[] = []
  const flush = () => {
    if (buf.length) {
      segs.push({ kind: 'text', text: buf.join('\n') })
      buf.length = 0
    }
  }
  let i = 0
  while (i < lines.length) {
    if (FENCE_OPEN.test(lines[i])) {
      flush()
      i++ // 栅栏起始行本身不是代码内容（与 fence 规则的 content 一致）
      const code: string[] = []
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // 跳过收尾 ```
      segs.push({ kind: 'fence', code: code.join('\n') })
      continue
    }
    buf.push(lines[i])
    i++
  }
  flush()
  return segs
}

const TailText = memo(function TailText({
  text,
  selectable,
  color,
  style,
  leadingNewline
}: {
  text: string
  selectable: boolean
  color: string
  style: any
  /** 尾巴前面还有已落定的稳定块 —— 最终 Markdown 的 paragraph 规则会给
   *  `node.index > 0` 的段落前面补一个 `\n`，尾巴必须照样补，否则升级成
   *  稳定块时会当场多/少一行 + 段落下边距，气泡跳一下。 */
  leadingNewline: boolean
}) {
  // 吐字期每 token 都会传入新的 text；直接每次 splitInlineSegments 会 O(n²)。
  // 这里节流：显示文本每 ~80ms 才更新一次，中间 token 只跑一次时间判断，
  // 把内联强调切分的开销降到 1/5~1/10。
  const [displayedText, setDisplayedText] = useState(text)
  const lastUpdateRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const now = Date.now()
    if (now - lastUpdateRef.current >= 80) {
      lastUpdateRef.current = now
      setDisplayedText(text)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      lastUpdateRef.current = Date.now()
      setDisplayedText(text)
      timerRef.current = null
    }, 80 - (now - lastUpdateRef.current))
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [text])

  const tailSegs = useMemo(
    () => splitTailSegments(displayedText),
    [displayedText]
  )

  // 最后一个文本段后面贴「月球自转」提示（保持原来的内联行为：
  // 纯文本尾巴时提示仍贴着最后一个字）。代码段之后的提示单独占一行。
  const lastTextIdx = (() => {
    for (let i = tailSegs.length - 1; i >= 0; i--) {
      if (tailSegs[i].kind === 'text') return i
    }
    return -1
  })()

  return (
    <View>
      {tailSegs.map((seg, i) => {
        if (seg.kind === 'fence') {
          return (
            <View key={`f${i}`} style={style.codeBox}>
              <CodeCopyButton code={seg.code} styles={style} />
              <Text
                selectable={selectable}
                style={[styles.tail, style.codeText]}
              >
                {seg.code}
              </Text>
            </View>
          )
        }
        // 内联强调按「本段文本」切分，避免把整条尾巴的切分结果重复渲染到每个文本段
        const segInline =
          hasInlineMarkup(seg.text) && seg.text
            ? splitInlineSegments(seg.text)
            : null
        // 段落样式必须与最终 Markdown 的 paragraph 完全一致（含 marginBottom），
        // 否则尾巴升级成稳定块的那一刻会跳高度。
        return (
          <Text
            key={`t${i}`}
            selectable={selectable}
            style={[styles.tail, style.paragraph, { color }]}
          >
            {i > 0 || leadingNewline ? '\n' : null}
            {segInline
              ? segInline.map((s, j) => renderSeg(s, `s${i}.${j}`))
              : seg.text}
            {i === lastTextIdx && <InlineMoonPhase />}
          </Text>
        )
      })}
      {lastTextIdx < 0 && <InlineMoonPhase />}
    </View>
  )
})

/** 递归渲染一个内联片段；key 用「路径下标」保证同一位置的节点身份稳定 */
function renderSeg(seg: InlineSeg, keyPrefix: string): React.ReactNode {
  if (seg.children) {
    return (
      <Text
        key={keyPrefix}
        style={seg.strong ? styles.strong : seg.em ? styles.em : undefined}
      >
        {seg.children.map((c, i) => renderSeg(c, `${keyPrefix}.${i}`))}
      </Text>
    )
  }
  if (seg.raw) {
    return (
      <Text key={keyPrefix} style={styles.code}>
        {seg.text}
      </Text>
    )
  }
  // 纯文本叶子直接返回字符串：RN 的 Text 子节点原生支持字符串，
  // 省掉每个普通片段一层原生节点（吐字期每帧都少建一大批）
  return seg.text
}

/**
 * 流式正文：已成形段落 memo 化，只有尾巴每帧重新解析。
 *
 * 这样每帧要重排的范围从「整条回答」缩小到「尾巴这一段」。之前整条回答是一个
 * 文本节点，每帧追加几个字浏览器就要对整段重跑断行 + 重绘，长回答下必然掉帧，
 * 时间是"一顿一顿"的，贴底再准也看得出底部在跳。
 *
 * 另外：流式期与结束后共用同一套 markdown 渲染 + 同一套样式，
 * 「吐字完成」那一刻不再切换渲染器、行高也不再从 22 变 24 → 气泡高度不跳。
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
  style,
  rules,
  selectable = true
}: {
  content: string
  style: any
  rules: RenderRules
  selectable?: boolean
}) {
  // 已成形段落也过一遍强调归一化（`** xx **` → `**xx**`）：这些段落会走
  // 真正 的 markdown 解析，内侧带空格的定界符在这里必须修掉，否则加粗失效。
  // 尾巴仍是纯文本、`**` 只会原样显示，故不处理它（见 TailText 注释）。
  // 流式切块：文本只增不减，稳定块一旦产生永不改写。
  // 这里用 ref 缓存上一次的切块结果：content 每 token 都变，但稳定块只在"空行切点
  // 定型"时才新增，所以短间隔/小增量时直接复用缓存的 blocks，只更新 tail，
  // 把每 token 的 O(n) split 降到每 ~60ms / 8 字符一次，长回答不再 O(n²)。
  const cacheRef = useRef<{
    content: string
    blocks: string[]
    tail: string
    lastCut: number
    lastCompute: number
  }>({ content: '', blocks: [], tail: '', lastCut: 0, lastCompute: 0 })

  const { blocks, tail } = useMemo(() => {
    const c = content
    const cache = cacheRef.current
    if (c === cache.content) {
      return { blocks: cache.blocks, tail: cache.tail }
    }
    const now = Date.now()
    const grew = c.startsWith(cache.content) && cache.content.length > 0
    const smallDelta = c.length - cache.content.length < 8
    const recent = now - cache.lastCompute < 60
    if (grew && smallDelta && recent && cache.blocks.length >= 0) {
      const tail = normalizeInlineEmphasis(c.slice(cache.lastCut))
      cache.content = c
      cache.tail = tail
      return { blocks: cache.blocks, tail }
    }
    const r = splitStableBlocks(normalizeInlineEmphasis(c))
    cache.content = c
    cache.blocks = r.blocks
    cache.tail = r.tail
    cache.lastCut = c.length - r.tail.length
    cache.lastCompute = now
    return r
  }, [content])
  const color = style.body?.color ?? '#000'

  return (
    <View>
      {blocks.map((block, i) => (
        <StableMarkdown
          key={`md-${i}`}
          text={block}
          style={style}
          rules={rules}
        />
      ))}
      <TailText
        text={tail}
        selectable={selectable}
        color={color}
        style={style}
        leadingNewline={blocks.length > 0}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  tail: {
    fontSize: 15,
    lineHeight: 24
  },
  // 与 markdownRules 的 strong / em 保持同款粗细斜体，尾巴升级成稳定段落时不跳
  strong: {
    fontWeight: 'bold'
  },
  em: {
    fontStyle: 'italic'
  },
  code: {
    fontFamily: MONO_FONT
  },
  inlineMoon: {
    fontSize: 12,
    lineHeight: 24,
    marginLeft: 2
  }
})
