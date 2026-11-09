import React, { memo, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, Image, Dimensions } from 'react-native'
import { InputBarIcon } from './InputBarIcon'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming
} from 'react-native-reanimated'
import { INVERTED_CHAT_LIST, CELL_INVERSION_STYLE } from '../utils/chatScroll'
import { WEB_ROW_CONTAINMENT } from '../utils/layout'
import {
  selectableMarkdownRules,
  nonSelectableMarkdownRules,
  webMarkdownRules,
  createMarkdownRules,
  createWebMarkdownRules
} from './markdown/markdownRules'
import { StreamingMarkdown } from './markdown/StreamingMarkdown'
import ThoughtCollapsible from './ThoughtCollapsible'
import MessageActions from './MessageActions'
import { normalizeInlineEmphasis } from '../utils/normalizeEmphasis'
import { EMPTY_CITATIONS, openSourceUrl, webCitations } from '../utils/citations'
import { SourcesList } from './SourcesList'
import { chatMessageStyles, createDynamicMarkdownStyles } from './ChatMessageItem.styles'
import { isMobileWebWidth } from '../constants/theme'
import type { Message, ThemeType } from '../types/chat'
import { type PickedAttachment, formatFileSize } from '../hooks/useImagePicker'

/**
 * 文本的「token 权重」粗估：CJK / 假名 / 全角标点按 1 token 1 字，
 * 其余（英文、数字、代码符号）按 0.28 token/字符（约 3.6 字符 1 token）。
 *
 * 只用来把 **准确的总量** 按比例分给思考段和正文段 —— 服务端 done 只给
 * total（含输入）与 completionTokens（输出总量），没有 reasoningTokens，
 * 所以拆分只能是估算；量级（谁占大头）是准的，个位数会有偏差。
 */
function estimateTokenWeight(text: string): number {
  if (!text) return 0
  let weight = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    weight += code >= 0x2e80 ? 1 : 0.28
  }
  return weight
}

