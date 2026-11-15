import { useEffect, useState } from 'react'

/**
 * 聊天引用追问（「问问 DieTai」）轻量状态与消息格式工具。
 * 采用与 chatDocument 相同的模块级订阅模式，避免跨多层列表透传回调。
 */
let quoteText = ''
const listeners = new Set<() => void>()
let focusHandler: (() => void) | null = null

function emit() {
  listeners.forEach((l) => l())
}

export function getChatQuote(): string {
  return quoteText
}

export function setChatQuote(text: string): void {
  const cleaned = text.trim()
  if (!cleaned) return
  if (quoteText !== cleaned) {
    quoteText = cleaned
    emit()
  }
  if (focusHandler) {
    const focus = focusHandler
    const raf = (globalThis as any).requestAnimationFrame
    if (typeof raf === 'function') {
      raf(() => focus())
    } else {
      setTimeout(() => focus(), 0)
    }
  }
}

export function clearChatQuote(): void {
  if (!quoteText) return
  quoteText = ''
  emit()
}

export function useChatQuote(): string {
  const [snapshot, setSnapshot] = useState<string>(quoteText)
  useEffect(() => {
    const listener = () => setSnapshot(quoteText)
    listeners.add(listener)
    setSnapshot(quoteText)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return snapshot
}

export function registerInputFocusHandler(fn: (() => void) | null): void {
  focusHandler = fn
}

/**
 * 将引用文本与用户提问拼装为 Markdown 引用协议：
 * `> 引用内容\n\n用户提问`
 */
export function formatQuotedMessage(quote: string, body: string): string {
  const cleanQuote = quote.trim()
  const cleanBody = body.trim()
  if (!cleanQuote) return body
  const quotedLines = cleanQuote
    .split(/\r?\n/)
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n')
  return cleanBody ? `${quotedLines}\n\n${cleanBody}` : quotedLines
}

/**
 * 解析用户消息中的引用前缀。
 * 当消息以 `> ` 开头且后续存在正文时返回 `{ quote, body }`，否则返回 `null`。
 */
export function parseQuotedMessage(
  content: string
): { quote: string; body: string } | null {
  if (!content || !content.startsWith('> ')) return null
  const lines = content.split(/\r?\n/)
  const quoteLines: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('> ')) {
      quoteLines.push(line.slice(2))
      i++
    } else if (line === '>') {
      quoteLines.push('')
      i++
    } else {
      break
    }
  }
  const quote = quoteLines.join('\n').trim()
  while (i < lines.length && lines[i].trim() === '') {
    i++
  }
  const body = lines.slice(i).join('\n').trimEnd()
  if (!quote || !body.trim()) return null
  return { quote, body }
}
