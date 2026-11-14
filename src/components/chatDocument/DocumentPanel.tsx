import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { StreamingMarkdown } from '../markdown/StreamingMarkdown'
import { webMarkdownRules } from '../markdown/markdownRules'
import { createDynamicMarkdownStyles } from '../ChatMessageItem.styles'
import { MyToast } from '../GlobalToast'
import type { ThemeType } from '../../types/chat'
import {
  DOC_PANEL_WIDTH,
  closeChatDocument,
  setChatDocumentWidth,
  useChatDocumentState
} from '../../utils/chatDocument'
import { exportMarkdown, exportDocx, buildDocxBlob } from './docDownload'
import { renderDocxBufferPreview } from '../../utils/officePreview'

/** Web 真实 DOM 容器：docx 预览由 docx-preview 命令式注入 HTML */
const DivTag: any = 'div'

/**
 * 文档面板：宽屏 Web 常驻在聊天区右侧（聊天区/输入栏由主页面同步收缩），
 * 窄屏 Web 退化成全屏 Modal。内容就是本轮回复里抽出来的 Markdown 原文，
 * .md 原样下载，.docx 由 md 转换生成。
 */
export default function DocumentPanel({
  theme,
  isPCWeb
}: {
  theme: ThemeType
  isPCWeb: boolean
}) {
  const { doc, visible, width } = useChatDocumentState()
  const [busy, setBusy] = useState<'md' | 'docx' | null>(null)
  const mdStyles = useMemo(
    () => createDynamicMarkdownStyles(theme, width - 48),
    [theme, width]
  )

  // 拖左边缘调宽度：拖动起点宽度 + dx 反向（向左拖 = 变宽）
  const widthRef = useRef(width)
  widthRef.current = width
  const dragStartRef = useRef(width)
  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStartRef.current = widthRef.current
        },
        onPanResponderMove: (_e, g) => {
          setChatDocumentWidth(dragStartRef.current - g.dx)
        }
      }),
    []
  )

  // 弹出动画：面板/弹层出现时从右侧滑入 + 淡入（宽屏右侧面板与窄屏全屏 Modal 共用）
  const progress = useSharedValue(0)
  useEffect(() => {
    if (!visible) return
    progress.value = 0
    progress.value = withTiming(1, {
      duration: 240,
      easing: Easing.out(Easing.cubic)
    })
  }, [visible, doc?.id, progress])
  const popStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * width }]
  }))

  // Web：预览窗滚动条与聊天列表同款 —— 默认隐藏，鼠标移入才显示
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const d = (globalThis as any).document
    if (!d) return
    if (!d.getElementById('doc-panel-scrollbar')) {
      const style = d.createElement('style')
      style.id = 'doc-panel-scrollbar'
      style.textContent = `
        #doc-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }
        #doc-scroll:hover { scrollbar-color: rgba(128,128,128,0.5) transparent; }
        #doc-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        #doc-scroll::-webkit-scrollbar-track { background: transparent; }
        #doc-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 8px; }
        #doc-scroll:hover::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.45); }
        #doc-scroll::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.65); }
      `
      d.head.appendChild(style)
    }
    // Word 真预览：docx-preview 渲染出的 A4 页面按面板宽度收缩，
    // 避免 21cm 固定页宽在窄面板里横向溢出
    if (!d.getElementById('doc-panel-docx-fit')) {
      const style = d.createElement('style')
      style.id = 'doc-panel-docx-fit'
      style.textContent = `
        #doc-scroll .docx-wrapper { padding: 0 !important; background: transparent !important; }
        #doc-scroll .docx-wrapper > section.docx {
          width: 100% !important;
          min-width: 0 !important;
          margin: 0 0 16px 0 !important;
          /* Word 默认 1 英寸页边距在窄面板里像一大块内边距，收窄到常规留白 */
          padding: 20px !important;
          box-shadow: none !important;
        }
        #doc-scroll .docx-wrapper > section.docx h1,
        #doc-scroll .docx-wrapper > section.docx h2,
        #doc-scroll .docx-wrapper > section.docx h3,
        #doc-scroll .docx-wrapper > section.docx h4,
        #doc-scroll .docx-wrapper > section.docx h5,
        #doc-scroll .docx-wrapper > section.docx h6 {
          color: #000000 !important;
        }
      `
      d.head.appendChild(style)
    }
  }, [])

  // Word 预览：用「下载 .docx」同一份字节做真渲染，而不是拿 Markdown 冒充 Word
  const docxHostRef = useRef<any>(null)
  const [docxState, setDocxState] = useState<'idle' | 'loading' | 'error'>('idle')
  useEffect(() => {
    if (Platform.OS !== 'web' || !doc || doc.format !== 'doc') return
    const host = docxHostRef.current
    if (!host) return
    let cancelled = false
    setDocxState('loading')
    ;(async () => {
      try {
        const blob = await buildDocxBlob(doc)
        if (cancelled) return
        const buf = await blob.arrayBuffer()
        if (cancelled) return
        await renderDocxBufferPreview(buf, host, !!theme.isDark)
        if (!cancelled) setDocxState('idle')
      } catch {
        if (!cancelled) setDocxState('error')
      }
    })()
    return () => {
      cancelled = true
      // 清掉内嵌 base64 图片，切文档/关面板不占内存
      try {
        host.innerHTML = ''
      } catch {}
    }
  }, [doc, theme.isDark])

  const handleExport = async (kind: 'md' | 'docx') => {
    if (!doc || busy) return
    setBusy(kind)
    try {
      if (kind === 'md') await exportMarkdown(doc)
      else await exportDocx(doc)
    } catch (e: any) {
      MyToast.show(e?.message || '导出失败，请重试')
    } finally {
      setBusy(null)
    }
  }

  if (!doc) return null

  const bg = theme.isDark ? '#0E0F11' : '#FFFFFF'
  const subtle = theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'

  const body = (
    <Animated.View
      style={[
        styles.panel,
        isPCWeb ? styles.panelDesktop : styles.panelModal,
        isPCWeb ? { width } : null,
        popStyle,
        { backgroundColor: bg, borderColor: theme.border }
      ]}
    >
      {/* 拖拽条：桌面宽屏下拖左边缘调整面板宽度，聊天区同步收缩 */}
      {isPCWeb && (
        <View {...resizeResponder.panHandlers} style={styles.resizeHandle}>
          <View style={[styles.resizeLine, { backgroundColor: theme.border }]} />
        </View>
      )}
      <View style={[styles.header, { borderColor: theme.border }]}>
        <Text style={styles.headerIcon}>📄</Text>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.textMain }]}>
            {doc.title}
            {doc.format === 'doc' ? '.docx' : '.md'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            {doc.format === 'doc' ? 'Word 文档' : 'Markdown 文档'} · 来自本轮回复
          </Text>
        </View>
        <TouchableOpacity
          onPress={closeChatDocument}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.closeBtn, { backgroundColor: subtle }]}
        >
          <Text style={[styles.closeText, { color: theme.textMuted }]}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* 用户要什么格式就给什么格式：只露出目标格式的下载按钮
          （没指定时 doc.format 由模型输出的围栏语言决定） */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => handleExport(doc.format === 'doc' ? 'docx' : 'md')}
          disabled={!!busy}
          style={[styles.actionBtn, { borderColor: theme.border }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.textMain} />
          ) : (
            <Text style={[styles.actionText, { color: theme.textMain }]}>
              {doc.format === 'doc' ? '下载 .docx' : '下载 .md'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        nativeID="doc-scroll"
        style={styles.scroll}
        contentContainerStyle={
          doc.format === 'doc' && Platform.OS === 'web'
            ? styles.scrollContentDocx
            : styles.scrollContent
        }
        showsVerticalScrollIndicator
      >
        {doc.format === 'doc' && Platform.OS === 'web' ? (
          <>
            <DivTag
              ref={docxHostRef}
              className="docx-host"
              style={styles.docxHost}
            />
            {docxState === 'loading' && (
              <View style={styles.docxLoading}>
                <ActivityIndicator color={theme.textMuted} />
                <Text style={[styles.footerText, { color: theme.textMuted }]}>
                  正在生成 Word 预览…
                </Text>
              </View>
            )}
            {docxState === 'error' && (
              <>
                <Text style={[styles.footerText, { color: theme.textMuted }]}>
                  Word 预览生成失败，下面是 Markdown 内容
                </Text>
                <StreamingMarkdown
                  content={doc.content}
                  streaming={false}
                  style={mdStyles}
                  rules={webMarkdownRules}
                  selectable
                />
              </>
            )}
          </>
        ) : (
          <StreamingMarkdown
            content={doc.content}
            streaming={false}
            style={mdStyles}
            rules={webMarkdownRules}
            selectable
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { borderColor: theme.border }]}>
        <Text style={[styles.footerText, { color: theme.textMuted }]}>
          {doc.format === 'doc'
            ? '.docx 由 Markdown 转换，可在 Word 中继续编辑'
            : '.md 为原始 Markdown，可在任意编辑器继续编辑'}
        </Text>
      </View>
    </Animated.View>
  )

  if (!isPCWeb) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={closeChatDocument}
      >
        {body}
      </Modal>
    )
  }
  return visible ? body : null
}

const styles = StyleSheet.create({
  panel: {
    borderLeftWidth: 1,
    overflow: 'hidden'
  },
  panelDesktop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DOC_PANEL_WIDTH
  },
  panelModal: {
    flex: 1
  },
  resizeHandle: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 8,
    zIndex: 3,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'col-resize' as any } : {})
  },
  resizeLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    opacity: 0.7
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1
  },
  headerIcon: { fontSize: 20, marginRight: 10 },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600' },
  subtitle: { fontSize: 11, marginTop: 2 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: { fontSize: 14 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  actionBtn: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionText: { fontSize: 12, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 32 },
  /** docx 页面自带内边距，外层不再重复加左右 padding */
  scrollContentDocx: { paddingBottom: 32, paddingHorizontal: 0 },
  docxHost: { width: '100%' },
  docxLoading: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  footerText: { fontSize: 11, lineHeight: 16 }
})
