/**
 * Markdown 块边界归一化：打断 CommonMark「惰性续行（Lazy Continuation）」。
 *
 * 背景：LLM 常在列表或引用块结束后的下一行直接用单个 `\n` 换行输出普通正文段落
 * （未留空行），例如：
 *   `4. 项目的创新点和亮点\n证书方面，如果你时间充裕……`
 * 按 CommonMark §5.2 规范，紧跟在列表/引用后、未缩进且无空行分隔的普通行会被
 * 吞进上一条 `list_item` / `blockquote` 作为惰性续行；在原生端表现为整段正文继续
 * 套用列表的 `LeadingMarginSpan` 悬挂缩进（首行顶格、第二行起错误缩进），Web 端也
 * 会错包进 `<li>` / `<blockquote>`。
 *
 * 规则：
 * - 围栏代码块（``` / ~~~）内部绝不修改；
 * - 显式缩进续行与嵌套列表（以空格或 Tab 开头）原样保留；
 * - 列表项 / 引用行之后，若下一行是零缩进的非空普通段落（且非新列表项、引用、
 *   标题、分割线），自动在前面补一条空行将其切回普通顶级段落。
 */

const FENCE_OPEN_RE = /^[ ]{0,3}(`{3,}|~{3,})/;
const HEADING_OR_HR_RE = /^(?:#{1,6}(?:\s|$)|([-*_])[ \t]*(?:\1[ \t]*){2,}$)/;
const LIST_LINE_RE = /^[ \t]*(?:[-*+]|\d+[.)])(?:\s|$)/;
const QUOTE_LINE_RE = /^[ \t]*>/;
const PARTIAL_MARKER_RE = /^(?:\d+[.)]?|[-*+>])$/;

export function breakLazyContinuations(
  text: string,
  options?: { streaming?: boolean },
): string {
  if (!text || !text.includes('\n')) return text;

  const streaming = options?.streaming === true;
  const rawLines = text.split('\n');
  const out: string[] = [];

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let inList = false;
  let inQuote = false;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (inFence) {
      out.push(rawLine);
      const closeMatch = FENCE_OPEN_RE.exec(line);
      if (
        closeMatch &&
        closeMatch[1][0] === fenceChar &&
        closeMatch[1].length >= fenceLen &&
        line.slice(closeMatch[0].length).trim() === ''
      ) {
        inFence = false;
      }
      continue;
    }

    const fenceMatch = FENCE_OPEN_RE.exec(line);
    if (
      fenceMatch &&
      !(
        fenceMatch[1][0] === '`' &&
        line.slice(fenceMatch[0].length).includes('`')
      )
    ) {
      inFence = true;
      fenceChar = fenceMatch[1][0];
      fenceLen = fenceMatch[1].length;
      inList = false;
      inQuote = false;
      out.push(rawLine);
      continue;
    }

    if (line.trim() === '') {
      inList = false;
      inQuote = false;
      out.push(rawLine);
      continue;
    }

    // 显式缩进：保留嵌套列表与有意的缩进续行
    const isIndented = line[0] === ' ' || line[0] === '\t';

    // 必须在 LIST_LINE_RE 之前判定，避免 `- - -` / `* * *` 被误认作列表项
    if (!isIndented && HEADING_OR_HR_RE.test(line)) {
      inList = false;
      inQuote = false;
      out.push(rawLine);
      continue;
    }

    if (LIST_LINE_RE.test(line)) {
      inList = true;
      inQuote = false;
      out.push(rawLine);
      continue;
    }

    if (QUOTE_LINE_RE.test(line)) {
      inQuote = true;
      inList = false;
      out.push(rawLine);
      continue;
    }

    if (isIndented) {
      out.push(rawLine);
      continue;
    }

    // 零缩进普通行紧跟在列表/引用之后：打断惰性续行
    if (inList || inQuote) {
      // 流式末尾若还是半截标记（如 `5`、`5.`、`-`），先不拆空行以免下一 token 到达时闪跳
      const isLastLine = i === rawLines.length - 1;
      if (streaming && isLastLine && PARTIAL_MARKER_RE.test(line)) {
        out.push(rawLine);
        continue;
      }
      out.push('');
      inList = false;
      inQuote = false;
    }

    out.push(rawLine);
  }

  return out.join('\n');
}
