/**
 * 文本乱码修复工具。
 *
 * 常见场景：后端把 UTF-8 字节按 Latin-1（ISO-8859-1）返回，
 * 于是中文「中文.pdf」被读成「ä¸­æ–‡.pdf」这样的乱码。
 *
 * 修复思路：如果字符串的每个字符都落在 0-255（可能是一个字节），
 * 就按 UTF-8 重新解码；解码失败（不是合法 UTF-8）则原样返回。
 */
export function fixMojibake(input?: string | null): string {
  if (!input) return '';

  // 只要出现 > 0xFF 的字符，说明已经是正常的 Unicode 文本，不动它（避免二次解码）
  let allByteRange = true;
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) > 0xff) {
      allByteRange = false;
      break;
    }
  }
  if (!allByteRange) return input;

  try {
    const bytes = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      bytes[i] = input.charCodeAt(i);
    }
    // fatal: true → 非法 UTF-8 直接抛错，回退到原文，避免把正常拉丁文本改坏
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded;
  } catch {
    return input;
  }
}
