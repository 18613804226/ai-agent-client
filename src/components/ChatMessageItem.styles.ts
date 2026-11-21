import { StyleSheet, Platform, Dimensions } from 'react-native'
import { RADIUS } from '../constants/theme'
import { MONO_FONT } from './markdown/markdownRules'

export const chatMessageStyles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    marginBottom: 24,
    alignItems: 'flex-start'
  },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  /**
   * 用户气泡样式（暗色走主色渐变/提亮纯色，亮色走淡蓝气泡）。
   * AI 回复已去气泡化，不走这个样式。
   */
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: RADIUS.lg,
    maxWidth: '88%'
  },
  bubbleUser: { borderTopRightRadius: 4, alignSelf: 'flex-end' },
  /**
   * AI 回复去气泡：铺满行宽、无背景无描边，仅留 2px 微距对齐边缘。
   * 必须写 flex: 1 + width: '100%'，让内部代码块拿到确定宽度，
   * 避免「气泡宽 ↔ 代码框宽」循环依赖导致抖动。
   */
  bubbleAi: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 2,
    paddingVertical: 2,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    alignSelf: 'stretch'
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6
  },
  messageText: { fontSize: 15, lineHeight: 23, fontWeight: '400' },
  /** 用户消息里的引用追问小卡片 */
  userQuoteWrap: {
    gap: 8
  },
  userQuoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6
  },
  userQuoteIcon: {
    marginTop: 2,
    flexShrink: 0,
    opacity: 0.75
  },
  userQuoteText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.85
  },
  /** 附件列整体容器：纵向堆叠，靠右对齐 */
  userAttachmentsColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
    maxWidth: '88%'
  },
  /** 文档 / 视频附件卡片：跟气泡同色背景 + 圆角 + 阴影 */
  attachmentCard: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 260,
    minHeight: 38,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
    })
  },
  /** 文件类型图标背景圆形 */
  attachmentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  /** 文件名 + 大小纵向堆叠 */
  attachmentInfo: {
    flexShrink: 1,
    gap: 1
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1
  },
  attachmentMeta: {
    fontSize: 11,
    lineHeight: 14,
    opacity: 0.6
  },
  /** 右侧箭头 */
  attachmentChevron: {
    opacity: 0.6
  },
  /** 图片缩略图网格 */
  imageThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    resizeMode: 'cover',
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.12)' },
      default: { elevation: 2 }
    })
  },
  /** 图片缩略图容器：透明背景直接坐在聊天背景上 */
  imageBubble: {
    padding: 0,
    marginBottom: 4,
    alignSelf: 'flex-end',
    backgroundColor: 'transparent',
    borderWidth: 0
  },
  /** 文本气泡在附件下方的顶部外边距 */
  textBubbleBelowAttachments: {
    marginTop: 6,
    maxWidth: '100%'
  },
  systemNoteRow: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 6
  },
  systemNoteText: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    opacity: 0.6
  },
  /** AI 回复里抽出来的文档：点开右侧文档面板 */
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: RADIUS.md
  },
  docCardIcon: { fontSize: 18, marginRight: 10 },
  docCardText: { flex: 1 },
  docCardTitle: { fontSize: 13, fontWeight: '600' },
  docCardHint: { fontSize: 11, marginTop: 2 },
  docCardArrow: { fontSize: 16, marginLeft: 8 },
})

/**
 * @param rowWidth 消息行（气泡可用）宽度，由 ChatMessageItem 量到后传入。
 *                 传 0 表示还没量到 → 退回按窗口宽度估算。
 */
