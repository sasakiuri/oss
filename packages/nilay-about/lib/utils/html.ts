/**
 * HTML文字列からタグを除去してプレーンテキストを取得。HTMLとしては挿入しない。
 */
export function stripHtml(html: string): string {
  if (typeof window !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  }
  return stripHtmlTags(html);
}

/** Remove angle-bracket tags for text display, without regex backtracking. */
export function stripHtmlTags(html: string): string {
  const parts: string[] = [];
  let position = 0;
  while (position < html.length) {
    const start = html.indexOf('<', position);
    if (start === -1) break;
    const end = html.indexOf('>', start + 1);
    if (end === -1) break;
    parts.push(html.slice(position, start));
    position = end + 1;
  }
  parts.push(html.slice(position));
  return parts.join('');
}

/**
 * 文字列を指定した長さで切り詰め、省略記号を追加
 */
export function truncate(text: string, maxLength: number, suffix = '…'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + suffix;
}

/**
 * HTMLをサニタイズして安全な文字列を返す
 */
export function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);
}
