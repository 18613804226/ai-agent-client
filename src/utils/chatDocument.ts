import { useEffect, useState } from 'react'

/** 桌面 Web 右侧文档面板宽度（聊天区/输入栏会同步收缩这么多） */
export const DOC_PANEL_WIDTH = 420

export type DocFormat = 'md' | 'doc'

/** 从一轮 AI 回复里抽出来的「文档」——纯前端产物，不进消息协议、不落库 */
export interface ChatDocument {
  /** messageId + 块序号，用于面板 key */
  id: string
  title: string
  /** Markdown 原文（.md 直接下载，.docx 由它转换） */
  content: string
  /** 模型按用户要求输出的格式 */
  format: DocFormat
  sourceMessageId: string
}

const MD_WORD = /(?:markdown|\.md\b|md\s*文件|md\s*格式)/gi
const DOC_WORD = /(?:word|\.docx?\b|docx\s*文件|文档)/gi
const ACTION = /(整理|生成|导出|转成|转换为|输出|做成|写成|保存|下载|给我|来一份|制作|写一份|转一份)/
const DOC_LANG = /^(?:markdown|md|docx|doc|word|document)$/i

/**
 * 用户这句话是不是在要一份文档。必须有「动作词 + 格式词」才认，
 * 否则随口一句「这个文档不错」也会把右侧面板弹出来。
 */
export function wantsDocument(text: string): DocFormat | null {
  if (!text || !ACTION.test(text)) return null
  const lastIndex = (re: RegExp) => {
    let last = -1
    let m: RegExpExecArray | null
    const r = new RegExp(re.source, re.flags)
    while ((m = r.exec(text))) last = m.index
    return last
  }
  const md = lastIndex(MD_WORD)
  const doc = lastIndex(DOC_WORD)
  if (md < 0 && doc < 0) return null
  return md > doc ? 'md' : 'doc'
}

interface FencedBlock {
  lang: string
  body: string
  index: number
}

/**
 * 逐行扫围栏，但闭合行从**全文末尾**往前找：文档正文里常常还嵌着
 * ```python / ``` 代码块，若遇到第一个围栏就收尾，会把文档拦腰截断。
 * 只认「长度不小于外层」的纯围栏行（无语言标记）作为闭合；
 * 没找到闭合（流式中断）就不收，避免下载到半截文档。
 */
function findFencedBlocks(content: string): FencedBlock[] {
  const lines = content.split('\n')
  const out: FencedBlock[] = []
  let i = 0
  while (i < lines.length) {
    const open = lines[i].trim().match(/^(`{3,})([A-Za-z0-9_-]*)\s*$/)
    if (!open) {
      i++
      continue
    }
    const fenceLen = open[1].length
    let end = -1
    for (let j = lines.length - 1; j > i; j--) {
      const close = lines[j].trim().match(/^(`{3,})\s*$/)
      if (close && close[1].length >= fenceLen) {
        end = j
        break
      }
    }
    if (end < 0) break
    out.push({
      lang: open[2].toLowerCase(),
      body: lines.slice(i + 1, end).join('\n'),
      index: out.length
    })
    i = end + 1
  }
  return out
}

/** 一整段回复长得像不像文档（标题 / 列表 / 表格 / 有序列表 + 一定篇幅） */
function looksLikeDocument(text: string): boolean {
  // 用户已明确要文档时，长篇纯段落回复也当作文档，不强求模型一定加标题/列表
  if (text.length >= 200) return true
  if (text.length < 80) return false
  return (
    /(^|\n)#{1,6}\s+\S/.test(text) ||
    /(^|\n)\s*[-*+]\s+\S/.test(text) ||
    /(^|\n)\s*\d+[.)]\s+\S/.test(text) ||
    /(^|\n)\s*\|[^\n]+\|/.test(text)
  )
}

