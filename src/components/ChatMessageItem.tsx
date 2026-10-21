import React, { memo, useEffect, useMemo } from 'react'
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform, Image } from 'react-native'
import Markdown from 'react-native-markdown-display'
import { Feather } from '@expo/vector-icons'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming
} from 'react-native-reanimated'
import { INVERTED_CHAT_LIST, CELL_INVERSION_STYLE } from '../utils/chatScroll'
import { WEB_ROW_CONTAINMENT } from '../utils/layout'
import { selectableMarkdownRules, nonSelectableMarkdownRules, webMarkdownRules } from './markdown/markdownRules'
import { StreamingMarkdown } from './markdown/StreamingMarkdown'
import ThoughtCollapsible from './ThoughtCollapsible'
import MessageActions from './MessageActions'
import { normalizeInlineEmphasis } from '../utils/normalizeEmphasis'
import { chatMessageStyles, createDynamicMarkdownStyles } from './ChatMessageItem.styles'
import type { Message, ThemeType } from '../types/chat'
import { type PickedAttachment, formatFileSize } from '../hooks/useImagePicker'

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
                  <Feather
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
                <Feather
                  name="chevron-right"
                  size={15}
                  color={theme.bubbleUserText}
                  style={{ opacity: 0.6 }}
                />
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
      !isStreaming && item.content
        ? normalizeInlineEmphasis(item.content.trimEnd())
        : ''

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

    const dynamicMarkdownStyles = useMemo(
      () => createDynamicMarkdownStyles(theme),
      [theme]
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
                  {isStreaming ? (
                    // 月球自转是正文 <Text> 末尾的月相 emoji 内联节点（见 StreamingMarkdown），
                    // 纯文本不依赖 transform → 安卓也稳，且严格贴着最后一个字、随文字换行。
                    <StreamingMarkdown
                      content={item.content || ''}
                      style={dynamicMarkdownStyles}
                      selectable={textSelectable}
                      rules={
                        // 与「结束后」保持同一套规则：风格不变、选中能力也不变
                        Platform.OS === 'web'
                          ? webMarkdownRules
                          : textSelectable
                            ? selectableMarkdownRules
                            : nonSelectableMarkdownRules
                      }
                    />
                  ) : (
                    <Markdown
                      style={dynamicMarkdownStyles}
                      rules={
                        // Web：用自定义规则（含复制按钮）；原生：沿用单一可选文本树
                        Platform.OS === 'web'
                          ? webMarkdownRules
                          : textSelectable
                            ? selectableMarkdownRules
                            : nonSelectableMarkdownRules
                      }
                    >
                      {renderContent}
                    </Markdown>
                  )}
                </View>
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
    prev.isPlaying === next.isPlaying &&
    prev.onPreviewImage === next.onPreviewImage &&
    prev.onPreviewFile === next.onPreviewFile &&
    prev.textSelectable === next.textSelectable &&
    prev.reserveMinHeight === next.reserveMinHeight &&
    prev.animateIn === next.animateIn &&
    prev.onThoughtToggle === next.onThoughtToggle &&
    (prev.item.images?.length ?? 0) === (next.item.images?.length ?? 0) &&
    (prev.item.attachments?.length ?? 0) === (next.item.attachments?.length ?? 0)
)

export default ChatMessageItem
