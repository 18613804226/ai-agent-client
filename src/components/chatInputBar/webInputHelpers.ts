import { useEffect, useLayoutEffect } from 'react'
import { Platform } from 'react-native'
import type { MutableRefObject } from 'react'
import type { PickedAttachment } from '../../hooks/useImagePicker'

/**
 * ChatInputBar 的 Web 专用逻辑（纯搬运自 ChatInputBar.tsx）：
 * - 现代滚动条样式注入（模块级，仅 Web 执行一次）
 * - field-sizing 支持检测
 * - 桌面 Web 粘贴图片 → 附件
 * - 旧内核（OPPO/ColorOS Chromium <123）textarea 高度兜底
 */

// ---- 现代滚动条样式注入（模块级，Web only） ----
if (Platform.OS === 'web') {
  const styleId = 'web-modern-scrollbar'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.innerHTML = `
      textarea::-webkit-scrollbar { width: 5px; }
      textarea::-webkit-scrollbar-track { background: transparent; }
      textarea::-webkit-scrollbar-thumb {
        background: rgba(150, 150, 150, 0.2);
        border-radius: 10px;
      }
      textarea::-webkit-scrollbar-thumb:hover {
        background: rgba(150, 150, 150, 0.5);
      }
    `
    document.head.appendChild(style)
  }
}

// field-sizing: content（textarea 按内容自适应高度）仅 Chrome 123+/2024.3+ 支持。
// OPPO/ColorOS 等旧 Chromium 内核不认 → 用 scrollHeight 的 JS 兜底（见下方 hook）。
export const FIELD_SIZING_SUPPORTED =
  Platform.OS === 'web' &&
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('field-sizing', 'content')

/**
 * 桌面 Web：粘贴图片 → 并入统一附件列表（kind: 'image'）。
 * uploading: true 让遮罩+转圈从第一帧就盖上（外部 effect 会发起预传）。
 */
export function useWebImagePaste(
  enabled: boolean,
  setAttachments: React.Dispatch<React.SetStateAction<PickedAttachment[]>>,
  inputRef: MutableRefObject<any>
) {
  useEffect(() => {
    if (!enabled || !inputRef.current) return
    const nativeElement = inputRef.current

    const handleDOMPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile()
          if (blob) {
            e.preventDefault()
            const reader = new FileReader()
            reader.onload = (event) => {
              const base64String = event.target?.result as string
              if (base64String) {
                // 粘贴的图片同样并入统一附件列表（kind: 'image'）；
                // uploading: true 让遮罩+转圈从第一帧就盖上（effect 会发起预传）
                setAttachments((prev) => [
                  ...prev,
                  { uri: base64String, kind: 'image' as const, uploading: true }
                ])
              }
            }
            reader.readAsDataURL(blob)
          }
        }
      }
    }

    nativeElement.addEventListener('paste', handleDOMPaste as EventListener)
    return () =>
      nativeElement.removeEventListener('paste', handleDOMPaste as EventListener)
  }, [enabled, setAttachments])
}

/**
 * Web 旧内核（如 OPPO/ColorOS Chromium <123）textarea 高度兜底：
 * 这些内核不支持 `field-sizing: content`，textarea 不会按内容撑高。
 * 渲染后用 scrollHeight 手动撑高（与 styles.input 的 maxHeight=280 对齐），
 * 现代内核走 CSS、本 hook 提前 return，互不干扰。
 */
export function useTextareaAutoHeight(
  inputRef: MutableRefObject<any>,
  inputText: string,
  width: number,
  isVoiceMode: boolean
) {
  useLayoutEffect(() => {
    if (FIELD_SIZING_SUPPORTED) return
    if (Platform.OS !== 'web') return
    const el = inputRef.current as HTMLTextAreaElement | null
    if (!el) return
    // RNW 不设 rows → textarea 默认 rows=2，空态会比 Chrome（field-sizing 塌成 1 行）高一截，
    // 且单行光标顶在上沿。兜底分支里压成 1 再量（box-sizing 已是 border-box，稳定）。
    el.rows = 1
    el.style.height = 'auto' // 先重置才能拿到真实 scrollHeight
    const next = Math.min(el.scrollHeight, 280)
    el.style.height = `${next}px`
  }, [inputText, width, isVoiceMode, inputRef])
}