export const createDynamicMarkdownStyles = (
  theme: {
    isDark: boolean
    textMain: string
    textMuted: string
    border: string
    borderSubtle?: string
    codeBg?: string
    codeBorder?: string
  },
  rowWidth = 0
) =>
  StyleSheet.create({
    body: {
      fontSize: 15,
      lineHeight: 26,
      fontWeight: '400' as const,
      color: theme.textMain
    },
    strong: {
      fontWeight: '700' as const,
      color: theme.isDark ? '#FFFFFF' : '#111111'
    },
    // 角标只做颜色弱化：不加背景色块、不叠字号（缩字号会贴基线变下标）。
    // 上标效果由 toSuperscriptCitations 的 Unicode 上标字符实现。
    citation: {
      color: theme.textMuted
    },
    // 软换行 / 硬换行不再配样式：对应规则直接返回纯文本 '\n'（见
    // markdownRules.hardbreak/softbreak）。此前包在 <Text lineHeight:24>
    // 里会让每个单换行额外撑出一行（多段回复底部凭空多一行的根因）。
    // 保留库默认即可，这里刻意不写 softbreak/hardbreak 键。
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
      color: theme.textMain,
      // 列表/引用回退 View 盒子后，段落不再坐在 body 的 <Text> 里，
      // 字号/行高必须自带，否则文字掉回默认 14px、与正文行高错位压行
      fontSize: 15,
      lineHeight: 26,
      fontWeight: '400' as const
    },
    heading1: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: theme.isDark ? '#FFFFFF' : theme.textMain,
      marginTop: 8,
      marginBottom: 4,
      lineHeight: 30
    },
    heading2: {
      fontSize: 18,
      fontWeight: '700' as const,
      color: theme.isDark ? '#FFFFFF' : theme.textMain,
      marginTop: 6,
      marginBottom: 4,
      lineHeight: 26
    },
    heading3: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: theme.isDark ? '#FFFFFF' : theme.textMain,
      marginTop: 4,
      marginBottom: 2,
      lineHeight: 24
    },
    code_inline: {
      color: theme.textMain,
      fontSize: 14,
      fontFamily: MONO_FONT,
      padding: 3,
      borderWidth: 0,
      ...(Platform.OS === 'web'
        ? {
            backgroundColor: theme.isDark
              ? 'rgba(255,255,255,0.09)'
              : 'rgba(0,0,0,0.06)',
            borderRadius: 5,
            paddingHorizontal: 5
          }
        : { backgroundColor: 'transparent' as const })
    },
    fence: {
      backgroundColor: 'transparent',
      color: theme.isDark ? '#d4d4d4' : '#333333',
      borderRadius: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
      lineHeight: 20,
      fontSize: 14,
      fontFamily: MONO_FONT,
      borderWidth: 0,
      display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
      ...(Platform.OS === 'web' ? { width: '100%' as const } : null),
      verticalAlign: 'top' as any,
      marginTop: 0,
      marginBottom: 0
    },
    code_block: {
      backgroundColor: 'transparent',
      color: theme.isDark ? '#d4d4d4' : '#333333',
      borderRadius: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
      lineHeight: 20,
      fontSize: 14,
      fontFamily: MONO_FONT,
      borderWidth: 0,
      display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
      ...(Platform.OS === 'web' ? { width: '100%' as const } : null),
      verticalAlign: 'top' as any,
      marginTop: 0,
      marginBottom: 0
    },
    codeBox: {
      backgroundColor: theme.codeBg ?? (theme.isDark ? '#141518' : '#F4F6F8'),
      borderWidth: 1,
      borderColor:
        theme.codeBorder ??
        (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingTop: 34,
      paddingBottom: 10,
      marginTop: 12,
      marginBottom: 0,
      // 代码框宽度必须**钉死**：不写的话它跟着内容宽（最长代码行），容器又是
      // shrink-to-fit → 宽度跟着内容走 → 代码按宽度断行、行数反算回高度，
      // 宽度抖一下高度就抖一下。封顶用的 maxWidth 不算钉死（内容变宽它仍会变宽），
      // 所以这里用确定值：Web 用 100%，原生用「消息行宽 − bubbleAi 水平内边距」。
      // 4 = bubbleAi paddingHorizontal 2*2（已去气泡、无边框）；量不到时退回按窗口宽度估算（scrollContent 16*2 + 4 = 36）。
      ...(Platform.OS === 'web'
        ? { width: '100%' as const }
        : rowWidth > 0
          ? { width: Math.max(120, rowWidth - 4) }
          : { maxWidth: Math.max(120, Dimensions.get('window').width - 36) }),
    },
    codeText: {
      color: theme.isDark ? '#d4d4d4' : '#333333',
      fontFamily: MONO_FONT,
      fontSize: 14,
      lineHeight: 20
    },
    codeCopyBtn: {
      position: 'absolute' as const,
      top: 6,
      right: 6,
      width: 28,
      height: 28,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderRadius: 14,
      backgroundColor: 'transparent',
      zIndex: 10,
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null)
    },
    codeCopyBtnActive: {
      backgroundColor: theme.isDark
        ? 'rgba(255, 255, 255, 0.12)'
        : 'rgba(0, 0, 0, 0.08)'
    },
    codeCopyIcon: {
      color: theme.textMuted
    },
    codeCopyTooltip: {
      position: 'absolute' as const,
      right: 0,
      bottom: 30,
      width: 72,
      paddingVertical: 5,
      borderRadius: 5,
      backgroundColor: theme.isDark ? '#333' : '#222',
      alignItems: 'center' as const,
      zIndex: 20
    },
    codeCopyTooltipText: {
      color: '#fff',
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center' as const,
      ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : null)
    },
    blockquote: {
      backgroundColor: theme.isDark
        ? 'rgba(255,255,255,0.04)'
        : 'rgba(0,0,0,0.05)',
      paddingHorizontal: 10,
      lineHeight: 24,
      color: theme.textMain,
      display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
      verticalAlign: 'top' as any,
      marginTop: 8,
      marginBottom: 4,
      ...(Platform.OS === 'web'
        ? {
            borderLeftWidth: 3,
            borderLeftColor: theme.isDark
              ? 'rgba(255,255,255,0.22)'
              : 'rgba(0,0,0,0.18)',
            borderRadius: 4,
            paddingVertical: 6
          }
        : null)
    },
    list_item: { color: theme.textMain, marginVertical: 2 },
    table: {
      marginVertical: 10,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 6
    },
    ...(Platform.OS === 'web'
      ? {
          bullet_list: { marginTop: 2, marginBottom: 6 },
          ordered_list: { marginTop: 2, marginBottom: 6 }
        }
      : null),
    hr: {
      backgroundColor: theme.borderSubtle ?? theme.border,
      height: 1,
      marginVertical: 12
    }
  })
