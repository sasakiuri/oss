/**
 * Security utilities for input sanitization
 *
 * These utilities help prevent XSS and injection attacks
 */

/**
 * Allowlist of safe HTML tags for content display
 * These tags are commonly used in news/blog content and are generally safe
 */
const SAFE_TAGS = new Set([
  "p", "br", "strong", "em", "b", "i", "u",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "a", "blockquote", "code", "pre",
  "span", "div",
]);

/**
 * Safe attributes per tag
 */
const SAFE_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
};

/**
 * Sanitize HTML content by removing dangerous elements
 * Removes: script tags, event handlers, javascript: URLs, data: URLs
 *
 * Note: For production with untrusted HTML, consider using DOMPurify library
 * This implementation covers common XSS vectors but is not exhaustive
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";

  let sanitized = html
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove style tags and their content
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    // Remove all event handlers (onclick, onerror, onload, etc.)
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "")
    // Remove javascript: and data: URLs from href/src attributes
    .replace(/href\s*=\s*["']?\s*javascript:[^"'>]*/gi, 'href="#"')
    .replace(/src\s*=\s*["']?\s*javascript:[^"'>]*/gi, 'src=""')
    .replace(/href\s*=\s*["']?\s*data:[^"'>]*/gi, 'href="#"')
    .replace(/src\s*=\s*["']?\s*data:[^"'>]*/gi, 'src=""')
    // Remove vbscript: URLs
    .replace(/href\s*=\s*["']?\s*vbscript:[^"'>]*/gi, 'href="#"')
    // Remove expression() CSS (IE)
    .replace(/expression\s*\([^)]*\)/gi, "")
    // Remove iframe, object, embed tags
    .replace(/<(iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(iframe|object|embed|form|input|button)[^>]*\/?>/gi, "");

  return sanitized;
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
 * Sanitize object for logging (remove sensitive fields)
 */
export function sanitizeForLogging<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: string[] = ["password", "token", "apiKey", "secret", "credential"]
): T {
  const result = { ...obj };

  for (const key of Object.keys(result)) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      (result as Record<string, unknown>)[key] = "[REDACTED]";
    } else if (typeof result[key] === "object" && result[key] !== null) {
      (result as Record<string, unknown>)[key] = sanitizeForLogging(
        result[key] as Record<string, unknown>,
        sensitiveFields
      );
    }
  }

  return result;
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