/** 文件名取文档首个非空行（标题），剥掉 markdown 标记与文件系统非法字符 */
function deriveTitle(text: string): string {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('```')) continue
    if (/^\|[\s:|-]+\|$/.test(line)) continue
    const title = line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/[*_`]/g, '')
      .replace(/[\\/:*?"<>|\r\n\t]/g, '')
      .trim()
      .slice(0, 32)
    if (title) return title
  }
  return '未命名文档'
}

/**
 * 从 AI 回复里找文档内容。优先级：
 *  1. 带文档语言标记的围栏（```markdown / ```docx）——模型最明确的信号；
 *  2. 用户明确要文档时，```text / 无标记的大块内容；
 *  3. 用户明确要文档且整篇有文档结构 → 整篇回复。
 * 没带 userRequest 时只走第 1 条：普通聊天回答不该冒出「文档卡片」。
 */
export function extractDocument(
  content: string,
  requested?: DocFormat | null,
  messageId = ''
): ChatDocument | null {
  if (!content || content.length < 20) return null
  const blocks = findFencedBlocks(content)

  const marked = blocks.filter((b) => DOC_LANG.test(b.lang))
  let body: string | null = null
  let format: DocFormat = requested || 'md'

  if (marked.length) {
    const best = marked.reduce((a, b) => (b.body.length > a.body.length ? b : a))
    body = best.body.trim()
    format = /^(?:docx|doc|word|document)$/i.test(best.lang) ? 'doc' : 'md'
  } else if (requested) {
    const plain = blocks
      .filter((b) => !b.lang || /^(?:text|txt|plaintext|plain)$/i.test(b.lang))
      .sort((a, b) => b.body.length - a.body.length)[0]
    if (plain && plain.body.length >= 80) body = plain.body.trim()
    else if (looksLikeDocument(content)) body = content.trim()
  }

  // 带明确文档围栏的，哪怕内容很短也算；整篇兜底要够长，
  // 避免一句普通回答被当成文档弹到右侧
  const minLen = marked.length ? 8 : 20
  if (!body || body.length < minLen) return null
  return {
    id: `${messageId || 'doc'}-${format}`,
    title: deriveTitle(body),
    content: body,
    format,
    sourceMessageId: messageId
  }
}

/**
 * 本地文档转换（C）：用户说「整理成 word / md」时不再请求模型，
 * 直接把素材（TXT 附件 / 上一轮回复）变成可预览、可下载的文档。
 * 与 extractDocument 的区别是不依赖模型输出、没有 messageId 来源。
 */
export function createLocalDocument(
  content: string,
  format: DocFormat,
  title?: string
): ChatDocument | null {
  const cleaned = content?.trim()
  if (!cleaned || cleaned.length < 8) return null
  return {
    id: `local-${Date.now()}-${format}`,
    title: title?.trim() || deriveTitle(cleaned),
    content: cleaned,
    format,
    sourceMessageId: ''
  }
}

// ── React 树外的轻量状态：ChatMessageItem / 右侧面板 / 主页面都能读写，
//    不用给 ChatArea → createRenderCell → ChatMessageItem 层层透传回调。
type DocState = { doc: ChatDocument | null; visible: boolean }
let state: DocState = { doc: null, visible: false }
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function openChatDocument(doc: ChatDocument): void {
  state = { doc, visible: true }
  emit()
}

export function closeChatDocument(): void {
  if (!state.visible) return
  state = { ...state, visible: false }
  emit()
}

/** 切会话：连内容一起清，避免上个会话的文档留在面板里 */
export function clearChatDocument(): void {
  if (!state.doc && !state.visible) return
  state = { doc: null, visible: false }
  emit()
}

export function useChatDocumentState(): DocState {
  const [snapshot, setSnapshot] = useState<DocState>(state)
  useEffect(() => {
    const listener = () => setSnapshot(state)
    listeners.add(listener)
    setSnapshot(state) // 挂载期间可能刚好错过一次更新
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return snapshot
}
