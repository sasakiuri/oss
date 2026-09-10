// SPDX-License-Identifier: MIT
export function safeReturnTo(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return '/';
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\x00-\x20]/.test(decoded)) return '/';
  return value;
}
