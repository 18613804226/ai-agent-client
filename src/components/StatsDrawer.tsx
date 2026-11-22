import React, { useContext, useEffect, useMemo, useState } from 'react'
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView
} from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { InputBarIcon } from './InputBarIcon'

export interface StatsDrawerTheme {
  isDark: boolean
  textMain: string
  textMuted: string
  textSecondary?: string
  border: string
  borderSubtle?: string
  surfaceElevated?: string
  primary?: string
  primarySoft?: string
  primaryBorder?: string
  warning?: string
  danger?: string
}

/** 统计详情的一节：保留给桌面 Web tooltip 消费，也作为抽屉兜底渲染 */
export interface StatsSection {
  title: string
  rows: string[]
  hint?: boolean
}

/** 移动端底部抽屉用的结构化统计数据，避免从拼接文本里反向解析 */
export interface MessageStatsData {
  context: {
    modelLabel?: string
    sourcesCount?: number
    historyKept?: number
    historyDropped?: number
    hasMemoryInfo?: boolean
    digestUsed?: boolean
    truncated?: boolean
    finishReason?: string
  }
  tokens: {
    total?: number | null
    input?: number | null
    cached?: number | null
    cacheHitPercent?: number | null
    output?: number | null
    thought?: number | null
    answer?: number | null
  }
  latency: {
    durationMs?: number | null
    ttftMs?: number | null
    firstAnswerTokenMs?: number | null
    thoughtDurationMs?: number | null
    answerDurationMs?: number | null
    generationDurationMs?: number | null
  }
  speed: {
    overallTps?: number | null
    thoughtTps?: number | null
    answerTps?: number | null
    prefillTps?: number | null
  }
  notes: string[]
}

const TTFT_WARNING_MS = 5000

/** 千分位整数格式化（不依赖 locale 实现差异，三端表现一致） */
function formatInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 拆出数值与单位，便于对齐字号和次要灰 */
function splitDuration(ms: number): { value: string; unit: string } {
  if (!Number.isFinite(ms) || ms < 0) return { value: '—', unit: '' }
  if (ms < 1000) return { value: String(Math.round(ms)), unit: 'ms' }
  const s = ms / 1000
  if (s < 60) return { value: s.toFixed(1), unit: 's' }
  const totalSec = Math.round(s)
  const m = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return { value: `${m}m ${sec}s`, unit: '' }
}

function formatDurationCompact(ms: number): string {
  const { value, unit } = splitDuration(ms)
  return unit ? `${value}${unit}` : value
}

function formatPercent(part: number, total: number): string {
  if (total <= 0 || part <= 0) return '0%'
  const pct = Math.round((part / total) * 100)
  return pct === 0 ? '<1%' : `${pct}%`
}

interface BarSegment {
  key: string
  label: string
  val: number
  color: string
  detail: string
}

