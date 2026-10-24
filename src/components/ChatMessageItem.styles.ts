import { StyleSheet, Platform, Dimensions } from 'react-native'
import { MONO_FONT } from './markdown/markdownRules'

export const chatMessageStyles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    marginBottom: 20,
    alignItems: 'flex-start'
  },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start' },
  /**
   * maxWidth: '100%' 是必须的：气泡宽度默认跟着内容走（alignSelf: flex-start），
   * 而内容里如果有代码块，就形成「气泡宽 ↔ 代码框宽」的循环依赖 ——
   * 代码按当前宽度断行、行数又反算回高度，宽度一变行数就变，表现为
   * 「出代码块时气泡被拉得很长、再缩回去」。把气泡宽度钉在容器宽度上，
   * 代码框的断行宽度才稳定。
   */
  bubble: { padding: 14, borderRadius: 16, maxWidth: '100%' },
  bubbleUser: { borderTopRightRadius: 4, alignSelf: 'flex-end' },
  bubbleAi: {
    borderTopLeftRadius: 4,
    borderWidth: 1,
    alignSelf: 'flex-start'
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  /** 附件列整体容器：纵向堆叠，靠右对齐 */
  userAttachmentsColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6
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
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
      default: { elevation: 1 }
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
    marginTop: 6
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
  }
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
  },
  rowWidth = 0
) =>
  StyleSheet.create({
    body: { fontSize: 15, lineHeight: 24, color: theme.textMain },
    strong: { fontWeight: 'bold' as const, color: theme.textMain },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
      color: theme.textMain,
      // 列表/引用回退 View 盒子后，段落不再坐在 body 的 <Text> 里，
      // 字号/行高必须自带，否则文字掉回默认 14px、与正文行高错位压行
      fontSize: 15,
      lineHeight: 24
    },
    heading1: {
      fontSize: 20,
      fontWeight: 'bold' as const,
      color: theme.textMain,
      marginTop: 14,
      marginBottom: 6,
      lineHeight: 28
    },
    heading2: {
      fontSize: 18,
      fontWeight: 'bold' as const,
      color: theme.textMain,
      marginTop: 12,
      marginBottom: 6,
      lineHeight: 24
    },
    heading3: {
      fontSize: 16,
      fontWeight: 'bold' as const,
      color: theme.textMain,
      marginTop: 10,
      marginBottom: 4,
      lineHeight: 22
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
              ? 'rgba(255,255,255,0.12)'
              : 'rgba(0,0,0,0.06)',
            borderRadius: 4,
            paddingHorizontal: 5
          }
        : { backgroundColor: 'transparent' as const })
    },
    fence: {
      backgroundColor: theme.isDark ? '#000' : '#eee',
      color: theme.isDark ? '#d4d4d4' : '#333333',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      lineHeight: 20,
      fontSize: 14,
      fontFamily: MONO_FONT,
      borderWidth: 0,
      display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
      ...(Platform.OS === 'web' ? { width: '100%' as const } : null),
      verticalAlign: 'top' as any,
      marginTop: 10,
      marginBottom: 4
    },
    code_block: {
      backgroundColor: theme.isDark ? '#1e1e1e' : '#f5f5f5',
      color: theme.isDark ? '#d4d4d4' : '#333333',
      borderRadius: 8,
      paddingHorizontal: 10,
      lineHeight: 22,
      fontSize: 14,
      fontFamily: MONO_FONT,
      borderWidth: 0,
      display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
      ...(Platform.OS === 'web' ? { width: '100%' as const } : null),
      verticalAlign: 'top' as any,
      marginTop: 8,
      marginBottom: 4
    },
    codeBox: {
      backgroundColor: theme.isDark ? '#000' : '#eee',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingTop: 34,
      paddingBottom: 8,
      marginTop: 10,
      marginBottom: 4,
      // 代码框宽度必须**钉死**：不写的话它跟着内容宽（最长代码行），气泡又是
      // shrink-to-fit → 气泡宽跟着内容走 → 代码按宽度断行、行数反算回高度，
      // 宽度抖一下高度就抖一下。封顶用的 maxWidth 不算钉死（内容变宽它仍会变宽），
      // 所以这里用确定值：Web 用 100%，原生用「消息行宽 − 气泡 padding/border」。
      // 30 = 气泡 padding 14*2 + border 1*2；量不到时退回按窗口宽度估算。
      ...(Platform.OS === 'web'
        ? { width: '100%' as const }
        : rowWidth > 0
          ? { width: Math.max(120, rowWidth - 30) }
          : { maxWidth: Math.max(120, Dimensions.get('window').width - 64) }),
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
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.05)',
      paddingHorizontal: 10,
      lineHeight: 22,
      color: theme.textMain,
      display: (Platform.OS === 'web' ? 'block' : 'inline-block') as any,
      verticalAlign: 'top' as any,
      marginTop: 8,
      marginBottom: 4
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
    hr: { backgroundColor: theme.border, height: 1, marginVertical: 12 }
  })
