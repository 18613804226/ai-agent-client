import { useState, useCallback } from 'react'
import { Platform } from 'react-native'
import { api, httpClient } from '../../services/api'
import { MyToast } from '../GlobalToast'
import { classifyFile } from '../FilePreviewer'
import type { PickedAttachment } from '../../hooks/useImagePicker'

/**
 * 气泡图片全屏预览 + 附件应用内预览的状态与打开逻辑（纯搬运自 ChatArea）。
 */
export function useChatPreviews() {
  // ==================== 图片全屏预览 ====================
  const [preview, setPreview] = useState<{
    images: string[]
    index: number
  } | null>(null)
  const openPreview = useCallback(
    (images: string[], index: number) => setPreview({ images, index }),
    []
  )
  const closePreview = useCallback(() => setPreview(null), [])
  const changePreviewIndex = useCallback(
    (index: number) => setPreview((prev) => (prev ? { ...prev, index } : prev)),
    []
  )

  // ==================== 文件附件预览（与图片同款交互：点气泡行 → 应用内真预览）====================
  const [filePreview, setFilePreview] = useState<PickedAttachment | null>(null)
  const closeFilePreview = useCallback(() => setFilePreview(null), [])

  const openFilePreview = useCallback(async (a: PickedAttachment) => {
    // ① 新鲜消息：本地 File 引用（Web）/ file://（原生）直接开
    if (a.blob || a.uri) {
      setFilePreview(a)
      return
    }
    // ② 历史消息（刷新/重载后只剩服务端引用）：服务端接口需要 token
    const serverPath =
      a.url ?? (a.fileRef ? `/chat/attachments/${a.fileRef}` : undefined)
    if (!serverPath) return
    if (Platform.OS === 'web') {
      // 该接口白名单 content-type 内联防 XSS，fetch 进 blob 不走导航
      httpClient
        .get(serverPath, { responseType: 'blob' })
        .then((blob: any) => setFilePreview({ ...a, blob, uri: '' }))
        .catch(() => MyToast.show('附件加载失败，可能已过期或被删除'))
      return
    }
    // 原生：docx/sheet 走后端 /html 纯文本渲染；其余（PDF/图片/音视频）下载到
    // 本地缓存后再用原生渲染器打开（react-native-pdf / Image 只认本地文件）
    const kind = classifyFile(a)
    if (kind === 'docx' || kind === 'sheet') {
      setFilePreview(a)
      return
    }
    const fileRef =
      a.fileRef ||
      a.uploadFileRef ||
      (serverPath.split('/').pop()?.split('?')[0] ?? '')
    if (!fileRef) {
      MyToast.show('附件加载失败，可能已过期或被删除')
      return
    }
    try {
      const localUri = await api.downloadAttachment(fileRef, a.name)
      setFilePreview({ ...a, uri: localUri })
    } catch {
      MyToast.show('附件加载失败，可能已过期或被删除')
    }
  }, [])

  return {
    preview,
    openPreview,
    closePreview,
    changePreviewIndex,
    filePreview,
    openFilePreview,
    closeFilePreview
  }
}
