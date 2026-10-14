import React, { memo, useEffect, useMemo, useState } from 'react'
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
import { MONO_FONT } from './markdownRules'

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
        duration: PHASES.length * 200,
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
 * 还在增长的最后一行。
 *
 * 之前这里是纯文本，导致吐字期 `**加粗**` 原样显示、要等段落成形才变粗。
 * 现在用 splitInlineSegments 做**内联强调**切分：`**`/`__` → 粗、`*`/`_` → 斜，
 * 行内代码按等宽字面量。块级语法（标题/列表/表格）仍不在这里解析，等段落成形
 * 后交给 StableMarkdown —— 因为块级结构每帧变才是当初「正文重排跳动」的根源。
 *
 * 安全性：切分器**只在强调对真正闭合的那一刻**才产生结构变化，未闭合的 `**bo`
 * 原样输出（等价于纯文本），所以吐字期的抖动特性与纯文本一致；而对应 span 的
 * fontSize/lineHeight/粗细与 markdownRules 的 strong/em 保持一致，
 * 「尾巴升级成稳定段落」那一刻不会跳高度。
 */
const TailText = memo(function TailText({
  text,
  selectable,
  color
}: {
  text: string
  selectable: boolean
  color: string
}) {
  const segs = useMemo(
    () => (hasInlineMarkup(text) ? splitInlineSegments(text) : null),
    [text]
  )

  return (
    <Text selectable={selectable} style={[styles.tail, { color }]}>
      {segs
        ? segs.map((seg, i) => renderSeg(seg, `s${i}`))
        : text}
      <InlineMoonPhase />
    </Text>
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
  const { blocks, tail } = useMemo(
    () => splitStableBlocks(normalizeInlineEmphasis(content)),
    [content]
  )
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
      <TailText text={tail} selectable={selectable} color={color} />
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
