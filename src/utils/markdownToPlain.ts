/** 行内标记 → 纯文本：图片/链接保留文字、去掉强调与行内代码反引号 */
function inlineToPlain(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
}

/**
 * AI 回复的 Markdown → 可直接粘贴的纯文本（复制按钮用）。
 * 去掉标题井号、代码围栏、表格分隔行、列表符号与强调标记；
 * 代码块内容原样保留，段落空行最多保留一个。
 */
export function markdownToPlainText(md: string): string {
  if (!md) return ''
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let inFence = false
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      continue
    }
    // 代码块内容原样保留：不剥缩进、不动符号
    if (inFence) {
      out.push(raw)
      continue
    }
    const t = raw.trim()
    if (!t) {
      out.push('')
      continue
    }
    // 表格分隔行 / 分隔线不输出
    if (/^\|[\s:|-]+\|$/.test(t)) continue
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) continue
    let s = raw
    s = s.replace(/^\s{0,3}#{1,6}\s+/, '')
    s = s.replace(/^\s{0,3}>\s?/, '')
    s = s.replace(/^\s*[-*+]\s+/, '')
    if (/^\s*\|.*\|\s*$/.test(s)) {
      s = s
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim())
        .join('  ')
    }
    out.push(inlineToPlain(s))
  }
  return out
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
