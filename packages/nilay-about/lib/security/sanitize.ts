/**
 * Server-side security utilities for input sanitization
 *
 * This module includes Node.js-specific features (crypto for HMAC hashing).
 * For client-side usage, import from sanitize.client.ts instead.
 *
 * These utilities help prevent XSS and injection attacks
 */

import "server-only";
import { createHmac } from "crypto";
import DOMPurify from "isomorphic-dompurify";

/**
 * Allowlist of safe HTML tags for content display
 * These tags are commonly used in news/blog content and are generally safe
 */
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "b", "i", "u",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "a", "blockquote", "code", "pre",
  "span", "div",
];

/**
 * Safe attributes per tag
 */
const ALLOWED_ATTR = [
  "href", "title", "target", "rel",  // for <a>
  "src", "alt", "width", "height",  // for <img> if needed
  "class",  // for styling
];

// DOMPurifyフックを設定して target="_blank" に rel="noopener noreferrer" を強制
DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
  // a タグで target 属性がある場合、rel を強制付与
  if (node.tagName === "A" && node.hasAttribute("target")) {
    const target = node.getAttribute("target");
    if (target === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  }
});

/**
 * Sanitize HTML content using DOMPurify
 *
 * Uses a robust DOM parser-based approach that handles:
 * - SVG/MathML XSS vectors
 * - Attribute splitting attacks
 * - Encoding bypass attempts
 * - Malformed tag exploitation
 * - target="_blank" での逆タブナビング防止 (rel="noopener noreferrer" 強制)
 *
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML safe for dangerouslySetInnerHTML
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Prevent protocol attacks
    ALLOW_UNKNOWN_PROTOCOLS: false,
    // Forbid dangerous URI schemes
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    // Use secure defaults
    USE_PROFILES: { html: true },
  });
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return str.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Strip HTML tags from string
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

/**
 * Sanitize string for safe display
 * Combines stripping and escaping
 */
export function sanitizeForDisplay(str: string): string {
  return escapeHtml(stripHtml(str));
}

/**
 * Validate and sanitize URL
 * Only allows http, https protocols
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

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
 * Hash a string for privacy-preserving logging using HMAC-SHA256
 * Uses a keyed hash to prevent dictionary attacks on PII values
 *
 * @param value - The value to hash
 * @returns A truncated HMAC hash prefixed with [HMAC:]
 */
function hashForLogging(value: string): string {
  const secret = getLogMaskingSecret();
  const hmac = createHmac("sha256", secret);
  hmac.update(value);
  // Use first 12 hex characters (48 bits) - enough for correlation, not reversible
  const hash = hmac.digest("hex").slice(0, 12);
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
 * Sanitize a PII field value
 */
function sanitizePiiValue(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;

  const lowerKey = key.toLowerCase();

  if (lowerKey === "ip" || lowerKey.includes("ip")) {
    return hashForLogging(value);
  }

  if (lowerKey === "useragent" || lowerKey.includes("agent")) {
    return truncateUserAgent(value);
  }

  if (lowerKey === "email" || lowerKey.includes("email")) {
    // Mask email: show first 2 chars and domain
    const [local, domain] = value.split("@");
    if (domain) {
      return `${local.slice(0, 2)}***@${domain}`;
    }
    return "[REDACTED]";
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
  if (!text) return "";

  return text
    // Escape & first (before introducing new &)
    .replace(/&/g, "&amp;")
    // Escape < and > to prevent link/command injection
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Insert zero-width space after @ to prevent mentions
    // This neutralizes @channel, @here, @everyone, and user mentions
    .replace(/@/g, "@\u200B");
}

/**
 * Rate limiting helper (for client-side)
 */
export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests: number[] = [];

  return {
    canRequest(): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old requests
      while (requests.length > 0 && requests[0] < windowStart) {
        requests.shift();
      }

      return requests.length < maxRequests;
    },

    recordRequest(): void {
      requests.push(Date.now());
    },

    reset(): void {
      requests.length = 0;
    },
  };
}
