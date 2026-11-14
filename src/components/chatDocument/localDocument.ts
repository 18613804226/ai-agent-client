import type { PickedAttachment } from '../../hooks/useImagePicker'
import type { Message } from '../../types/chat'
import {
  createLocalDocument,
  extractDocument,
  wantsDocument,
  type ChatDocument
} from '../../utils/chatDocument'

/**
 * C：「整理成 word / md」不再是一次问答。
 *
 * 以前这类短指令会被后端 agent 当成「怎么把内容转成 docx」的信息查询，
 * 于是联网搜一堆在线转换工具，模型还回答「我这里不能直接生成 .docx 附件」。
 * 但用户真正要的只是把刚才那段内容变成一份可下载的文档 —— 这是本地
 * 文件转换，不需要模型、不需要联网、也不需要花 token。
 *
 * 命中意图 + 有素材时直接产出文档；没有素材则回退到正常发送。
 */

/**
 * 需要模型重新加工内容的指令：不做本地转换，交回后端按 A 的提示词
 * 输出 ```markdown 围栏文档（渲染后仍会自动打开右侧面板）。
 * 否则「润色一下整理成 word」会被当成纯格式转换，丢掉润色诉求。
 */
const REWRITE_INTENT =
  /(润色|改写|重写|重新组织|重组|优化|精简|扩写|补充|总结成|归纳成|重新整理)/

const TEXT_EXTS = new Set([
  'txt', 'text', 'md', 'markdown', 'log', 'csv', 'json', 'xml',
  'yaml', 'yml', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c',
  'cpp', 'h', 'go', 'rs', 'sql', 'sh', 'html', 'css', 'ini', 'conf'
])

function isTextAttachment(att: PickedAttachment): boolean {
  if (att.kind !== 'file') return false
  const ext = (att.name || '').split('.').pop()?.toLowerCase() ?? ''
  return (att.mime || '').startsWith('text/') || TEXT_EXTS.has(ext)
}

/** Web 优先 blob（长文粘贴生成的 TXT 卡片就是它）；其它情况退回 uri */
async function readTextAttachment(att: PickedAttachment): Promise<string> {
  if (att.blob && typeof att.blob.text === 'function') {
    try {
      return await att.blob.text()
    } catch {
      // 继续试 uri
    }
  }
  if (att.uri) {
    try {
      const res = await fetch(att.uri)
      if (res.ok) return await res.text()
    } catch {
      // data: / blob: 之外的占位 uri 无需再试
    }
  }
  return ''
}

export async function createDocumentFromLocalSend({
  text,
  attachments,
  messages
}: {
  text: string
  attachments: PickedAttachment[]
  messages: Message[]
}): Promise<ChatDocument | null> {
  // 没有明确的「动作词 + 格式词」就不是文档请求，别拦截正常聊天
  const format = wantsDocument(text)
  if (!format) return null
  // 要模型重新加工内容的，交回后端（A 的提示词负责让它输出文档正文）
  if (REWRITE_INTENT.test(text)) return null

  let source = ''
  let title = ''

  // 1) 本次带来的文本附件优先：粘贴超长文本生成的 TXT 卡片、上传的 .md 等
  for (const att of attachments.filter(isTextAttachment)) {
    const content = await readTextAttachment(att)
    if (content && content.trim().length >= 8) {
      source = content
      title = (att.name || '').replace(/\.[^.]+$/, '')
      break
    }
  }

  // 2) 否则取最近一条 AI 回复（截图场景：周报后面接一句「整理成word」）
  if (!source) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (
        m.role === 'assistant' &&
        !m.systemNote &&
        m.content &&
        m.content !== '...'
      ) {
        source = m.content
        break
      }
    }
  }

  if (!source || source.trim().length < 8) return null

  // 素材可能已被模型用 ```markdown 包过一层，先剥掉围栏再进面板
  const extracted = extractDocument(source, format, 'local')
  const content = extracted?.content ?? source.trim()

  return createLocalDocument(content, format, title)
}
