/**
 * 内联强调切分：把一段文本切成「纯文本 / 粗体 / 斜体 / 行内代码」片段。
 *
 * 用途：流式进行中的「尾巴」也想要实时加粗，但又不能整段走 markdown 解析
 * （半截 token 会让节点结构每帧变，造成正文重排抖动）。
 *
 * 这里的切分器刻意保持「**只在强调对真正闭合的那一刻才产生结构变化**」：
 *   - 只认闭合的定界符；`**bo` 这种未闭合的原样输出（和纯文本完全一样）
 *   - 配对只在同一行内找闭合（跨 `\n` 不配，避免大范围重排）
 *   - 成对的 span 语义稳定：文本只增不减，闭合点一旦出现就不再变
 *
 * 与 CommonMark 的刻意取舍：
 *   - 用「最左优先 + 递归」而不是完整 delimiter stack，图的是行为可预测
 *   - 支持：`**`/`__` 粗、`*`/`_` 斜、反引号行内代码、`\*` 转义、代码/强调互相嵌套
 *   - `_`/`__` **不匹配词中出现**（`snake_case_name` 保持字面量，这点和规范一致）
 *   - 空内容（`****`）、未闭合半截 → 一律按字面量，不产出空 span
 *   - 已知不精确：`**a**b*c**` 这类 `**` 与单 `*` 混用的 delimiter run，
 *     规范用 stack 解析，本实现按最左配对 —— 极端边角，吐字期稳定性优先
 */

/** 内联强调片段 */
export interface InlineSeg {
  /** 纯文本内容（含转义后的字面量） */
  text?: string
  /** 行内代码字面量：等宽渲染，内部强调不生效 */
  raw?: boolean
  /** 粗体（对应 markdownRules 的 strong） */
  strong?: boolean
  /** 斜体（对应 markdownRules 的 em） */
  em?: boolean
  /** 嵌套子片段 */
  children?: InlineSeg[]
}

/** 空格/制表符：定界符内侧贴它们则该次配对无效（CommonMark 规则） */
function isBlank(c: string): boolean {
  return c === ' ' || c === '\t'
}

/** ASCII 字母数字：用于判定 `_` 是否出现在词中（snake_case） */
const WORD_CHAR = /[A-Za-z0-9]/

/** 可被反斜杠转义的字符 */
const ESCAPABLE = new Set('\\`*_{}[]()#+-.!|<>~"')

/** 定界符，长家族优先（`**` 必须先于 `*` 命中） */
const DELIMITERS = ['**', '__', '*', '_']

function delimAt(s: string, i: number): string | null {
  for (const d of DELIMITERS) {
    if (s.startsWith(d, i)) return d
  }
  return null
}

function isEscapedAt(s: string, i: number): boolean {
  return (
    s[i] === '\\' &&
    i + 1 < s.length &&
    ESCAPABLE.has(s[i + 1])
  )
}

/**
 * 从 from 起找同一行内的闭定界符，沿途**跳过转义与行内代码**。
 * 跳代码很关键：``**外层 `x` 内层**`` 的闭 `**` 在代码之后，
 * 若把代码里的 `**`（上面那种例子里没有）当闭合点，配对就会错位。
 */
function findClose(s: string, marker: string, from: number): number {
  let i = from
  while (i < s.length) {
    const c = s[i]
    if (c === '\n') return -1
    if (isEscapedAt(s, i)) {
      i += 2
      continue
    }
    if (c === '`') {
      let n = 0
      while (s[i + n] === '`') n++
      const m = '`'.repeat(n)
      const end = s.indexOf(m, i + n)
      if (end !== -1) {
        i = end + n
        continue
      }
    }
    if (s.startsWith(marker, i)) return i
    i++
  }
  return -1
}

/** 单趟扫描：转义 → 行内代码 → 强调配对。强调内容递归回本函数（支持嵌套） */
function scan(s: string): InlineSeg[] {
  const out: InlineSeg[] = []
  let buf = ''
  let i = 0

  const flush = () => {
    if (buf) {
      out.push({ text: buf })
      buf = ''
    }
  }

  while (i < s.length) {
    const c = s[i]

    // 1) 反斜杠转义：字面量字符进 buf，永远不当定界符
    if (isEscapedAt(s, i)) {
      buf += s[i + 1]
      i += 2
      continue
    }

    // 2) 行内代码：原子字面量（去掉首尾反引号，与最终 markdown 的渲染一致）
    if (c === '`') {
      let n = 0
      while (s[i + n] === '`') n++
      const marker = '`'.repeat(n)
      const end = s.indexOf(marker, i + n)
      if (end !== -1) {
        flush()
        out.push({ text: s.slice(i + n, end), raw: true })
        i = end + n
        continue
      }
    }

    // 3) 强调配对
    const d = delimAt(s, i)
    if (d) {
      const after = s[i + d.length]
      const close = findClose(s, d, i + d.length)
      const valid =
        close !== -1 &&
        after !== undefined &&
        !isBlank(after) &&
        !isBlank(s[close - 1]) &&
        s.slice(i + d.length, close) !== '' &&
        // `_`/`__` 不匹配「词中出现」：snake_case_name 保持字面量
        (d[0] !== '_' ||
          (!WORD_CHAR.test(s[i - 1] ?? '') &&
            !WORD_CHAR.test(s[close + d.length] ?? '')))

      if (valid) {
        flush()
        out.push({
          strong: d.length === 2,
          children: scan(s.slice(i + d.length, close))
        })
        i = close + d.length
        continue
      }

      buf += d
      i += d.length
      continue
    }

    buf += c
    i++
  }

  flush()
  return out
}

/** 入口：切分一段文本 */
export function splitInlineSegments(s: string): InlineSeg[] {
  return s ? scan(s) : []
}

/** 是否含有任何可能形成行内强调/代码的字符（纯文本可直接整体渲染，省一层） */
export function hasInlineMarkup(s: string): boolean {
  return /[*_`\\]/.test(s)
}
