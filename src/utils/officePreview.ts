import type { PickedAttachment } from '../hooks/useImagePicker';

/**
 * 原生端 Office 预览：
 * - docx → 后端 /html 接口返回纯文本 HTML，stripHtmlTags → 纯文本渲染在 <Text selectable>
 * - xlsx → 后端 /html 接口返回 HTML 表格，stripHtmlTags → 纯文本渲染在 <Text selectable>
 * 不引入 react-native-webview，避免额外 8MB+ native 依赖。
 * Web 端走 docx-preview / SheetJS 完整渲染。
 */
export const officePreviewSupported = false;

export async function renderDocxPreview(
  _att: PickedAttachment,
  _host: HTMLElement,
  _dark: boolean,
): Promise<void> {
  throw new Error('当前平台不支持在线预览');
}

export async function spreadsheetToHtml(
  _att: PickedAttachment,
): Promise<{ html: string; truncated: boolean }> {
  throw new Error('当前平台不支持在线预览');
}

export function attachCellRefs(_host: HTMLElement): void {}

export function focusSheetCell(
  _host: HTMLElement,
  _sheet: string,
  _ref: string,
): boolean {
  return false;
}
