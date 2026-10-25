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
 * 未闭合的栅栏（还没吐到收尾 ```）只要有代码行就按盒子渲染：此时它与最终渲染同高，
 * 不产生跳变。唯一例外是「栅栏刚打开、还没有任何代码行」——那时把起始行按普通文本
 * 渲染（而不是画空盒子、也不是什么都不画），让这一行的可见性保持不变，高度才单调。
 */
type TailSeg =
  | { kind: 'text'; text: string }
  | { kind: 'fence'; marker: string; code: string; closed: boolean }

const FENCE_OPEN = /^\s*(```|~~~)/
const FENCE_CLOSE = /^\s*(```|~~~)\s*$/

/** 只去掉结尾的**一个**换行：与最终 fence / code_block 规则对 content 的处理一致。
 *  不去掉的话尾巴里的 `"code\n"` 会多渲染一个空行，围栏闭合时又消失 → 高度跳一下。 */
const stripOneTrailingNewline = (s: string) =>
  s.endsWith('\n') ? s.slice(0, -1) : s

function splitTailSegments(text: string): TailSeg[] {
  const segs: TailSeg[] = []
  const lines = text.split('\n')
  const buf: string[] = []
  const flush = () => {
    // 段**内**的空行必须原样保留：模型用空行分段是有意的语义（见 markdownRules
    // 的 paragraph 规则 —— 块之间用 `\n\n`）。之前这里把它压成 `\n`，导致流式期
    // 和最终态都把段落挤成一行，看起来就是「空白行被吃掉了」。
    // 只有**末尾**的空行要裁：那只是「光标停在空行上」，最终渲染里也不产生空行。
    const t = buf.join('\n').replace(/\n+$/, '')
    buf.length = 0
    if (t) segs.push({ kind: 'text', text: t })
  }
  let i = 0
  while (i < lines.length) {
    if (FENCE_OPEN.test(lines[i])) {
      flush()
      const marker = lines[i]
      i++ // 栅栏起始行本身不是代码内容（与 fence 规则的 content 一致）
      const code: string[] = []
      let closed = false
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      if (i < lines.length) {
        closed = true
        i++ // 跳过收尾 ```
      }
      segs.push({
        kind: 'fence',
        marker,
        code: stripOneTrailingNewline(code.join('\n')),
        closed
      })
      continue
    }
    buf.push(lines[i])
    i++
  }
  flush()
  return segs
}

/**
 * 块之间的空行分隔符：一个独立的空行 <Text>（行高必须与正文一致，否则高度对不上）。
 *
 * 为什么需要它：最终渲染里 `body` 规则把连续的段落/标题/列表合并进**同一个**
 * `<Text>`，块间距由它们的 `node.index > 0` 补 `\n\n` 实现。而流式侧的块是
 * **各自独立的节点**（`StableMarkdown` / `TailText`），不补的话块间会被压成
 * 一行 —— 等切点落定、或吐字结束切成最终态时又跳一次。
 */
const BlockSeparator = () => <Text style={styles.tail}>{'\n'}</Text>

/** 稳定块/尾巴首段在最终渲染里**不会**补块间空行的情形：
 *  代码块（fence/code_block → View）和分割线（hr → View）—— body 规则会把
 *  View 从文本 run 里切出去，run 之前自然没有空行。流式侧必须同样不补，
 *  否则两边行数对不上 → 切点落定/吐字结束时跳一下。
 *  （引用块现在由 body 统一补空行，所以这里不再排除 `>`。） */
const needsNoSeparator = (text: string) =>
  /^\s*(```|~~~|([-*_])\s*(\2\s*){2,})/.test(text)

const TailText = memo(function TailText({
  text,
  selectable,
  color,
  style,
  leadingSeparator = false
}: {
  text: string
  selectable: boolean
  color: string
  style: any
  /** 尾巴前面还有已落定的稳定块 → 补一个空行。
   *  最终渲染里段落/标题/列表在 `index > 0` 时会补 `\n\n`，而流式侧的块是
   *  **各自独立的节点**，不自己补的话块间会被压成一行，等切点落定/吐字结束
   *  又跳一次。仅当尾巴的第一段是文本段时才补（代码块/分割线在最终渲染里不补）。 */
  leadingSeparator?: boolean
}) {
  // 不做节流：每 token 直接切。
  // ① 之前节流带来的「显示文本 vs 块结构」两个时钟，正是段落边界那一抽的根因；
  // ② 外层 StreamingMarkdown 的 content 是 prop，每 token 本来就会 re-render，
  //    节流省不掉这次提交，只省尾巴内部那点活；
  // ③ 真正贵的 splitInlineSegments 前面还有 hasInlineMarkup 这道廉价闸门。
  // 代价（少量重复的 O(n) 切分）远小于它引入的状态机复杂度。
  const tailSegs = useMemo(() => splitTailSegments(text), [text])

  // 栅栏刚打开、还没吐到代码行时按普通文本渲染（见下），此时它也算「文本段」。
  const rendersAsText = (seg: TailSeg) =>
    seg.kind === 'text' || (!seg.code && !seg.closed)

  // 最后一个文本段后面贴「月球自转」提示（保持原来的内联行为：
  // 纯文本尾巴时提示仍贴着最后一个字）。代码段之后的提示单独占一行。
  const lastTextIdx = (() => {
    for (let i = tailSegs.length - 1; i >= 0; i--) {
      if (rendersAsText(tailSegs[i])) return i
    }
    return -1
  })()

  return (
    <View>
      {leadingSeparator &&
        tailSegs[0]?.kind === 'text' &&
        !needsNoSeparator(tailSegs[0].text) && <BlockSeparator />}
      {tailSegs.map((seg, i) => {
        if (seg.kind === 'fence') {
          // 栅栏刚打开、还没吐到任何代码行：把起始行按**普通文本**渲染。
          // ⚠️ 不能 `return null` —— 那会让已经显示出来的 ``` 行凭空消失（-24px）；
          // 也不能画空 codeBox —— paddingTop 34 会留出一大块空白。
          // 保持这一行可见，高度就单调；等第一个代码行吐出来才换成盒子。
          if (!seg.code && !seg.closed) {
            return (
              <Text
                key={`f${i}`}
                selectable={selectable}
                style={[styles.tail, { color }]}
              >
                {seg.marker}
                {i === lastTextIdx && <InlineMoonPhase />}
              </Text>
            )
          }
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
        // ⚠️ 这里必须用 styles.tail（= body 的字号/行高），**不能**用
        // style.paragraph：最终渲染里 body 规则会把连续段落合并进同一个 <Text>，
        // 段落退化成内联子节点，`paragraph.marginBottom` 在那条链上不生效。
        // 尾巴若带上 marginBottom，升级成稳定块时会凭空多出 8px —— 这正是
        //「出代码块时抽一下」的来源之一。
        // ⚠️ 段间空行也不能在**段首**内联补 `\n`：最终渲染里那个 `\n\n` 在同一个
        // <Text> 里，而尾巴是**另一个** <Text>，内联补会造成行数对不上。
        // 块间空行由外层的 <BlockSeparator /> 统一补（一个独立的空行 Text）。
        return (
          <Text
            key={`t${i}`}
            selectable={selectable}
            style={[styles.tail, { color }]}
          >
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
        <React.Fragment key={`md-${i}`}>
          {i > 0 && !needsNoSeparator(block) && <BlockSeparator />}
          <StableMarkdown
            text={block}
            style={style}
            rules={rules}
          />
        </React.Fragment>
      ))}
      <TailText
        text={tail}
        selectable={selectable}
        color={color}
        style={style}
        leadingSeparator={blocks.length > 0}
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
