// SPDX-License-Identifier: MIT
const secret = /password|authorization|cookie|token|secret|api.?key|email/i;
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value instanceof Error) return { name: value.name, message: 'An operation failed' };
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, secret.test(key) ? '[redacted]' : redact(item, depth + 1)]),
    );
  return typeof value === 'string' ? value.slice(0, 1000) : value;
}
