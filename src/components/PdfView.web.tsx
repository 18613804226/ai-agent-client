import React from 'react'

export interface PdfViewProps {
  /** Web 端是 File → objectURL（换文件 / 关闭时回收） */
  src: string
  title?: string
  theme: any
}

/**
 * Web 版 PDF 预览：浏览器自带 PDF 阅读器内嵌（真·滚动/缩放/翻页）。
 * 单独一个文件而非 Platform.OS 分支，是为了让原生那份可以自由 import
 * react-native-pdf —— web bundle 不进这个分支，才不会碰不到原生模块。
 */
export default function PdfView({ src, title, theme }: PdfViewProps) {
  if (!src) return null
  return (
    <iframe
      src={src}
      title={title || 'PDF 预览'}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: theme.isDark ? '#151618' : '#ffffff'
      }}
    />
  )
}
