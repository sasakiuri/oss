import 'server-only';

import { createHmac } from 'node:crypto';

const REDACTED = '[REDACTED]';
const DEFAULT_SENSITIVE_FIELDS = ['password', 'token', 'apiKey', 'secret', 'credential', 'authorization', 'cookie'];
const PII_FIELDS = new Set([
  'ip',
  'ipaddress',
  'clientip',
  'remoteip',
  'remoteaddress',
  'xforwardedfor',
  'xrealip',
  'xvercelforwardedfor',
  'cfconnectingip',
  'useragent',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getLogMaskingSecret(): string {
  const secret = process.env.LOG_MASKING_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 16)) {
    throw new Error('LOG_MASKING_SECRET must be at least 16 characters in production.');
  }
  return secret || 'dev-only-fallback-key-not-for-production';
}

function hashForLogging(value: string): string {
  const hash = createHmac('sha256', getLogMaskingSecret()).update(value).digest('hex').slice(0, 12);
  return `[HMAC:${hash}]`;
}

function isPiiField(key: string): boolean {
  return PII_FIELDS.has(key) || key.includes('email') || key.includes('phone');
}

/**
 * Return JSON-safe log data without mutating its input. Arrays keep their shape;
 * only ancestors count as circular, so a shared object is sanitized each time.
 * PII values are keyed hashes, including values inside a PII array or object.
 * Error text is fingerprinted: arbitrary database/HTTP errors can contain inputs
 * and credentials that field-based redaction cannot reliably identify.
 */
export function sanitizeForLogging(
  obj: Record<string, unknown>,
  sensitiveFields: readonly string[] = DEFAULT_SENSITIVE_FIELDS,
  maskPii: boolean = true,
): Record<string, unknown> {
  const sensitiveKeys = sensitiveFields.map(normalizeKey);
  const ancestors = new Set<object>();

  function visit(value: unknown, key = '', inheritedPii = false, depth = 0): unknown {
    const normalizedKey = normalizeKey(key);
    if (sensitiveKeys.some((field) => normalizedKey.includes(field))) return REDACTED;
    const pii = maskPii && (inheritedPii || isPiiField(normalizedKey));

    if (pii && (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint')) {
      return hashForLogging(String(value));
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value !== 'object' || value === null) return value;
    if (depth >= 20) return '[Max depth]';
    if (ancestors.has(value)) return '[Circular]';
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[Invalid Date]' : value.toISOString();
    if (value instanceof Error) {
      return {
        name: /^[A-Za-z][A-Za-z0-9.]{0,79}$/.test(value.name) ? value.name : 'Error',
        fingerprint: hashForLogging(value.message),
      };
    }

    ancestors.add(value);
    const result: unknown = Array.isArray(value)
      ? value.map((item) => visit(item, '', pii, depth + 1))
      : Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item, name, pii, depth + 1)]));
    ancestors.delete(value);
    return result;
  }

  return visit(obj) as Record<string, unknown>;
}

/**
 * Sanitize text for Slack messages
 *
 * Escapes special characters that Slack interprets:
 * - & becomes &amp;
 * - < becomes &lt;
 * - > becomes &gt;
 * - @ is neutralized with zero-width space to prevent mentions
 *
 * This prevents:
 * - @channel, @here, @everyone mentions
 * - User/group mentions (@U..., @S...)
 * - Link injection via <URL|text>
 * - Special commands like <!date> or <!subteam>
 *
 * @see https://api.slack.com/reference/surfaces/formatting#escaping
 */
export function sanitizeForSlack(text: string): string {
  if (!text) return '';

  return (
    text
      // Escape & first (before introducing new &)
      .replace(/&/g, '&amp;')
      // Escape < and > to prevent link/command injection
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Insert zero-width space after @ to prevent mentions
      // This neutralizes @channel, @here, @everyone, and user mentions
      .replace(/@/g, '@\u200B')
  );
}
