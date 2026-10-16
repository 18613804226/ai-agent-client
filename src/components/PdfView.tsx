import React, { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

export interface PdfViewProps {
  /** 可用的 PDF 地址：原生是 file://（选中时拷贝进缓存的路径）或 https */
  src: string
  title?: string
  theme: any
}

/**
 * react-native-pdf 的原生 Fabric 组件（RNPDFPdfView）。
 *
 * ⚠️ 为什么不直接用 `require('react-native-pdf')` 的默认导出：
 * 这个库（7.0.5）的 JS 包装层在 render 里把 `{...this.props}`（含 source /
 * onLoadComplete / onError …）整体摊到原生组件上。RN 0.86 默认新架构（Fabric）
 * 对原生组件做严格 prop 校验：只认 `fabric/RNPDFPdfNativeComponent.js` 里
 * 声明的 props（path / page / scale / fitPolicy / spacing / onChange …），
 * 收到未声明的 prop 直接抛 `ReferenceError: Property 'onLoadComplete' doesn't exist`
 * （旧架构只 warn）。而且这个库用的是自己的 JS 包装（App 侧无法拦截它的 spread）。
 *
 * 所以这里绕过包装层，直接渲染原生 Fabric 组件，只传它声明的 props + onChange
 * （文档内容走 `path`，事件走 `onChange` 的 `message` 字符串，格式与库一致）。
 */
type PdfNativeModule = { default: React.ComponentType<any> } | null

let pdfNative: PdfNativeModule | undefined
let pdfLoadError = ''

function getPdfNative(): { mod: PdfNativeModule; error: string } {
  if (pdfNative !== undefined) {
    return { mod: pdfNative, error: pdfLoadError }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfNative = require('react-native-pdf/fabric/RNPDFPdfNativeComponent')
    pdfLoadError = ''
  } catch (e: any) {
    pdfNative = null
    pdfLoadError = e?.message || 'PDF 渲染组件加载失败'
  }
  return { mod: pdfNative ?? null, error: pdfLoadError }
}

/** file://… → 原生 PdfRenderer 需要的本地文件路径 */
function toLocalPath(src: string): string | null {
  if (!src) return null
  if (src.startsWith('file://')) {
    try {
      return decodeURIComponent(src.replace(/^file:\/\//i, ''))
    } catch {
      return src.replace(/^file:\/\//i, '')
    }
  }
  return null
}

/**
 * 应用内原生 PDF 真预览（Android PdfRenderer / iOS PDFKit）。
 *
 * 渲染自 react-native-pdf 的原生 Fabric 组件，但不经它的 JS 包装（见上）。
 * 支持滚动 / 双指缩放 / 翻页，不再依赖系统应用。
 */
export default function PdfView({ src, title, theme }: PdfViewProps) {
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading')
  const [errMsg, setErrMsg] = useState('')
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)

  const { mod: pdf, error: loadError } = getPdfNative()

  // 换文件要重置状态，否则上一个文件的页码/报错会残留
  const [lastSrc, setLastSrc] = useState(src)
  if (src !== lastSrc) {
    setLastSrc(src)
    setState('loading')
    setErrMsg('')
    setPage(1)
    setNumPages(0)
  }

  const path = useMemo(() => toLocalPath(src), [src])

  /** 原生事件：message 形如 "loadComplete|页数|宽|高|目录" / "pageChanged|页|总页" / "error|原因" */
  const onChange = useCallback((event: any) => {
    const msg: string | undefined = event?.nativeEvent?.message
    if (typeof msg !== 'string') return
    const m = msg.split('|')
    switch (m[0]) {
      case 'loadComplete': {
        const n = Number(m[1]) || 0
        // ⚠️ 原生在每次重绘都会重发 loadComplete；值不变就 bail out，
        // 否则 setState → 重渲染 → 原生再发，形成死循环（表现为持续高占用）
        setNumPages((prev) => (prev === n ? prev : n))
        setState((prev) => (prev === 'idle' ? prev : 'idle'))
        break
      }
      case 'pageChanged': {
        const p = Number(m[1]) || 1
        setPage((prev) => (prev === p ? prev : p))
        const n = Number(m[2]) || 0
        if (n) setNumPages((prev) => (prev === n ? prev : n))
        break
      }
      case 'error':
        setErrMsg(m[1] || 'PDF 打开失败，可能已损坏或需要密码')
        setState('error')
        break
      default:
        break
    }
  }, [])

  const openExternally = useCallback(() => {
    Linking.openURL(src).catch(() => {})
  }, [src])

  // ① 原生组件没装上（原生模块未 autolink / dev client 未重建）→ 降级
  if (!pdf) {
    return (
      <View style={styles.center}>
        <Feather name="alert-circle" size={52} color={theme.textMuted} />
        <Text style={[styles.errTitle, { color: theme.textMain }]}>
          当前版本未内置 PDF 预览
        </Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          需要重新构建应用后生效{loadError ? `\n（${loadError}）` : ''}
        </Text>
        <Text style={[styles.link, { color: theme.textMuted }]} onPress={openExternally}>
          用其他应用打开
        </Text>
      </View>
    )
  }

  // ② 非本地文件（http/https 等）：原生 path 只认本地文件，交给系统打开
  if (!path) {
    return (
      <View style={styles.center}>
        <Feather name="file-text" size={52} color={theme.textMuted} />
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          仅支持本地 PDF 预览
        </Text>
        <Text style={[styles.link, { color: theme.textMuted }]} onPress={openExternally}>
          用其他应用打开
        </Text>
      </View>
    )
  }

  const RNPDFPdfView = pdf.default
  return (
    <View style={styles.fill}>
      <RNPDFPdfView
        style={styles.pdf}
        // 原生组件只认这些声明过的 props；文档走 path，事件走 onChange
        path={path}
        page={page}
        minScale={0.5}
        maxScale={4}
        // 0 = 适应宽度
        fitPolicy={0}
        spacing={8}
        enableAntialiasing
        enableDoubleTapZoom
        enableAnnotationRendering
        scrollEnabled
        onChange={onChange}
      />
      {state === 'loading' && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color={theme.textMuted} />
          <Text style={[styles.hint, { color: theme.textMuted }]}>解析中…</Text>
        </View>
      )}
      {state === 'error' && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Feather name="alert-circle" size={52} color={theme.textMuted} />
          <Text style={[styles.errTitle, { color: theme.textMain }]}>
            无法打开此 PDF
          </Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>{errMsg}</Text>
          <Text style={[styles.link, { color: theme.textMuted }]} onPress={openExternally}>
            用其他应用打开
          </Text>
        </View>
      )}
      {numPages > 1 && (
        <View
          style={[
            styles.pageBadge,
            { backgroundColor: theme.historyActiveBg ?? 'rgba(0,0,0,0.5)' }
          ]}
        >
          <Text style={[styles.pageText, { color: theme.textMain }]}>
            {page} / {numPages}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pdf: { flex: 1, backgroundColor: 'transparent' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24
  },
  errTitle: {
    fontSize: 15,
    fontWeight: '600'
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center'
  },
  link: {
    fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: 4
  },
  pageBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10
  },
  pageText: {
    fontSize: 11,
    lineHeight: 15
  }
})