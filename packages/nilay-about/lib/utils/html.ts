/**
 * HTML文字列からタグを除去してプレーンテキストを取得
 */
export function stripHtml(html: string): string {
  if (typeof window !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  }
  // SSR環境では正規表現でフォールバック
  return html.replace(/<[^>]*>/g, "");
}

/**
 * 文字列を指定した長さで切り詰め、省略記号を追加
 */
export function truncate(text: string, maxLength: number, suffix = "…"): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + suffix;
}

/**
 * HTMLをサニタイズして安全な文字列を返す
 */
export function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);
}
