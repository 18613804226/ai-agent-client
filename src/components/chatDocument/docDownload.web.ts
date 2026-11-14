import type { ChatDocument } from '../../utils/chatDocument'

/** 只在 web bundle 里加载 docx；原生端走同目录下的 docDownload.ts 占位实现。 */

function safeName(title: string, ext: string): string {
  const base =
    (title || '文档')
      .replace(/[\\/:*?"<>|\r\n\t]/g, '')
      .trim()
      .slice(0, 40) || '文档'
  return `${base}.${ext}`
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 立刻 revoke 会让部分浏览器取消下载，留一点余量
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** 行内 markdown：**粗体** / *斜体* / `代码` / [文字](链接) → TextRun */
function inlineRuns(text: string, D: any): any[] {
  const runs: any[] = []
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push(new D.TextRun(text.slice(last, m.index)))
    const token = m[0]
    if (token.startsWith('**') || token.startsWith('__')) {
      runs.push(new D.TextRun({ text: token.slice(2, -2), bold: true }))
    } else if (token.startsWith('`')) {
      runs.push(
        new D.TextRun({ text: token.slice(1, -1), font: 'Consolas', color: 'A31515' })
      )
    } else if (token.startsWith('[')) {
      runs.push(
        new D.TextRun({ text: token.slice(1, token.indexOf(']')), color: '0563C1' })
      )
    } else {
      runs.push(new D.TextRun({ text: token.slice(1, -1), italics: true }))
    }
    last = m.index + token.length
  }
  if (last < text.length) runs.push(new D.TextRun(text.slice(last)))
  return runs.length ? runs : [new D.TextRun('')]
}

/**
 * Markdown → docx 的行级转换。覆盖标题 / 段落 / 列表 / 引用 / 代码 / 表格 / 分隔线。
 * 不追求 Word 版式还原，目标是「一份能编辑、结构没丢的 .docx」。
 */
function markdownToDocx(md: string, D: any): any[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: any[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()

    // 代码块：逐行等宽，保留缩进
    if (t.startsWith('```')) {
      i++
      const buf: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i])
        i++
      }
      i++
      for (const codeLine of buf) {
        out.push(
          new D.Paragraph({
            children: [
              new D.TextRun({ text: codeLine || ' ', font: 'Consolas', size: 18 })
            ]
          })
        )
      }
      continue
    }

    // 表格：连续 | 行，跳过 |---|---| 分隔行
    if (/^\|.*\|$/.test(t)) {
      const rawRows: string[] = []
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        rawRows.push(lines[i].trim())
        i++
      }
      const rows = rawRows
        .filter((r) => !/^\|[\s:|-]+\|$/.test(r))
        .map((r) =>
          r
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim())
        )
      if (rows.length) {
        const cols = Math.max(...rows.map((r) => r.length))
        out.push(
          new D.Table({
            width: { size: 100, type: D.WidthType?.PERCENTAGE ?? 'pct' },
            rows: rows.map(
              (r) =>
                new D.TableRow({
                  children: Array.from(
                    { length: cols },
                    (_, c) =>
                      new D.TableCell({
                        children: [
                          new D.Paragraph({ children: inlineRuns(r[c] || '', D) })
                        ]
                      })
                  )
                })
            )
          })
        )
      }
      continue
    }

    if (!t) {
      out.push(new D.Paragraph({ children: [new D.TextRun('')] }))
      i++
      continue
    }

    const heading = t.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      out.push(
        new D.Paragraph({
          heading:
            level <= 1
              ? D.HeadingLevel.HEADING_1
              : level === 2
                ? D.HeadingLevel.HEADING_2
                : D.HeadingLevel.HEADING_3,
          children: inlineRuns(heading[2], D)
        })
      )
      i++
      continue
    }

    if (/^(?:---+|___+|\*\*\*+)$/.test(t)) {
      out.push(
        new D.Paragraph({
          children: [new D.TextRun('')],
          border: {
            bottom: {
              color: 'CCCCCC',
              size: 4,
              style: D.BorderStyle?.SINGLE ?? 'single',
              space: 1
            }
          }
        })
      )
      i++
      continue
    }

    if (/^>\s?/.test(t)) {
      out.push(
        new D.Paragraph({
          indent: { left: 360 },
          children: inlineRuns(t.replace(/^>\s?/, ''), D)
        })
      )
      i++
      continue
    }

    if (/^[-*+]\s+/.test(t)) {
      out.push(
        new D.Paragraph({
          bullet: { level: 0 },
          children: inlineRuns(t.replace(/^[-*+]\s+/, ''), D)
        })
      )
      i++
      continue
    }

    // 有序列表保留原文序号：docx 的 numbering 需要额外 config，
    // 这里宁可显示 "1. xxx"，也不冒生成空编号的风险。
    if (/^\d+[.)]\s+/.test(t)) {
      out.push(
        new D.Paragraph({
          indent: { left: 360 },
          children: inlineRuns(t, D)
        })
      )
      i++
      continue
    }

    out.push(new D.Paragraph({ children: inlineRuns(line, D) }))
    i++
  }
  return out.length ? out : [new D.Paragraph({ children: [new D.TextRun('')] })]
}

export async function exportMarkdown(doc: ChatDocument): Promise<void> {
  downloadBlob(
    new Blob([doc.content], { type: 'text/markdown;charset=utf-8' }),
    safeName(doc.title, 'md')
  )
}

export async function exportDocx(doc: ChatDocument): Promise<void> {
  const D: any = await import('docx')
  const document = new D.Document({
    sections: [
      {
        properties: {},
        children: markdownToDocx(doc.content, D)
      }
    ]
  })
  const blob: Blob = await D.Packer.toBlob(document)
  downloadBlob(blob, safeName(doc.title, 'docx'))
}
