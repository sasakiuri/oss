/**
 * Security utilities for input sanitization
 *
 * These utilities help prevent XSS and injection attacks
 */

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