/** 耗时格式化：<1s 显示 ms，<60s 显示 X.Xs，否则 m:ss */
function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}m${sec}s`
}

// ===================== ChatMessageItem =====================
const ChatMessageItem = memo(
  ({
    item,
    theme,
    isMobile,
    isStreaming,
    isLast = false,
    isPlaying = false,
    setPlayingMsgId,
    onPreviewImage,
    onPreviewFile,
    textSelectable = true,
    onLayout,
    reserveMinHeight = 0,
    animateIn = false,
    onThoughtToggle
  }: {
    item: Message
    theme: ThemeType
    isMobile: boolean
    isStreaming?: boolean
    /** 是否视觉上的最后一条（贴输入框那条）：去掉 messageRow 的 marginBottom */
    isLast?: boolean
    /** 本条消息是否正在播放（由父组件根据 playingMsgId 计算） */
    isPlaying?: boolean
    setPlayingMsgId: (id: string | null) => void
    onPreviewImage?: (images: string[], index: number) => void
    /** 点气泡附件行 → 应用内真预览（与图片 onPreviewImage 同款交互） */
    onPreviewFile?: (att: PickedAttachment) => void
    /** 抽屉打开时传 false：禁用文本选择并清掉蓝色选择框，避免误触 */
    textSelectable?: boolean
    /** 钉顶模式：布局完成回调，用于把用户消息滚到视口顶部 */
    onLayout?: (e: any) => void
    /** 钉顶：给「回答区」预留至少一屏高（minHeight），让用户消息能被顶到顶部而不 clamp */
    reserveMinHeight?: number
    /** 刚发送的消息：做一次淡入 + 上滑入场动画 */
    animateIn?: boolean
    /** 思考框展开/折叠时回调：(msgId, expanding, height) —— 外层留白同步补偿 */
    onThoughtToggle?: (msgId: string, expanding: boolean, height: number) => void
  }) => {
    const entrance = useSharedValue(animateIn ? 0 : 1)
    useEffect(() => {
      // FlashList 会复用 cell：item 变化时必须把入场值重置，否则新消息可能继承上一条的 0/1
      entrance.value = animateIn ? 0 : 1
      if (!animateIn) return
      entrance.value = withTiming(1, { duration: 200 })
    }, [animateIn, entrance, item.id])
    const entranceStyle = useAnimatedStyle(() => ({
      opacity: entrance.value,
      transform: [{ translateY: (1 - entrance.value) * 10 }],
    }))

    const isUser = item.role === 'user'
    const hasContent = !!(item.content && item.content !== '...')
    const hasThought = !!item.thought
    const isThinking = !isUser && !hasContent && !hasThought

    /**
     * 附件统一渲染：图片、文档、视频全部来自 item.attachments（用 kind 区分）。
     *   - 文档/视频 → 类型图标 + 文件名 + 右箭头（可点预览）
     *   - 图片     → 缩略图网格（可点全屏预览）
     * 两者放进同一个「附件列」，紧跟其后的才是正文气泡 —— 不论用户发的是
     * 图片、文档还是视频，布局完全一致。
     */
    const allAttachments =
      isUser && item.attachments && item.attachments.length > 0
        ? item.attachments
        : []
    // 图片源：新鲜消息的本地 blob / file://，或服务端 url（消息落库后
    // 本地来源已丢弃，只剩 url/fileRef）
    const imageSourceOf = (a: any): string => a.uri || a.url || ''
    /** 可预览源：本地 blob / file://（新鲜消息），或服务端引用（历史消息，含原生端） */
    const canPreview = (a: any): boolean =>
      !!onPreviewFile &&
      (!!a.blob || !!a.uri || !!(a.url || a.fileRef || a.uploadFileRef))
    const docAttachments = allAttachments.filter((a) => a.kind !== 'image')
    const imageAttachments = allAttachments
      .filter((a) => a.kind === 'image')
      // 本地来源与服务端 url 都拿不到 → 渲染不出缩略图，直接不进列表
      // （否则「预览索引」和「实际渲染出来的图」会对不上）
      .filter((a) => imageSourceOf(a))
    const hasAttachments = allAttachments.length > 0

    const attachmentRows =
      docAttachments.length > 0
        ? docAttachments.map((a, idx) => {
          const isVideo =
            a.mime?.startsWith('video/') || (a as any).kind === 'video';
          const fileName = a.name || '未命名文件';
          const fileSize = formatFileSize(a.size) || '';
          return (
            <TouchableOpacity
              key={`${a.name}-${idx}`}
              activeOpacity={0.7}
              disabled={!canPreview(a)}
              onPress={() => onPreviewFile?.(a)}
              style={[
                chatMessageStyles.attachmentCard,
                {
                  backgroundColor: theme.bubbleUserBg,
                  borderColor: theme.bubbleUserText + '15',
                  borderWidth: 1,
                },
              ]}
            >
              <View
                style={[
                  chatMessageStyles.attachmentIcon,
                  { backgroundColor: theme.bubbleUserText + '12' },
                ]}
              >
                <InputBarIcon
                  name={isVideo ? 'film' : 'file-text'}
                  size={16}
                  color={theme.bubbleUserText}
                />
              </View>
              <View style={chatMessageStyles.attachmentInfo}>
                <Text
                  numberOfLines={1}
                  style={[
                    chatMessageStyles.attachmentName,
                    { color: theme.bubbleUserText },
                  ]}
                >
                  {fileName}
                </Text>
                {fileSize ? (
                  <Text
                    style={[
                      chatMessageStyles.attachmentMeta,
                      { color: theme.bubbleUserText },
                    ]}
                  >
                    {fileSize}
                  </Text>
                ) : null}
              </View>
              <View style={{ opacity: 0.6 }}>
                <InputBarIcon
                  name="chevron-right"
                  size={15}
                  color={theme.bubbleUserText}
                />
              </View>
            </TouchableOpacity>
          );
        })
        : null;

    /**
     * 最终渲染前的两件归一化：
     * 1. 剥掉末尾的空白/换行。模型结尾常带 \n：流式尾巴是纯文本，末尾换行不产生
     *    可见空行；但切到最终 Markdown 后，末尾 \n 会被解析成一个额外空行 →
     *    气泡底部多出一段空白。剥掉它，吐完那一刻与流式期一致、不留空白。
     * 2. 修掉 `** xx **`（定界符内侧带空格）→ `**xx**`：CommonMark 规定闭定界符前
     *    不能是空白，否则整段当字面量、加粗不生效，而模型很爱输出带空格版。
     */
    const renderContent =
      isStreaming || !item.content
        ? item.content || ''
        : normalizeInlineEmphasis(item.content.trimEnd())

    /**
     * [n] 角标来源映射。
     * 流式期刻意用模块级 EMPTY_CITATIONS：rules 也保持模块级常量，
     * 于是「sources 帧中途到达」和「每个 content chunk」都不会让
     * StableMarkdown 的 memo 失效 —— 吐字期零闪烁。
     * 吐字结束那一次 commit 才换成带角标的 rules，与 finalBlocks 尾段升格、
     * MessageActions ready 同帧发生，正好是需求要的「统一重渲染一次」。
     */
    const citations = useMemo(
      () => (isStreaming ? EMPTY_CITATIONS : webCitations(item.sources)),
      [isStreaming, item.sources]
    )

    const markdownRules = useMemo(() => {
      if (isStreaming || citations.size === 0) {
        return Platform.OS === 'web'
          ? webMarkdownRules
          : textSelectable
            ? selectableMarkdownRules
            : nonSelectableMarkdownRules
      }
      return Platform.OS === 'web'
        ? createWebMarkdownRules(citations, openSourceUrl)
        : createMarkdownRules(textSelectable, citations, openSourceUrl)
    }, [isStreaming, citations, textSelectable])

    // 现读视口宽度：桌面 Web 才有空间展开完整统计（并允许小字折成两行）
    const compactMeta =
      Platform.OS !== 'web' ||
      isMobileWebWidth(Dimensions.get('window').width)
    /**
     * token 口径拆分。
     *
     * - 服务端 `tokens` 是 total_tokens（**含输入**），`completionTokens` 是本轮输出，
     *   所以「输入 = tokens − completionTokens」是准的；
     * - 「思考 / 正文」服务端没给 reasoningTokens，只能把准确的输出总量按**字符权重
     *   分摊**给两段（见 estimateTokenWeight）。量级可信（谁占大头不会错），
     *   个位数会有偏差。
     *
     * 流式期 done 还没到 → 提前返回，避免每帧遍历一次几千字的正文。
     */
    const tokenStats = useMemo(() => {
      const empty = {
        input: null as number | null,
        output: null as number | null,
        thought: null as number | null,
        answer: null as number | null
      }
      if (item.completionTokens == null && item.tokens == null) return empty

      const output = item.completionTokens ?? null
      // 输入：优先后端独立字段；老后端只有 total 时用 total − output 倒推
      const input =
        item.inputTokens ??
        (item.tokens != null && output != null && item.tokens > output
          ? item.tokens - output
          : null)

      let thought: number | null = null
      let answer: number | null = null
      if (output != null && output > 0) {
        // 思考 token：优先后端 reasoningTokens；没有才按字符权重分摊。
        // 越界（负数 / 大于输出）视为后端口径不同，不信它，走分摊。
        const reasoning = item.reasoningTokens
        if (reasoning != null && reasoning >= 0 && reasoning <= output) {
          thought = reasoning
          answer = output - reasoning
        } else {
          const thoughtWeight = estimateTokenWeight(item.thought || '')
          const answerWeight = estimateTokenWeight(item.content || '')
          const sum = thoughtWeight + answerWeight
          if (sum > 0) {
            thought = Math.round((output * thoughtWeight) / sum)
            answer = output - thought
          }
        }
      }
      return { input, output, thought, answer }
    }, [
      item.inputTokens,
      item.tokens,
      item.completionTokens,
      item.reasoningTokens,
      item.thought,
      item.content
    ])

    /**
     * 气泡下方小字。两种排布：
     *
     * - 窄屏（APP / H5）：单行不折行，只留最常看的三项 ——
     *   `耗时 4.5s · 输出 320 t（思考 293 + 正文 27）· 20t/s`
     *   模型名、输入 token、引用/记忆等一律不占位。
     * - 桌面 Web：信息全展开（模型 / 输入+输出 / 速度 / 耗时 / 首字 / 引用 / 记忆 / 状态），
     *   模型名只在桌面留 —— 降级时靠它一眼可见。
     *
     * t/s 一律 = **输出 token ÷ 生成耗时**（总耗时剔除首字等待，见下）。
     */
    const metaText = (() => {
      if (isUser) return ''
      const { input, output, thought, answer } = tokenStats

      // 两段都有量才加括号：没思考（或没正文）时括号里只会是噪声
      const split =
        thought != null && answer != null && thought > 0 && answer > 0
          ? `（思考 ${thought} + 正文 ${answer}）`
          : ''

      // t/s = **输出 token（含思考）** ÷ 整体生成耗时。
      // 分子必须含思考：思考链也是模型实打实逐字生成的 token，只算正文会
      // 严重低估吞吐（320 输出里 293 是思考，只算 27 会显得模型几乎不动）。
      // 分母优先「思考时长 + 正文时长」（服务端首末 chunk 间隔之和，最纯的
      // 生成时间，不含检索/工具调用留下的空隙）；缺任一段就退回
      // 「总耗时 − 首字」—— ttftMs 是首个 token（含思考），与分子口径一致。
      const totalMs = item.serverDurationMs || item.durationMs
      let tps: number | null = null
      if (output && output > 0) {
        let genMs =
          item.thoughtDurationMs != null && item.answerDurationMs != null
            ? item.thoughtDurationMs + item.answerDurationMs
            : 0
        if (genMs <= 0 && totalMs != null && totalMs > 0) {
          genMs = Math.max(0, totalMs - (item.ttftMs ?? 0))
        }
        if (genMs > 0) tps = Math.round(output / (genMs / 1000))
      }

      const durationText =
        item.durationMs != null ? formatDurationMs(item.durationMs) : ''
      const outputText =
        output != null
          ? `输出 ${output} t${split}`
          : item.tokens != null
            ? `${item.tokens} tokens`
            : ''

      // 窄屏：单行、耗时在最前、不显示模型（用户指定顺序）
      if (compactMeta) {
        const compact: string[] = []
        if (durationText) compact.push(`耗时 ${durationText}`)
        if (outputText) compact.push(outputText)
        if (tps != null) compact.push(`${tps}t/s`)
        return compact.join(' · ')
      }

      // 桌面：信息全展开
      const parts: string[] = []
      if (item.model) {
        // 服务端 model 是「厂商:模型」：'zhipu:glm-4.5-flash'，降级时厂商会变
        // （如 'dashscope:qwen3.7-flash'）。去掉第一段只留模型名 —— 降级一眼
        // 可见，也省宽度。兼容旧格式 'zhipu|glm…'；无分隔符的老值原样显示。
        // 只裁显示，原始值完整存着。
        const label = item.model.replace(/^[^:|]+[:|]\s*/, '').trim()
        if (label) parts.push(label)
      }
      if (outputText) {
        // 命中 prompt cache 的输入量单独标出来：计费与「真实喂了多少新内容」
        // 都靠它，窄屏放不下就不显示
        const cacheNote = item.cachedTokens
          ? `（缓存 ${item.cachedTokens}）`
          : ''
        parts.push(
          input != null && output != null
            ? `输入 ${input}${cacheNote} / ${outputText}`
            : outputText
        )
      }
      if (tps != null) parts.push(`${tps} t/s`)
      if (durationText) parts.push(`耗时 ${durationText}`)
      if (item.ttftMs != null && item.ttftMs > 0) {
        parts.push(`首字 ${formatDurationMs(item.ttftMs)}`)
      }
      if (item.sourcesCount) parts.push(`引用 ${item.sourcesCount}`)
      // 上下文记忆指标：本轮带入 / 被裁掉的历史条数，以及是否用了滚动摘要
      if (item.historyKept || item.historyDropped) {
        parts.push(`记忆 ${item.historyKept ?? 0}/${item.historyDropped ?? 0}`)
      }
      if (item.digestUsed) parts.push('滚动摘要')
      if (item.truncated) parts.push('已截断')
      else if (item.finishReason === 'content_filter') parts.push('内容过滤')
      else if (item.finishReason === 'tool_calls') parts.push('工具调用')
      return parts.join(' · ')
    })()

    const bubbleStyle = useMemo(
      () => [
        chatMessageStyles.bubble,
        { maxWidth: '100%' as const },
        isUser
          ? [chatMessageStyles.bubbleUser, { backgroundColor: theme.bubbleUserBg }]
          : [
            chatMessageStyles.bubbleAi,
            {
              backgroundColor: theme.bubbleAiBg,
              borderColor: theme.border
            }
          ]
      ],
      [isUser, theme]
    )

    /**
     * 图片缩略图的边框 + 阴影，必须加在 <Image> 自己身上：
     * 外层 imageBubble 是透明无背景的，Android 的 elevation 拿不到轮廓，
     * 会投出一个不跟随圆角的矩形黑影；加在 Image 上才贴着 borderRadius:12 走。
     * 三端分别处理：iOS 用 shadow*，Android 用 elevation，Web 用 boxShadow。
     */

    /**
     * 气泡可用宽度：代码框要按它钉死宽度（否则宽度跟着最长代码行走 →
     * 气泡 shrink-to-fit 跟着抖 → 兄弟段落重排、高度跳）。稳定块一级的
     * onLayout 只在真的变化时 setState，不会每帧重渲染。
     */
    const [rowWidth, setRowWidth] = useState(0)

    const dynamicMarkdownStyles = useMemo(
      () => createDynamicMarkdownStyles(theme, rowWidth),
      [theme, rowWidth]
    )

    // 系统标记行（如「用户中止对话」）：居中、哥倩、不走气泡，跟正常气泡错开
    if (item.systemNote) {
      return (
        <View style={INVERTED_CHAT_LIST ? CELL_INVERSION_STYLE : null}>
          <View style={chatMessageStyles.systemNoteRow}>
            <Text style={[chatMessageStyles.systemNoteText, { color: theme.textMuted }]}>
              {item.content}
            </Text>
          </View>
        </View>
      )
    }

    return (
      <Animated.View
        style={[
          entranceStyle,
          INVERTED_CHAT_LIST ? CELL_INVERSION_STYLE : null,
          // 钉顶预留：给这条（流式回答）至少一屏高。回答没长满前高度恒定
          // → 外层收不到内容尺寸变化 → 不回补、不抖；回答超过一屏后自然撑开。
          reserveMinHeight > 0 ? { minHeight: reserveMinHeight } : null
        ]}
        onLayout={onLayout}
      >
        <View
          style={[
            chatMessageStyles.messageRow,
            isLast && { marginBottom: 0 },
            isUser ? chatMessageStyles.rowUser : chatMessageStyles.rowAi,
            WEB_ROW_CONTAINMENT
          ]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width
            setRowWidth((prev) => (prev === w ? prev : w))
          }}
        >
          {/* 用户消息带附件：统一「附件列」——文档/视频行 + 图片缩略图 + 正文气泡 */}
          {isUser && hasAttachments ? (
            <View style={chatMessageStyles.userAttachmentsColumn}>
              {attachmentRows}
              {imageAttachments.length > 0 ? (
                /* 图片卡片：无框样式 —— 不套正文气泡的 14px padding / 底色 / 描边，
                   只让缩略图自己带圆角直接坐在聊天背景上（主流 IM 的纯图片消息样式）。
                   ⚠️ 不能只把 padding 归零：缩略图 borderRadius 比气泡小，
                     外层圆角会把子图内角切出「双环」。正确做法是整块不要底色。 */
                <View
                  style={[
                    chatMessageStyles.imageBubble,
                    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
                  ]}
                >
                  {imageAttachments.map((a, idx) => (
                    <TouchableOpacity
                      key={`${a.name}-${idx}`}
                      activeOpacity={0.85}
                      onPress={() =>
                        onPreviewImage?.(
                          imageAttachments.map(imageSourceOf),
                          idx,
                        )
                      }
                      style={
                        Platform.OS === 'web'
                          ? ({ cursor: 'pointer' } as any)
                          : undefined
                      }
                    >
                      <Image
                        source={{ uri: imageSourceOf(a) }}
                        style={[
                          chatMessageStyles.imageThumb,
                          {
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: theme.isDark
                              ? 'rgba(255,255,255,0.18)'
                              : 'rgba(0,0,0,0.12)',
                            ...Platform.select({
                              web: { boxShadow: '0 2px 10px rgba(0,0,0,0.18)' },
                              default: {
                                shadowColor: '#000',
                                shadowOpacity: theme.isDark ? 0.45 : 0.18,
                                shadowRadius: 8,
                                shadowOffset: { width: 0, height: 2 },
                                elevation: 3,
                              },
                            }),
                          },
                        ]}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {/* 正文气泡：无正文时渲染空壳会被 padding 撑出白块 → 直接不渲染 */}
              {item.content ? (
                <View style={[bubbleStyle, chatMessageStyles.textBubbleBelowAttachments]}>
                  <Text
                    selectable={textSelectable}
                    style={[
                      chatMessageStyles.messageText,
                      { color: theme.bubbleUserText }
                    ]}
                  >
                    {item.content}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={bubbleStyle}>
              {isThinking ? (
                <View style={chatMessageStyles.thinkingContainer}>
                  <ActivityIndicator
                    size="small"
                    color={theme.textMuted}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      chatMessageStyles.messageText,
                      { color: theme.textMuted, fontStyle: 'italic' }
                    ]}
                  >
                    思考中...
                  </Text>
                </View>
              ) : isUser ? (
                item.content ? (
                  <Text
                    selectable={textSelectable}
                    style={[
                      chatMessageStyles.messageText,
                      { color: theme.bubbleUserText }
                    ]}
                  >
                    {item.content}
                  </Text>
                ) : null
              ) : (
                <View>
                  {hasThought ? (
                    <ThoughtCollapsible
                      thought={item.thought!}
                      theme={theme}
                      isStreaming={isStreaming}
                      // 思考阶段边界：正文（answer）开始吐字 → 立即秒收思考框。
                      // 流式期 content 由 ChatArea 合并进 item，空=还在思考。
                      thoughtDone={!!(item.content && item.content.trim())}
                      onToggle={
                        onThoughtToggle
                          ? (expanding, height) =>
                            onThoughtToggle(item.id, expanding, height)
                          : undefined
                      }
                    />
                  ) : null}

                  {/* 流式正文：两端统一用**段落级增量 markdown**（StreamingMarkdown）——
                    已成形的段落被 StableMarkdown memo 住，每帧只有「还在长的那一段尾巴」
                    重新解析 + 重排，所以成本是有界的；而且与结束后用的是同一套
                    markdown 渲染 + 同一套样式 ⇒
                      ① 吐字期就能看到粗体/代码块/列表/表格，不再是 `**原文**`、
                        未被识别的 ``` 围栏；
                      ② 吐字结束不再「换渲染器 + 行高 22→24」地跳高度。
                    原生端之所以过去走纯 Text，是怕「JS 线程解析 markdown + 重建节点」
                    拖慢吐字（那时还要靠贴底补帧，掉一帧就看得见）。现在 inverted 布局下
                    底部是自动的、不需要任何滚动命令，这份成本只影响吐字流畅度本身，
                    且有 memo 兜底，所以在原生上也直接渲染 markdown。 */}
                  {/* 正文：统一走 StreamingMarkdown —— 流式期段落级增量；结束时不切换渲染器
                  （否则整棵树卸载重挂 → 布局跳一下），只把最后一段升格为稳定块，
                  其余块 memo 命中零重排。rules/style 流式与结束完全一致。 */}
                  <StreamingMarkdown
                    content={renderContent}
                    streaming={isStreaming}
                    style={dynamicMarkdownStyles}
                    selectable={textSelectable}
                    rules={markdownRules}
                  />
                </View>
              )}

              {/* 来源列表：正文角标之外的兜底入口。只在吐字结束后挂载，
                  流式期完全不占位，与 MessageActions ready 同帧出现 */}
              {!isUser && hasContent && !isStreaming && item.sources && (
                <SourcesList sources={item.sources} theme={theme} />
              )}

              {/* 复制 + 喇叭：吐字完成（ready）后才可点，之前只占位不跳动 */}
              {!isUser && hasContent && (
                <MessageActions
                  content={item.content}
                  messageId={item.id}
                  theme={theme}
                  isPlaying={isPlaying}
                  onPlayingChange={setPlayingMsgId}
                  ready={!isStreaming}
                  metaText={metaText}
                  // 窄屏单行（用户要求不折行）；桌面留 2 行放下完整统计
                  metaLines={compactMeta ? 1 : 2}
                />
              )}
            </View>
          )}
        </View>
      </Animated.View>
    )
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.content === next.item.content &&
    prev.item.thought === next.item.thought &&
    prev.theme === next.theme &&
    prev.isStreaming === next.isStreaming &&
    prev.isLast === next.isLast &&
    prev.item.systemNote === next.item.systemNote &&
    prev.item.tokens === next.item.tokens &&
    prev.item.durationMs === next.item.durationMs &&
    // done 统计字段：不进比较器的话 React.memo 会挡住气泡下方小字的刷新
    prev.item.model === next.item.model &&
    prev.item.completionTokens === next.item.completionTokens &&
    // token 细分字段：不进比较器的话 memo 会挡住 meta 行的刷新
    prev.item.inputTokens === next.item.inputTokens &&
    prev.item.reasoningTokens === next.item.reasoningTokens &&
    prev.item.firstAnswerTokenMs === next.item.firstAnswerTokenMs &&
    prev.item.cachedTokens === next.item.cachedTokens &&
    prev.item.thoughtDurationMs === next.item.thoughtDurationMs &&
    // answerDurationMs 是 t/s 的分母，少了它结束态会一直显示旧速度
    prev.item.answerDurationMs === next.item.answerDurationMs &&
    prev.item.finishReason === next.item.finishReason &&
    prev.item.truncated === next.item.truncated &&
    prev.item.ttftMs === next.item.ttftMs &&
    prev.item.serverDurationMs === next.item.serverDurationMs &&
    prev.item.sourcesCount === next.item.sourcesCount &&
    // sources 帧在流末尾才到：不进比较器的话 memo 会挡住角标/来源列表刷新
    prev.item.sources === next.item.sources &&
    prev.item.historyKept === next.item.historyKept &&
    prev.item.historyDropped === next.item.historyDropped &&
    prev.item.digestUsed === next.item.digestUsed &&
    prev.isPlaying === next.isPlaying &&
    prev.onPreviewImage === next.onPreviewImage &&
    prev.onPreviewFile === next.onPreviewFile &&
    prev.textSelectable === next.textSelectable &&
    prev.reserveMinHeight === next.reserveMinHeight &&
    prev.animateIn === next.animateIn &&
    prev.onThoughtToggle === next.onThoughtToggle &&
    prev.item.images === next.item.images &&
    prev.item.attachments === next.item.attachments
)

export default ChatMessageItem
