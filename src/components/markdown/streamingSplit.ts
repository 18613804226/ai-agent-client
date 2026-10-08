/**
 * 流式 markdown 的「段落级增量切块」：把随时间增长的文本切成
 * 「已成形、永不改写」的稳定块 + 「还在长的尾巴」。
 *
 * 只在空行处切，而且：
 * - 不能在代码围栏内部切（``` 被截成两半后前一半没闭合，后半段会被当普通文本渲染）；
 * - 不能在会「跨空行续接」的两块之间切（列表会重新编号、表格会掉表头、引用会裂成两块）；
 * - 空行后面什么都还没有、或后面那行还没定型时不切（还不知道下一行会不会续接上一块）。
 *
 * 因为文本只增不减、切点只会往后移，返回的 blocks 里每一段一旦产生就再也不变，
 * 渲染层可以把它们 memo 住：文本没变 → React 整棵子树直接跳过 → DOM 一个节点都不动。
 */

/** 列表项：`- x` / `* x` / `+ x` / `1. x` / `1) x` */
const LIST_ITEM_RE = /^([-*+]|\d+[.)])\s/;

/**
 * 判断空行前后的两行是否属于「同一族的块」—— 属于就不能在这里切。
 * 只有这几种情况会「跨空行续接」：
 * - 列表项接列表项（拆开会让列表从 1 重新编号）
 * - 表格行接表格行（拆开后半张表就没有表头了）
 * - 引用接引用（拆开会被渲染成两个引用块）
 * - 上一行是列表项、下一行是缩进续行
 * 其它情况（段落接列表、段落接代码围栏、段落接段落…）都是安全的切点。
 */
function continuesPrevBlock(prev: string, next: string): boolean {
  if (next === '') return false;
  const nextTrimmed = next.trimStart();
  if (nextTrimmed.startsWith('|')) return prev.trimStart().startsWith('|');
  if (nextTrimmed.startsWith('>')) return prev.trimStart().startsWith('>');
  if (next !== nextTrimmed) return LIST_ITEM_RE.test(prev.trimStart()); // 缩进续行
  if (LIST_ITEM_RE.test(nextTrimmed))
    return LIST_ITEM_RE.test(prev.trimStart());
  return false;
}

/**
 * 这一行的「类型」是否已经定下来了。
 *
 * 打字机只会往末尾追加，所以**只有最后一行**还会变。它当前可能只是某个标记的前半段：
 * `-` 会变成 `- 列表项`、`1` 会变成 `1. 列表项`、`|` 会变成表格行……如果拿这种
 * 还没定型的行去判断切点，切点会随着后续字符出现而「消失」，前面已经 memo 住的块
 * 被合并重排，反而制造抖动。所以没定型就一律视为不安全（不切）。
 * 判定：能明确看出它已经不是列表/引用/表格标记的才算定型（例如以文字或数字+空格开头）。
 */
function isSettledLine(line: string): boolean {
  const t = line.trimStart();
  if (t === '') return false;
  if (LIST_ITEM_RE.test(t)) return true; // 已经是确定的列表项："- x" / "1. x"
  // 还只是标记的前半段（""、"1"、"12"、"1."、"1)"、"-"、"*"、"+"、">"、"|"）→ 没定型
  if (/^(\d*[.)]?|[-*+>|])$/.test(t)) return false;
  return true;
}

/**
 * 把流式 markdown 切成「已成形的段落」+「还在长的尾巴」。
 */
export function splitStableBlocks(text: string): {
  blocks: string[];
  tail: string;
} {
  const lines = text.split('\n');
  let inFence = false;
  let prevNonBlank = '';
  /** 安全切点的行号（那些都是空行） */
  const cuts: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedStart = line.trimStart();
    if (trimmedStart.startsWith('```') || trimmedStart.startsWith('~~~')) {
      inFence = !inFence;
      prevNonBlank = line;
      continue;
    }
    if (inFence) continue;
    if (line.trim() !== '') {
      prevNonBlank = line;
      continue;
    }

    // 空行：看它后面第一条非空行。可能续接上一块 / 后面还没有内容 / 那一行还没定型 → 不切。
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length) continue;
    if (j === lines.length - 1 && !isSettledLine(lines[j])) continue;
    if (continuesPrevBlock(prevNonBlank, lines[j])) continue;

    cuts.push(i);
  }

  if (cuts.length === 0) return { blocks: [], tail: text };

  const lastCut = cuts[cuts.length - 1];
  const blocks: string[] = [];
  let segStart = 0;
  for (const cut of cuts) {
    // 两刀之间的内容就是一块（不含切点那行空行）
    const seg = lines.slice(segStart, cut).join('\n');
    if (seg.trim() !== '') blocks.push(seg);
    segStart = cut + 1;
  }
  const tail = lines.slice(lastCut + 1).join('\n');
  return { blocks, tail };
}
