import type { PickedAttachment } from '../hooks/useImagePicker';

/**
 * Web 端 Office 在线预览：
 * - docx → docx-preview（HTML/CSS 语义渲染，带分页、表格、图片）
 * - xlsx/xls/ods… → SheetJS 解析成 HTML 表格（多工作表分块，超长截断）
 * 两个库都用动态 import 按需加载，只存在于 web bundle。
 */
export const officePreviewSupported = true;

/** 附件 → 可解析的 ArrayBuffer（内存里的 File 直读，data:/http 走 fetch） */
async function toBuffer(att: PickedAttachment): Promise<ArrayBuffer> {
  if (att.blob) {
    if (typeof att.blob.arrayBuffer === 'function') {
      return await att.blob.arrayBuffer();
    }
    if (typeof Blob !== 'undefined' && att.blob instanceof Blob) {
      return await att.blob.arrayBuffer();
    }
  }
  const resp = await fetch(att.uri);
  return await resp.arrayBuffer();
}

/** docx 渲染进可见容器；样式由库注入到同一容器（重开前调用方会清空） */
export async function renderDocxPreview(
  att: PickedAttachment,
  host: HTMLElement,
  dark: boolean,
): Promise<void> {
  const mod: any = await import('docx-preview');
  const docx = mod?.renderAsync ? mod : mod?.default;
  if (!docx?.renderAsync) throw new Error('docx-preview 加载失败');

  const data = await toBuffer(att);
  host.innerHTML = '';
  await docx.renderAsync(data, host, host, {
    // 图片转 base64 内嵌：避免库内部 createObjectURL 的 blob 地址反复累积不回收
    useBase64URL: true,
    // 按 Word 的 lastRenderedPageBreak 分页，预览能看到真实页边界
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
    inWrapper: true,
  });
  // 白纸黑字保留（文档页就该是白的），外圈 wrapper 跟随主题：
  // 深色下不再是一大块亮灰，浅色下保持惯常的浅灰桌面
  const style = host.ownerDocument.createElement('style');
  style.textContent = `.docx-wrapper{background:${
    dark ? '#151618' : '#e9e9e9'
  } !important;}
.xl-host { scrollbar-width: thin; scrollbar-color: ${
    dark ? '#4A4B4D' : '#C4C4C4'
  } transparent; }
.xl-host::-webkit-scrollbar{ width:10px; height:10px; }
.xl-host::-webkit-scrollbar-track{ background:${
    dark ? '#151618' : '#F0F4F9'
  }; border-radius:5px; }
.xl-host::-webkit-scrollbar-thumb{ background:${
    dark ? '#4A4B4D' : '#C4C4C4'
  }; border-radius:5px; }
.xl-host::-webkit-scrollbar-thumb:hover{ background:${
    dark ? '#5A5B5D' : '#A8A8A8'
  }; }
.xl-host::-webkit-scrollbar-corner{ background:transparent; }`;
  host.appendChild(style);
}

/** 每个工作表最多预览的行数（防超大表格卡死渲染） */
const MAX_SHEET_ROWS = 1000;

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}

/** xlsx/xls/ods… → HTML（每个工作表一个分块，table 统一挂 .sheet 便于主题着色） */
export async function spreadsheetToHtml(
  att: PickedAttachment,
): Promise<{ html: string; truncated: boolean }> {
  const m: any = await import('xlsx');
  const XLSX = m?.read ? m : m?.default;
  if (!XLSX?.read || !XLSX?.utils) throw new Error('xlsx 加载失败');

  const data = await toBuffer(att);
  const wb = XLSX.read(new Uint8Array(data), {
    type: 'array',
    // 带上数字/日期格式（cell.z），sheet_to_html 才能输出「2024-01-01」这类格式化文本
    cellNF: true,
  });

  let truncated = false;
  const blocks: string[] = [];
  for (const name of wb.SheetNames ?? []) {
    const ws = wb.Sheets?.[name];
    if (!ws || !ws['!ref']) {
      blocks.push(
        `<section class="xl-sheet" data-sheet="${escapeHtml(
          name,
        )}"><h3 class="xl-sheet-name">${escapeHtml(
          name,
        )}</h3><p class="xl-empty">（空工作表）</p></section>`,
      );
      continue;
    }
    const range = XLSX.utils.decode_range(ws['!ref']);
    if (range.e.r + 1 > MAX_SHEET_ROWS) {
      truncated = true;
      range.e.r = MAX_SHEET_ROWS - 1;
    }
    const table = XLSX.utils.sheet_to_html(ws, {
      range: XLSX.utils.encode_range(range),
    });
    blocks.push(
      `<section class="xl-sheet" data-sheet="${escapeHtml(
        name,
      )}" data-r0="${range.s.r}" data-c0="${range.s.c}"><h3 class="xl-sheet-name">${escapeHtml(
        name,
      )}</h3>${table.replace('<table', '<table class="sheet"')}</section>`,
    );
  }
  if (blocks.length === 0) {
    blocks.push('<p class="xl-empty">（空工作簿）</p>');
  }
  return { html: blocks.join(''), truncated };
}

/** 列号 → Excel 列名（0 → A，25 → Z，26 → AA） */
function colName(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * 给预览表每个可见单元格打上 data-ref（"B13" 形式，与后端 findings.cell 对齐）。
 * 用占用表处理 colspan/rowspan：合并区域只有锚点格有 DOM 元素、才有 ref；
 * 行列偏移来自 section 的 data-r0/data-c0（工作表 !ref 可能不从 A1 开始）。
 */
export function attachCellRefs(host: HTMLElement): void {
  host.querySelectorAll('section.xl-sheet').forEach((sec) => {
    const s = sec as HTMLElement;
    const table = s.querySelector('table');
    if (!table) return;
    const r0 = Number(s.dataset.r0 || 0);
    const c0 = Number(s.dataset.c0 || 0);
    const occupied = new Set<string>();
    Array.from(table.rows).forEach((tr, r) => {
      let c = 0;
      Array.from(tr.cells).forEach((td) => {
        while (occupied.has(`${r},${c}`)) c += 1;
        const cs = td.colSpan || 1;
        const rs = td.rowSpan || 1;
        for (let dr = 0; dr < rs; dr += 1) {
          for (let dc = 0; dc < cs; dc += 1) {
            occupied.add(`${r + dr},${c + dc}`);
          }
        }
        td.setAttribute('data-ref', `${colName(c0 + c)}${r0 + r + 1}`);
        c += cs;
      });
    });
  });
}

/**
 * 定位并闪烁目标单元格（查错结果点击跳转）。
 * 返回是否在预览里找到：超出截断行数 / 落在合并区未渲染部分时找不到，调用方兜底提示。
 */
export function focusSheetCell(
  host: HTMLElement,
  sheet: string,
  ref: string,
): boolean {
  const sections = Array.from(
    host.querySelectorAll('section.xl-sheet'),
  ) as HTMLElement[];
  const sec = sections.find((s) => s.dataset.sheet === sheet);
  if (!sec) return false;
  const cell = sec.querySelector(`[data-ref="${ref}"]`) as HTMLElement | null;
  if (!cell) return false;
  cell.classList.remove('cell-flash');
  void cell.offsetWidth; // 强制重排，保证连续点击同格也能重播动画
  cell.classList.add('cell-flash');
  cell.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  return true;
}
