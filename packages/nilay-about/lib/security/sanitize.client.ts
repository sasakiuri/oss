/**
 * Client-side security utilities for input sanitization
 *
 * This module provides XSS prevention utilities that work in browser environments.
 * It does NOT include Node.js-specific features like crypto or PII logging utilities.
 *
 * For server-side logging sanitization, use sanitize.ts instead.
 */

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

  return str.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);
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
 * Rate limiting helper (for client-side)
 */
export function createRateLimiter(maxRequests: number, windowMs: number) {
  const requests: number[] = [];

  return {
    canRequest(): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old requests
      let firstRequest = requests[0];
      while (firstRequest !== undefined && firstRequest < windowStart) {
        requests.shift();
        firstRequest = requests[0];
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
