import type { ChatDocument } from '../../utils/chatDocument'

/**
 * 原生端占位：右侧文档面板与文档下载目前是 Web 专属能力。
 * Expo/Metro 在 web 上会优先解析同目录的 docDownload.web.ts。
 */
export async function exportMarkdown(_doc: ChatDocument): Promise<void> {
  throw new Error('文档下载仅支持网页端')
}

export async function exportDocx(_doc: ChatDocument): Promise<void> {
  throw new Error('文档下载仅支持网页端')
}
