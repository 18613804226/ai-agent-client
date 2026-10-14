/**
 * markdown 行内强调归一化：修掉「定界符内侧带空格」导致的加粗失效。
 *
 * CommonMark 规定：开定界符后不能是空白、闭定界符前不能是空白。
 * 所以 `**xx**` → <strong>xx</strong>，但模型常输出的 `** xx **` 会被整段当字面量，
 * 界面上就出现原文里的 `** xx **`。这里把成对定界符内侧的首尾空白剥掉，
 * 只动「能确认成对」的部分 —— 不会误伤：
 *  - `a **b** c **d**` 两段独立加粗 → 保持原样（不会跨段合并）
 *  - `**未闭合 加粗` 缺闭定界符 → 原样不动
 *  - 反引号 `` ` `` 内的行内代码、``` 围栏代码块 → 一律不动（那里的 `**` 是字面量）
 */

/** 成对处理一种定界符（`**` / `__`）：切开后按 奇/偶 位配对 */
function fixDelimiter(seg: string, delim: string): string {
  const parts = seg.split(delim);
  // 少于一对、或最后一个定界符没闭合 → 不处理，原样返回
  if (parts.length < 3) return seg;
  // parts: [前导文本, 内容1, 内容2, 内容3, ..., 尾部文本]
  // 偶数长度 = 奇数个定界符 = 有未闭合的，最多只能配到倒数第二段
  const lastPairIndex =
    parts.length % 2 === 0 ? parts.length - 2 : parts.length - 1;
  for (let i = 1; i <= lastPairIndex; i += 2) {
    const stripped = parts[i].replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
    // 剥完空了（如 `** **`）就别动，否则会拼出 `****` 反而更糟
    if (stripped !== '') parts[i] = stripped;
  }
  return parts.join(delim);
}

/** 处理一行：跳过反引号包裹的行内代码段 */
function fixLine(line: string): string {
  const segs = line.split('`');
  // 偶数位 = 反引号外的普通文本；奇数位 = `code` 内部，保持原样
  for (let s = 0; s < segs.length; s += 2) {
    segs[s] = fixDelimiter(segs[s], '**');
    segs[s] = fixDelimiter(segs[s], '__');
  }
  return segs.join('`');
}

/** 围栏起始（``` 或 ~~~）；围栏内的内容全部跳过 */
const FENCE_RE = /^\s*(?:```|~~~)/;

/**
 * 归一化整段文本的行内强调。幂等：已经正常的文本原样返回。
 */
export function normalizeInlineEmphasis(text: string): string {
  if (!text) return text;
  if (!text.includes('**') && !text.includes('__')) return text;

  const lines = text.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    lines[i] = fixLine(lines[i]);
  }
  return lines.join('\n');
}
