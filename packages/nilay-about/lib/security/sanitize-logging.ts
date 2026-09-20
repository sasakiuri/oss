/**
 * Server-side sanitization utilities for logging
 *
 * This module does NOT depend on DOMPurify or jsdom,
 * making it safe to use in serverless environments.
 */

import 'server-only';
import { createHmac } from 'crypto';

/**
 * Default sensitive field patterns for redaction
 */
const DEFAULT_SENSITIVE_FIELDS = ['password', 'token', 'apiKey', 'secret', 'credential'];

/**
 * Fields containing PII that should be hashed or truncated
 */
const PII_FIELDS = ['ip', 'userAgent', 'email', 'phone'];

/**
 * Get the secret key for HMAC hashing
 *
 * 本番環境では LOG_MASKING_SECRET 環境変数が必須です。
 * 開発/テスト環境では未設定時にフォールバックキーを使用します。
 *
 * @throws Error 本番環境で LOG_MASKING_SECRET が未設定の場合
 */
function getLogMaskingSecret(): string {
  const secret = process.env.LOG_MASKING_SECRET;
  if (secret) {
    return secret;
  }

  // 本番環境では必須
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'LOG_MASKING_SECRET is required in production. ' +
        'Please set this environment variable (16+ characters recommended) ' +
        'to ensure secure PII hashing in logs.',
    );
  }

  // 開発/テスト環境のみフォールバック
  return 'dev-only-fallback-key-not-for-production';
}

/**
 * Hash a string for privacy-preserving logging using HMAC-SHA256
 * Uses a keyed hash to prevent dictionary attacks on PII values
 *
 * @param value - The value to hash
 * @returns A truncated HMAC hash prefixed with [HMAC:]
 */
function hashForLogging(value: string): string {
  const secret = getLogMaskingSecret();
  const hmac = createHmac('sha256', secret);
  hmac.update(value);
  // Use first 12 hex characters (48 bits) - enough for correlation, not reversible
  const hash = hmac.digest('hex').slice(0, 12);
  return `[HMAC:${hash}]`;
}

/**
 * Truncate User-Agent for logging (preserve browser/OS info, remove unique identifiers)
 */
function truncateUserAgent(ua: string): string {
  // Extract only the browser and OS information
  const match = ua.match(/^([^(]+\([^)]+\)[^\s]*)/u);
  const captured = match?.[1];
  return captured ? `${captured.slice(0, 50)}...` : '[TRUNCATED]';
}

/**
 * Sanitize a PII field value
 */
function sanitizePiiValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const lowerKey = key.toLowerCase();

  if (lowerKey === 'ip' || lowerKey.includes('ip')) {
    return hashForLogging(value);
  }

  if (lowerKey === 'useragent' || lowerKey.includes('agent')) {
    return truncateUserAgent(value);
  }

  if (lowerKey === 'email' || lowerKey.includes('email')) {
    // Mask email: show first 2 chars and domain
    const atIndex = value.indexOf('@');
    if (atIndex > 0) {
      const local = value.slice(0, atIndex);
      const domain = value.slice(atIndex + 1);
      return `${local.slice(0, 2)}***@${domain}`;
    }
    return '[REDACTED]';
  }

  return hashForLogging(value);
}

/**
 * Sanitize object for logging (remove sensitive fields, mask PII)
 *
 * @param obj - Object to sanitize
 * @param sensitiveFields - Fields to completely redact (passwords, tokens, etc.)
 * @param maskPii - Whether to hash/truncate PII fields (IP, UserAgent, etc.)
 */
export function sanitizeForLogging<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: string[] = DEFAULT_SENSITIVE_FIELDS,
  maskPii: boolean = true,
): T {
  const result = { ...obj };

  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();

    // Completely redact sensitive fields
    if (sensitiveFields.some((field) => lowerKey.includes(field.toLowerCase()))) {
      (result as Record<string, unknown>)[key] = '[REDACTED]';
    }
    // Mask PII fields
    else if (maskPii && PII_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      (result as Record<string, unknown>)[key] = sanitizePiiValue(key, result[key]);
    }
    // Recurse into nested objects
    else if (typeof result[key] === 'object' && result[key] !== null) {
      (result as Record<string, unknown>)[key] = sanitizeForLogging(
        result[key] as Record<string, unknown>,
        sensitiveFields,
        maskPii,
      );
    }
  }

  return result;
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
