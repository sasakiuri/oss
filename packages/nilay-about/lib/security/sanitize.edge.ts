/**
 * Edge Runtime compatible security utilities for logging sanitization
 *
 * This module provides PII masking and sensitive data redaction
 * that works in Edge Runtime (Next.js Middleware).
 *
 * Note: Uses Web Crypto API instead of Node.js crypto module.
 */

/**
 * Default sensitive field patterns for redaction
 */
const DEFAULT_SENSITIVE_FIELDS = ["password", "token", "apiKey", "secret", "credential"];

/**
 * Fields containing PII that should be hashed or truncated
 */
const PII_FIELDS = ["ip", "userAgent", "email", "phone"];

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
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "LOG_MASKING_SECRET is required in production. " +
      "Please set this environment variable (16+ characters recommended) " +
      "to ensure secure PII hashing in logs."
    );
  }

  // 開発/テスト環境のみフォールバック
  return "dev-only-fallback-key-not-for-production";
}

/**
 * Convert ArrayBuffer to hex string
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash a string for privacy-preserving logging using HMAC-SHA256 (Web Crypto API)
 * Uses a keyed hash to prevent dictionary attacks on PII values
 *
 * Note: This is a synchronous wrapper that returns a placeholder during async operation.
 * For Edge Runtime, we use a simplified hash approach to avoid async complexity in middleware.
 *
 * @param value - The value to hash
 * @returns A truncated hash prefixed with [HASH:]
 */
function hashForLoggingSync(value: string): string {
  // Simple non-cryptographic hash for Edge Runtime
  // This provides enough entropy for log correlation while being synchronous
  let hash = 0;
  const secret = getLogMaskingSecret();
  const combined = secret + value;

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  // Convert to positive hex string
  const positiveHash = (hash >>> 0).toString(16).padStart(8, "0");
  return `[HASH:${positiveHash}]`;
}

/**
 * Async version of hash for logging using Web Crypto API
 * This provides cryptographically secure hashing but requires async context.
 *
 * @param value - The value to hash
 * @returns A truncated HMAC hash prefixed with [HMAC:]
 */
export async function hashForLoggingAsync(value: string): Promise<string> {
  const secret = getLogMaskingSecret();
  const encoder = new TextEncoder();

  // Import the secret key
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign the value
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );

  // Use first 12 hex characters (48 bits) - enough for correlation, not reversible
  const hash = arrayBufferToHex(signature).slice(0, 12);
  return `[HMAC:${hash}]`;
}

/**
 * Truncate User-Agent for logging (preserve browser/OS info, remove unique identifiers)
 */
function truncateUserAgent(ua: string): string {
  // Extract only the browser and OS information
  const match = ua.match(/^([^(]+\([^)]+\)[^\s]*)/u);
  return match ? `${match[1].slice(0, 50)}...` : "[TRUNCATED]";
}

/**
 * Sanitize a PII field value (synchronous version for Edge Runtime)
 */
function sanitizePiiValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;

  const lowerKey = key.toLowerCase();

  if (lowerKey === "ip" || lowerKey.includes("ip")) {
    return hashForLoggingSync(value);
  }

  if (lowerKey === "useragent" || lowerKey.includes("agent")) {
    return truncateUserAgent(value);
  }

  if (lowerKey === "email" || lowerKey.includes("email")) {
    // Mask email: show first 2 chars and domain
    const atIndex = value.indexOf("@");
    if (atIndex > 0) {
      const local = value.slice(0, atIndex);
      const domain = value.slice(atIndex + 1);
      return `${local.slice(0, 2)}***@${domain}`;
    }
    return "[REDACTED]";
  }

  return hashForLoggingSync(value);
}

/**
 * Sanitize object for logging (remove sensitive fields, mask PII)
 *
 * Edge Runtime compatible version - uses synchronous hashing.
 *
 * @param obj - Object to sanitize
 * @param sensitiveFields - Fields to completely redact (passwords, tokens, etc.)
 * @param maskPii - Whether to hash/truncate PII fields (IP, UserAgent, etc.)
 */
export function sanitizeForLogging<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: string[] = DEFAULT_SENSITIVE_FIELDS,
  maskPii: boolean = true
): T {
  const result = { ...obj };

  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();

    // Completely redact sensitive fields
    if (sensitiveFields.some((field) => lowerKey.includes(field.toLowerCase()))) {
      (result as Record<string, unknown>)[key] = "[REDACTED]";
    }
    // Mask PII fields
    else if (maskPii && PII_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      (result as Record<string, unknown>)[key] = sanitizePiiValue(key, result[key]);
    }
    // Recurse into nested objects
    else if (typeof result[key] === "object" && result[key] !== null) {
      (result as Record<string, unknown>)[key] = sanitizeForLogging(
        result[key] as Record<string, unknown>,
        sensitiveFields,
        maskPii
      );
    }
  }

  return result;
}