/** 紧凑横向堆叠条 + 图例：用于 Token 占比与耗时分布 */
function StackedDistributionBar({
  segments,
  total,
  textSecondary,
  textMuted,
  compact = false
}: {
  segments: BarSegment[]
  total: number
  textSecondary: string
  textMuted: string
  compact?: boolean
}) {
  if (segments.length < 2 || total <= 0) return null
  return (
    <View style={[styles.barBlock, compact && styles.barBlockCompact]}>
      <View style={[styles.barTrack, compact && styles.barTrackCompact]}>
        {segments.map((seg) => (
          <View
            key={seg.key}
            style={[
              styles.barSegment,
              compact && styles.barSegmentCompact,
              {
                flex: Math.max(seg.val, 1),
                backgroundColor: seg.color
              }
            ]}
          />
        ))}
      </View>
      <View style={[styles.legendRow, compact && styles.legendRowCompact]}>
        {segments.map((seg) => (
          <View key={seg.key} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                compact && styles.legendDotCompact,
                { backgroundColor: seg.color }
              ]}
            />
            <Text
              style={[
                styles.legendLabel,
                compact && styles.legendTextCompact,
                { color: textSecondary }
              ]}
            >
              {seg.label}
            </Text>
            <Text
              style={[
                styles.legendValue,
                compact && styles.legendTextCompact,
                { color: textMuted }
              ]}
            >
              {seg.detail}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** 两栏明细行：左标签（支持树形缩进），右等宽数字 + 单位 */
function MetricRow({
  label,
  value,
  unit,
  treePrefix,
  textMain,
  textSecondary,
  textMuted,
  treeColor,
  valueColor,
  bold,
  compact = false
}: {
  label: string
  value: string
  unit?: string
  treePrefix?: '├' | '└'
  textMain: string
  textSecondary: string
  textMuted: string
  treeColor: string
  valueColor?: string
  bold?: boolean
  compact?: boolean
}) {
  return (
    <View style={[styles.metricRow, compact && styles.metricRowCompact]}>
      <View style={styles.metricLabelWrap}>
        {treePrefix ? (
          <Text
            style={[
              styles.treePrefix,
              compact && styles.treePrefixCompact,
              { color: treeColor }
            ]}
          >
            {treePrefix}
          </Text>
        ) : null}
        <Text
          style={[
            styles.metricLabel,
            treePrefix && styles.metricSubLabel,
            compact && (treePrefix ? styles.metricSubLabelCompact : styles.metricLabelCompact),
            { color: treePrefix ? textMuted : textSecondary }
          ]}
        >
          {label}
        </Text>
      </View>
      <View style={styles.metricValueWrap}>
        <Text
          style={[
            styles.metricValue,
            compact && styles.metricValueCompact,
            bold && styles.metricValueBold,
            { color: valueColor || textMain }
          ]}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            style={[
              styles.metricUnit,
              compact && styles.metricUnitCompact,
              { color: textMuted }
            ]}
          >
            {' '}
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/** 共用结构化统计内容：底部抽屉（compact=false）与桌面悬停卡片（compact=true）共用一套视觉与数据源 */
export function StatsDetailContent({
  sections,
  stats,
  theme,
  compact = false,
  notesOpen = false,
  onToggleNotes
}: {
  sections: StatsSection[]
  stats?: MessageStatsData | null
  theme: StatsDrawerTheme
  compact?: boolean
  notesOpen?: boolean
  onToggleNotes?: () => void
}) {
  const isDark = theme.isDark
  const surfaceBg =
    theme.surfaceElevated || (isDark ? 'rgba(255, 255, 255, 0.045)' : '#F6F8FA')
  const borderSubtle =
    theme.borderSubtle ||
    (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)')
  const textSecondary =
    theme.textSecondary || (isDark ? '#A3A7AC' : '#5E5E5E')
  const primaryColor = theme.primary || (isDark ? '#2F7DE1' : '#2563EB')
  const warningColor = theme.warning || '#F59E0B'
  const dangerColor = theme.danger || '#EF4444'
  const inputBarColor = isDark ? '#6B7C93' : '#64748B'
  const thoughtBarColor = isDark ? '#A855F7' : '#9333EA'
  const otherBarColor = isDark
    ? 'rgba(148, 163, 184, 0.35)'
    : 'rgba(100, 116, 139, 0.25)'
  const treeColor = isDark
    ? 'rgba(255, 255, 255, 0.28)'
    : 'rgba(0, 0, 0, 0.26)'
  const chipBg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.045)'

  // ── 结构化统计视图数据准备 ───────────────────────────────────────────────
  const renderStructured = !!stats

  const durationParts =
    stats?.latency.durationMs != null && stats.latency.durationMs > 0
      ? splitDuration(stats.latency.durationMs)
      : null
  const ttftMs = stats?.latency.ttftMs
  const ttftParts =
    ttftMs != null && ttftMs > 0 ? splitDuration(ttftMs) : null
  const ttftSlow = ttftMs != null && ttftMs >= TTFT_WARNING_MS
  const overallTps = stats?.speed.overallTps
  const showKpiRow = !!(durationParts || ttftParts || overallTps != null)

  // Token 分组数据与堆叠条
  const tok = stats?.tokens
  const hasTokenCard =
    tok != null &&
    (tok.total != null || tok.input != null || tok.output != null)
  const tokenSegments: BarSegment[] = []
  let tokenSegmentSum = 0
  if (tok) {
    const inVal = tok.input != null && tok.input > 0 ? tok.input : 0
    const thVal = tok.thought != null && tok.thought > 0 ? tok.thought : 0
    const anVal =
      tok.answer != null
        ? Math.max(0, tok.answer)
        : tok.output != null
          ? Math.max(0, tok.output - thVal)
          : 0
    tokenSegmentSum = inVal + thVal + anVal
    if (tokenSegmentSum > 0) {
      if (inVal > 0) {
        tokenSegments.push({
          key: 'input',
          label: '输入',
          val: inVal,
          color: inputBarColor,
          detail: formatPercent(inVal, tokenSegmentSum)
        })
      }
      if (thVal > 0) {
        tokenSegments.push({
          key: 'thought',
          label: '思考',
          val: thVal,
          color: thoughtBarColor,
          detail: formatPercent(thVal, tokenSegmentSum)
        })
      }
      if (anVal > 0) {
        tokenSegments.push({
          key: 'answer',
          label: '正文',
          val: anVal,
          color: primaryColor,
          detail: formatPercent(anVal, tokenSegmentSum)
        })
      }
    }
  }
  const outputSubRows: { label: string; value: string }[] = []
  if (tok && tok.output != null && tok.thought != null && tok.thought > 0) {
    outputSubRows.push({ label: '思考', value: formatInt(tok.thought) })
    if (tok.answer != null) {
      outputSubRows.push({ label: '正文', value: formatInt(tok.answer) })
    }
  }

  // 耗时分组数据与时间轴分布条
  const lat = stats?.latency
  const hasLatencyCard =
    lat != null &&
    ((lat.durationMs != null && lat.durationMs > 0) ||
      (lat.ttftMs != null && lat.ttftMs > 0) ||
      (lat.firstAnswerTokenMs != null && lat.firstAnswerTokenMs > 0) ||
      (lat.thoughtDurationMs != null && lat.thoughtDurationMs > 0) ||
      (lat.answerDurationMs != null && lat.answerDurationMs > 0) ||
      (lat.generationDurationMs != null && lat.generationDurationMs > 0))
  const latencySegments: BarSegment[] = []
  let latencyTotal = 0
  if (lat && lat.durationMs != null && lat.durationMs > 0) {
    const ttftVal = lat.ttftMs != null && lat.ttftMs > 0 ? lat.ttftMs : 0
    const thMsVal =
      lat.thoughtDurationMs != null && lat.thoughtDurationMs > 0
        ? lat.thoughtDurationMs
        : 0
    const anMsVal =
      lat.answerDurationMs != null && lat.answerDurationMs > 0
        ? lat.answerDurationMs
        : 0
    const activeCount = [ttftVal, thMsVal, anMsVal].filter((v) => v > 0).length
    if (activeCount >= 2) {
      const knownSum = ttftVal + thMsVal + anMsVal
      latencyTotal = Math.max(lat.durationMs, knownSum)
      const otherMs = Math.max(0, lat.durationMs - knownSum)
      if (ttftVal > 0) {
        latencySegments.push({
          key: 'ttft',
          label: '首字',
          val: ttftVal,
          color: inputBarColor,
          detail: formatDurationCompact(ttftVal)
        })
      }
      if (thMsVal > 0) {
        latencySegments.push({
          key: 'thoughtMs',
          label: '思考',
          val: thMsVal,
          color: thoughtBarColor,
          detail: formatDurationCompact(thMsVal)
        })
      }
      if (anMsVal > 0) {
        latencySegments.push({
          key: 'answerMs',
          label: '正文',
          val: anMsVal,
          color: primaryColor,
          detail: formatDurationCompact(anMsVal)
        })
      }
      if (otherMs > 0 && otherMs / latencyTotal >= 0.03) {
        latencySegments.push({
          key: 'otherMs',
          label: '其它',
          val: otherMs,
          color: otherBarColor,
          detail: formatDurationCompact(otherMs)
        })
      }
    }
  }
  const hasThoughtPhase =
    lat?.thoughtDurationMs != null && lat.thoughtDurationMs > 0
  const stageRows: { label: string; ms: number }[] = []
  if (lat?.thoughtDurationMs != null && lat.thoughtDurationMs > 0) {
    stageRows.push({ label: '思考耗时', ms: lat.thoughtDurationMs })
  }
  if (lat?.answerDurationMs != null && lat.answerDurationMs > 0) {
    stageRows.push({ label: '正文耗时', ms: lat.answerDurationMs })
  }
  if (lat?.generationDurationMs != null && lat.generationDurationMs > 0) {
    stageRows.push({ label: '纯吐字耗时', ms: lat.generationDurationMs })
  }

  // 速度分组数据
  const spd = stats?.speed
  const speedRows: { label: string; val: number }[] = []
  if (spd?.overallTps != null) {
    speedRows.push({ label: '整体速度', val: spd.overallTps })
  }
  if (spd?.thoughtTps != null) {
    speedRows.push({ label: '思考速度', val: spd.thoughtTps })
  }
  if (spd?.answerTps != null) {
    speedRows.push({ label: '正文速度', val: spd.answerTps })
  }
  if (spd?.prefillTps != null) {
    speedRows.push({ label: 'Prefill', val: spd.prefillTps })
  }

  // 上下文标签 chips
  const ctx = stats?.context
  const contextChips: {
    key: string
    label: string
    tone?: 'warning' | 'danger'
  }[] = []
  if (ctx) {
    if (ctx.sourcesCount) {
      contextChips.push({ key: 'sources', label: `引用 ${ctx.sourcesCount}` })
    }
    if (ctx.hasMemoryInfo) {
      contextChips.push({
        key: 'memory',
        label: `记忆 ${ctx.historyKept ?? 0}/${ctx.historyDropped ?? 0}`
      })
    }
    if (ctx.digestUsed) {
      contextChips.push({ key: 'digest', label: '滚动摘要' })
    }
    if (ctx.truncated) {
      contextChips.push({ key: 'truncated', label: '已截断', tone: 'danger' })
    } else if (ctx.finishReason === 'content_filter') {
      contextChips.push({
        key: 'filter',
        label: '内容过滤',
        tone: 'danger'
      })
    } else if (ctx.finishReason === 'tool_calls') {
      contextChips.push({
        key: 'tools',
        label: '工具调用',
        tone: 'warning'
      })
    }
    if (ctx.finishReason) {
      contextChips.push({
        key: 'finish',
        label: `结束 ${ctx.finishReason}`
      })
    }
  }

  const chevronRotate = {
    transform: [{ rotate: notesOpen ? '180deg' : '0deg' }]
  }

  return (
    <View style={[styles.detailStack, compact && styles.detailStackCompact]}>
      {compact ? (
        <View style={[styles.headerRow, styles.headerRowCompact]}>
          <Text
            style={[
              styles.title,
              styles.titleCompact,
              { color: theme.textMain }
            ]}
          >
            本轮统计
          </Text>
          {ctx?.modelLabel ? (
            <View
              style={[
                styles.modelChip,
                styles.modelChipCompact,
                {
                  backgroundColor: surfaceBg,
                  borderColor: borderSubtle
                }
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.modelChipText,
                  styles.modelChipTextCompact,
                  { color: textSecondary }
                ]}
              >
                {ctx.modelLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {renderStructured ? (
        <>
          {/* ① 顶部 3 个核心指标摘要卡 */}
          {showKpiRow ? (
            <View style={[styles.kpiRow, compact && styles.kpiRowCompact]}>
              <View
                style={[
                  styles.kpiCard,
                  compact && styles.kpiCardCompact,
                  {
                    backgroundColor: surfaceBg,
                    borderColor: borderSubtle
                  }
                ]}
              >
                <Text
                  style={[
                    styles.kpiLabel,
                    compact && styles.kpiLabelCompact,
                    { color: textSecondary }
                  ]}
                >
                  整轮耗时
                </Text>
                <View style={styles.kpiValueRow}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    style={[
                      styles.kpiValue,
                      compact && styles.kpiValueCompact,
                      { color: theme.textMain }
                    ]}
                  >
                    {durationParts ? durationParts.value : '—'}
                  </Text>
                  {durationParts?.unit ? (
                    <Text
                      style={[
                        styles.kpiUnit,
                        compact && styles.kpiUnitCompact,
                        { color: theme.textMuted }
                      ]}
                    >
                      {' '}
                      {durationParts.unit}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View
                style={[
                  styles.kpiCard,
                  compact && styles.kpiCardCompact,
                  {
                    backgroundColor: surfaceBg,
                    borderColor: borderSubtle
                  }
                ]}
              >
                <Text
                  style={[
                    styles.kpiLabel,
                    compact && styles.kpiLabelCompact,
                    { color: textSecondary }
                  ]}
                >
                  首字延迟
                </Text>
                <View style={styles.kpiValueRow}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    style={[
                      styles.kpiValue,
                      compact && styles.kpiValueCompact,
                      {
                        color: ttftSlow ? warningColor : theme.textMain
                      }
                    ]}
                  >
                    {ttftParts ? ttftParts.value : '—'}
                  </Text>
                  {ttftParts?.unit ? (
                    <Text
                      style={[
                        styles.kpiUnit,
                        compact && styles.kpiUnitCompact,
                        {
                          color: ttftSlow ? warningColor : theme.textMuted
                        }
                      ]}
                    >
                      {' '}
                      {ttftParts.unit}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View
                style={[
                  styles.kpiCard,
                  compact && styles.kpiCardCompact,
                  {
                    backgroundColor: surfaceBg,
                    borderColor: borderSubtle
                  }
                ]}
              >
                <Text
                  style={[
                    styles.kpiLabel,
                    compact && styles.kpiLabelCompact,
                    { color: textSecondary }
                  ]}
                >
                  整体速度
                </Text>
                <View style={styles.kpiValueRow}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    style={[
                      styles.kpiValue,
                      compact && styles.kpiValueCompact,
                      { color: theme.textMain }
                    ]}
                  >
                    {overallTps != null ? formatInt(overallTps) : '—'}
                  </Text>
                  {overallTps != null ? (
                    <Text
                      style={[
                        styles.kpiUnit,
                        compact && styles.kpiUnitCompact,
                        { color: theme.textMuted }
                      ]}
                    >
                      {' '}
                      t/s
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          {/* ② 上下文状态标签条 */}
          {contextChips.length > 0 ? (
            <View style={[styles.chipsRow, compact && styles.chipsRowCompact]}>
              {contextChips.map((chip) => {
                const toneColor =
                  chip.tone === 'danger'
                    ? dangerColor
                    : chip.tone === 'warning'
                      ? warningColor
                      : textSecondary
                const toneBg =
                  chip.tone === 'danger'
                    ? 'rgba(239, 68, 68, 0.14)'
                    : chip.tone === 'warning'
                      ? 'rgba(245, 158, 11, 0.14)'
                      : chipBg
                const toneBorder =
                  chip.tone === 'danger'
                    ? 'rgba(239, 68, 68, 0.35)'
                    : chip.tone === 'warning'
                      ? 'rgba(245, 158, 11, 0.35)'
                      : borderSubtle
                return (
                  <View
                    key={chip.key}
                    style={[
                      styles.ctxChip,
                      compact && styles.ctxChipCompact,
                      {
                        backgroundColor: toneBg,
                        borderColor: toneBorder
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.ctxChipText,
                        compact && styles.ctxChipTextCompact,
                        { color: toneColor }
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </View>
                )
              })}
            </View>
          ) : null}

          {/* ③ Token 分组卡片（含堆叠分布条） */}
          {hasTokenCard && tok ? (
            <View
              style={[
                styles.card,
                compact && styles.cardCompact,
                {
                  backgroundColor: surfaceBg,
                  borderColor: borderSubtle
                }
              ]}
            >
              <View
                style={[styles.cardHeader, compact && styles.cardHeaderCompact]}
              >
                <Text
                  style={[
                    styles.cardTitle,
                    compact && styles.cardTitleCompact,
                    { color: textSecondary }
                  ]}
                >
                  Token
                </Text>
                {tok.total != null ? (
                  <Text
                    style={[
                      styles.cardTotal,
                      compact && styles.cardTotalCompact,
                      { color: theme.textMain }
                    ]}
                  >
                    共 {formatInt(tok.total)}
                  </Text>
                ) : null}
              </View>

              <StackedDistributionBar
                segments={tokenSegments}
                total={tokenSegmentSum}
                textSecondary={textSecondary}
                textMuted={theme.textMuted}
                compact={compact}
              />

              <View
                style={[styles.metricList, compact && styles.metricListCompact]}
              >
                {tok.input != null ? (
                  <>
                    <MetricRow
                      label="输入"
                      value={formatInt(tok.input)}
                      textMain={theme.textMain}
                      textSecondary={textSecondary}
                      textMuted={theme.textMuted}
                      treeColor={treeColor}
                      compact={compact}
                    />
                    {tok.cached != null && tok.cached > 0 ? (
                      <MetricRow
                        treePrefix="└"
                        label="缓存命中"
                        value={formatInt(tok.cached)}
                        unit={
                          tok.cacheHitPercent != null
                            ? `(${tok.cacheHitPercent}%)`
                            : undefined
                        }
                        textMain={theme.textMain}
                        textSecondary={textSecondary}
                        textMuted={theme.textMuted}
                        treeColor={treeColor}
                        compact={compact}
                      />
                    ) : null}
                  </>
                ) : null}

                {tok.output != null ? (
                  <>
                    <MetricRow
                      label="输出"
                      value={formatInt(tok.output)}
                      textMain={theme.textMain}
                      textSecondary={textSecondary}
                      textMuted={theme.textMuted}
                      treeColor={treeColor}
                      compact={compact}
                    />
                    {outputSubRows.map((sub, idx) => (
                      <MetricRow
                        key={sub.label}
                        treePrefix={
                          idx === outputSubRows.length - 1 ? '└' : '├'
                        }
                        label={sub.label}
                        value={sub.value}
                        textMain={theme.textMain}
                        textSecondary={textSecondary}
                        textMuted={theme.textMuted}
                        treeColor={treeColor}
                        compact={compact}
                      />
                    ))}
                  </>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* ④ 耗时分解卡片（含时间轴与两级缩进明细） */}
          {hasLatencyCard && lat ? (
            <View
              style={[
                styles.card,
                compact && styles.cardCompact,
                {
                  backgroundColor: surfaceBg,
                  borderColor: borderSubtle
                }
              ]}
            >
              <View
                style={[styles.cardHeader, compact && styles.cardHeaderCompact]}
              >
                <Text
                  style={[
                    styles.cardTitle,
                    compact && styles.cardTitleCompact,
                    { color: textSecondary }
                  ]}
                >
                  耗时
                </Text>
              </View>

              <StackedDistributionBar
                segments={latencySegments}
                total={latencyTotal}
                textSecondary={textSecondary}
                textMuted={theme.textMuted}
                compact={compact}
              />

              <View
                style={[styles.metricList, compact && styles.metricListCompact]}
              >
                {lat.durationMs != null && lat.durationMs > 0 ? (
                  <MetricRow
                    label="整轮耗时"
                    {...splitDuration(lat.durationMs)}
                    textMain={theme.textMain}
                    textSecondary={textSecondary}
                    textMuted={theme.textMuted}
                    treeColor={treeColor}
                    bold
                    compact={compact}
                  />
                ) : null}
                {lat.ttftMs != null && lat.ttftMs > 0 ? (
                  <MetricRow
                    label={hasThoughtPhase ? '首字（含思考）' : '首字延迟'}
                    {...splitDuration(lat.ttftMs)}
                    textMain={theme.textMain}
                    textSecondary={textSecondary}
                    textMuted={theme.textMuted}
                    treeColor={treeColor}
                    valueColor={ttftSlow ? warningColor : undefined}
                    bold={ttftSlow}
                    compact={compact}
                  />
                ) : null}
                {lat.firstAnswerTokenMs != null &&
                lat.firstAnswerTokenMs > 0 &&
                (hasThoughtPhase ||
                  lat.firstAnswerTokenMs !== lat.ttftMs) ? (
                  <MetricRow
                    label="正文首字"
                    {...splitDuration(lat.firstAnswerTokenMs)}
                    textMain={theme.textMain}
                    textSecondary={textSecondary}
                    textMuted={theme.textMuted}
                    treeColor={treeColor}
                    compact={compact}
                  />
                ) : null}
                {stageRows.map((st, idx) => (
                  <MetricRow
                    key={st.label}
                    treePrefix={idx === stageRows.length - 1 ? '└' : '├'}
                    label={st.label}
                    {...splitDuration(st.ms)}
                    textMain={theme.textMain}
                    textSecondary={textSecondary}
                    textMuted={theme.textMuted}
                    treeColor={treeColor}
                    compact={compact}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* ⑤ 速度分组卡片（纯数字两栏，避免过度设计） */}
          {speedRows.length > 0 ? (
            <View
              style={[
                styles.card,
                compact && styles.cardCompact,
                {
                  backgroundColor: surfaceBg,
                  borderColor: borderSubtle
                }
              ]}
            >
              <View
                style={[styles.cardHeader, compact && styles.cardHeaderCompact]}
              >
                <Text
                  style={[
                    styles.cardTitle,
                    compact && styles.cardTitleCompact,
                    { color: textSecondary }
                  ]}
                >
                  速度
                </Text>
              </View>
              <View
                style={[styles.metricList, compact && styles.metricListCompact]}
              >
                {speedRows.map((row) => (
                  <MetricRow
                    key={row.label}
                    label={row.label}
                    value={formatInt(row.val)}
                    unit="t/s"
                    textMain={theme.textMain}
                    textSecondary={textSecondary}
                    textMuted={theme.textMuted}
                    treeColor={treeColor}
                    compact={compact}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* ⑥ 口径说明：底部抽屉可折叠展开；悬停浮层不可点击，直接以紧凑脚注常显 */}
          {stats.notes.length > 0 ? (
            compact ? (
              <View
                style={[
                  styles.notesContainer,
                  styles.notesContainerCompact,
                  { borderTopColor: borderSubtle }
                ]}
              >
                <View style={styles.notesBodyCompact}>
                  {stats.notes.map((line, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.noteLine,
                        styles.noteLineCompact,
                        { color: theme.textMuted }
                      ]}
                    >
                      {line}
                    </Text>
                  ))}
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.notesContainer,
                  { borderTopColor: borderSubtle }
                ]}
              >
                <Pressable
                  onPress={onToggleNotes}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: notesOpen }}
                  style={({ pressed }) => [
                    styles.notesToggle,
                    pressed && styles.notesTogglePressed
                  ]}
                >
                  <Text
                    style={[
                      styles.notesToggleLabel,
                      { color: theme.textMuted }
                    ]}
                  >
                    指标口径说明
                  </Text>
                  <View style={chevronRotate}>
                    <InputBarIcon
                      name="chevron-down"
                      size={15}
                      color={theme.textMuted}
                    />
                  </View>
                </Pressable>
                {notesOpen ? (
                  <View style={styles.notesBody}>
                    {stats.notes.map((line, i) => (
                      <Text
                        key={i}
                        style={[
                          styles.noteLine,
                          { color: theme.textMuted }
                        ]}
                      >
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            )
          ) : null}
        </>
      ) : (
        /* 无结构化数据时兜底：把 sections 放进分组卡片里 */
        sections.map((s) => (
          <View
            key={s.title}
            style={[
              styles.card,
              compact && styles.cardCompact,
              { backgroundColor: surfaceBg, borderColor: borderSubtle }
            ]}
          >
            <Text
              style={[
                styles.cardTitle,
                compact && styles.cardTitleCompact,
                { color: textSecondary }
              ]}
            >
              {s.title}
            </Text>
            <View
              style={[styles.metricList, compact && styles.metricListCompact]}
            >
              {s.rows.map((r, i) => (
                <Text
                  key={i}
                  style={[
                    styles.fallbackRow,
                    s.hint && styles.noteLine,
                    compact && (s.hint ? styles.noteLineCompact : styles.fallbackRowCompact),
                    { color: s.hint ? theme.textMuted : theme.textMain }
                  ]}
                >
                  {r}
                </Text>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  )
}

/** 底部统计详情抽屉：顶部摘要卡 + 分组明细 + 可视化分布 + 可折叠口径说明 */
export default function StatsDrawer({
  visible,
  onClose,
  sections,
  stats,
  theme
}: {
  visible: boolean
  onClose: () => void
  sections: StatsSection[]
  stats?: MessageStatsData | null
  theme: StatsDrawerTheme
}) {
  const { height: winHeight } = useWindowDimensions()
  const insets = useContext(SafeAreaInsetsContext)
  const bottomInset = insets?.bottom ?? 0
  const [notesOpen, setNotesOpen] = useState(false)

  const t = useSharedValue(0)
  /** 手指下拉的实时位移（只允许向下，向上拖不动） */
  const dragY = useSharedValue(0)
  const bodyMaxHeight = winHeight * 0.68

  useEffect(() => {
    // 关闭时归零并收起口径说明，保证每次重新打开都是干净的默认视图
    dragY.value = 0
    if (!visible) {
      setNotesOpen(false)
    }
    t.value = visible
      ? withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) })
      : 0
  }, [visible, t, dragY])

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          dragY.value = Math.max(0, e.translationY)
        })
        .onEnd((e) => {
          // 拖过 110px，或快速下滑（>900px/s）→ 关闭；否则弹回原位
          if (e.translationY > 110 || e.velocityY > 900) {
            runOnJS(onClose)()
          } else {
            dragY.value = withSpring(0, { damping: 26, stiffness: 500 })
          }
        })
        .onFinalize(() => {
          // 手势被系统/其他手势打断时也要复位，避免卡片停在半路
          if (dragY.value > 0) {
            dragY.value = withSpring(0, { damping: 26, stiffness: 500 })
          }
        }),
    [dragY, onClose]
  )

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 320 + dragY.value }]
  }))

  /** 下拉时遮罩跟着变淡，手势反馈更连贯 */
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: t.value * Math.max(0.25, 1 - dragY.value / 400)
  }))

  if (!visible) return null

  const isDark = theme.isDark
  const sheetBg = isDark ? '#1C1D20' : '#FFFFFF'
  const surfaceBg =
    theme.surfaceElevated || (isDark ? 'rgba(255, 255, 255, 0.045)' : '#F6F8FA')
  const borderSubtle =
    theme.borderSubtle ||
    (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)')
  const textSecondary =
    theme.textSecondary || (isDark ? '#A3A7AC' : '#5E5E5E')
  const handleColor = isDark
    ? 'rgba(255, 255, 255, 0.24)'
    : 'rgba(0, 0, 0, 0.18)'
  const topBorderColor = isDark
    ? 'rgba(255, 255, 255, 0.14)'
    : 'rgba(0, 0, 0, 0.08)'
  const sheetBottomPadding =
    Platform.OS === 'web'
      ? ('max(20px, env(safe-area-inset-bottom))' as any)
      : Math.max(20, bottomInset + 12)
  const modelLabel = stats?.context.modelLabel

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Modal 是独立的原生视图层级，RNGH 手势必须自带 RootView ——
          否则它落在 App 根的 GestureHandlerRootView 之外，手势完全不响应 */}
      <GestureHandlerRootView style={styles.overlay}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.backdropPress} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            sheetStyle,
            styles.sheet,
            {
              backgroundColor: sheetBg,
              borderTopColor: topBorderColor,
              paddingBottom: sheetBottomPadding
            }
          ]}
        >
          {/* 下滑关闭只挂在顶部把手/标题区：内容区要留给 ScrollView，
              否则 Pan 会和原生滚动抢手势，正文滚不动。 */}
          <GestureDetector gesture={pan}>
            <View style={styles.grabArea}>
              <View
                style={[styles.handle, { backgroundColor: handleColor }]}
              />
              <View style={styles.headerRow}>
                <Text style={[styles.title, { color: theme.textMain }]}>
                  本轮统计
                </Text>
                {modelLabel ? (
                  <View
                    style={[
                      styles.modelChip,
                      {
                        backgroundColor: surfaceBg,
                        borderColor: borderSubtle
                      }
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.modelChipText, { color: textSecondary }]}
                    >
                      {modelLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            style={{ maxHeight: bodyMaxHeight }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <StatsDetailContent
              sections={sections}
              stats={stats}
              theme={theme}
              notesOpen={notesOpen}
              onToggleNotes={() => setNotesOpen((v) => !v)}
            />
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)'
  },
  backdropPress: { flex: 1 },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 8
  },
  grabArea: {
    paddingBottom: 12
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 12
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  headerRowCompact: {
    marginBottom: 1
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2
  },
  titleCompact: {
    fontSize: 13.5
  },
  modelChip: {
    maxWidth: '62%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth
  },
  modelChipCompact: {
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  modelChipText: {
    fontSize: 12,
    fontWeight: '600'
  },
  modelChipTextCompact: {
    fontSize: 11
  },
  scrollContent: {
    paddingBottom: 10
  },
  detailStack: {
    gap: 10
  },
  detailStackCompact: {
    gap: 7
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8
  },
  kpiRowCompact: {
    gap: 6
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  kpiCardCompact: {
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 7
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 4
  },
  kpiLabelCompact: {
    fontSize: 10.5,
    marginBottom: 2
  },
  kpiValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline'
  },
  kpiValue: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4
  },
  kpiValueCompact: {
    fontSize: 18
  },
  kpiUnit: {
    fontSize: 11,
    fontWeight: '500'
  },
  kpiUnitCompact: {
    fontSize: 10.5
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  chipsRowCompact: {
    gap: 5
  },
  ctxChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth
  },
  ctxChipCompact: {
    paddingHorizontal: 7,
    paddingVertical: 2.5
  },
  ctxChipText: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums']
  },
  ctxChipTextCompact: {
    fontSize: 10.5
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  cardCompact: {
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  cardHeaderCompact: {
    marginBottom: 5
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2
  },
  cardTitleCompact: {
    fontSize: 11
  },
  cardTotal: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums']
  },
  cardTotalCompact: {
    fontSize: 12
  },
  barBlock: {
    marginBottom: 10,
    gap: 7
  },
  barBlockCompact: {
    marginBottom: 7,
    gap: 5
  },
  barTrack: {
    flexDirection: 'row',
    height: 7,
    gap: 2,
    width: '100%'
  },
  barTrackCompact: {
    height: 6
  },
  barSegment: {
    minWidth: 6,
    height: 7,
    borderRadius: 3.5
  },
  barSegmentCompact: {
    height: 6,
    borderRadius: 3
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  legendRowCompact: {
    gap: 9
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  legendDotCompact: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '500'
  },
  legendValue: {
    fontSize: 11,
    fontVariant: ['tabular-nums']
  },
  legendTextCompact: {
    fontSize: 10.5
  },
  metricList: {
    gap: 6
  },
  metricListCompact: {
    gap: 3.5
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20
  },
  metricRowCompact: {
    minHeight: 17
  },
  metricLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: 12
  },
  treePrefix: {
    fontSize: 12,
    marginRight: 6,
    marginLeft: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  treePrefixCompact: {
    fontSize: 11,
    marginRight: 5
  },
  metricLabel: {
    fontSize: 13
  },
  metricLabelCompact: {
    fontSize: 12
  },
  metricSubLabel: {
    fontSize: 12.5
  },
  metricSubLabelCompact: {
    fontSize: 11.5
  },
  metricValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 0
  },
  metricValue: {
    fontSize: 13.5,
    fontWeight: '500',
    fontVariant: ['tabular-nums']
  },
  metricValueCompact: {
    fontSize: 12
  },
  metricValueBold: {
    fontWeight: '700'
  },
  metricUnit: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums']
  },
  metricUnitCompact: {
    fontSize: 10.5
  },
  notesContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
    paddingTop: 4
  },
  notesContainerCompact: {
    marginTop: 1,
    paddingTop: 6
  },
  notesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 38,
    paddingVertical: 6
  },
  notesTogglePressed: {
    opacity: 0.7
  },
  notesToggleLabel: {
    fontSize: 12,
    fontWeight: '600'
  },
  notesBody: {
    gap: 5,
    paddingTop: 2,
    paddingBottom: 6
  },
  notesBodyCompact: {
    gap: 2.5
  },
  noteLine: {
    fontSize: 11,
    lineHeight: 17
  },
  noteLineCompact: {
    fontSize: 10.5,
    lineHeight: 15
  },
  fallbackRow: {
    fontSize: 13,
    lineHeight: 20
  },
  fallbackRowCompact: {
    fontSize: 12,
    lineHeight: 17
  }
})
