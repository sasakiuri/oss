import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  stripHtml,
  sanitizeForDisplay,
  sanitizeUrl,
  createRateLimiter,
  sanitizeForLogging,
} from "@/lib/security/sanitize";

describe("Security Sanitization", () => {
  describe("escapeHtml", () => {
    it("should escape HTML special characters", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
      );
    });

    it("should escape ampersand", () => {
      expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
    });

    it("should escape quotes", () => {
      expect(escapeHtml('He said "Hello"')).toBe("He said &quot;Hello&quot;");
    });

    it("should handle empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("should handle string without special characters", () => {
      expect(escapeHtml("Hello World")).toBe("Hello World");
    });
  });

  describe("stripHtml", () => {
    it("should remove HTML tags", () => {
      expect(stripHtml("<p>Hello <strong>World</strong></p>")).toBe(
        "Hello World"
      );
    });

    it("should handle nested tags", () => {
      expect(stripHtml("<div><span>Test</span></div>")).toBe("Test");
    });

    it("should handle self-closing tags", () => {
      expect(stripHtml("Hello<br/>World")).toBe("HelloWorld");
    });

    it("should handle empty string", () => {
      expect(stripHtml("")).toBe("");
    });
  });

  describe("sanitizeForDisplay", () => {
    it("should strip and escape HTML", () => {
      expect(sanitizeForDisplay("<p>Hello & <script>evil</script></p>")).toBe(
        "Hello &amp; evil"
      );
    });

    it("should handle complex nested HTML with special chars", () => {
      expect(
        sanitizeForDisplay('<div onclick="alert()">Test & <b>bold</b></div>')
      ).toBe("Test &amp; bold");
    });
  });

  describe("sanitizeUrl", () => {
    it("should allow https URLs", () => {
      expect(sanitizeUrl("https://example.com")).toBe("https://example.com/");
    });

    it("should allow http URLs", () => {
      expect(sanitizeUrl("http://example.com")).toBe("http://example.com/");
    });

    it("should reject javascript: URLs", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    });

    it("should reject data: URLs", () => {
      expect(
        sanitizeUrl("data:text/html,<script>alert(1)</script>")
      ).toBeNull();
    });

    it("should return null for invalid URLs", () => {
      expect(sanitizeUrl("not-a-url")).toBeNull();
    });

    it("should preserve URL path and query", () => {
      expect(sanitizeUrl("https://example.com/path?query=value")).toBe(
        "https://example.com/path?query=value"
      );
    });

    it("should reject file: URLs", () => {
      expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
    });
  });

  describe("sanitizeForLogging", () => {
    it("should redact password fields", () => {
      const obj = { username: "user", password: "secret123" };
      const result = sanitizeForLogging(obj);
      expect(result.username).toBe("user");
      expect(result.password).toBe("[REDACTED]");
    });

    it("should redact nested sensitive fields", () => {
      const obj = {
        user: { email: "test@example.com", apiKey: "key123" },
      };
      const result = sanitizeForLogging(obj);
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.apiKey).toBe("[REDACTED]");
    });

    it("should handle case-insensitive field names", () => {
      const obj = { PASSWORD: "secret", ApiKey: "key" };
      const result = sanitizeForLogging(obj);
      expect(result.PASSWORD).toBe("[REDACTED]");
      expect(result.ApiKey).toBe("[REDACTED]");
    });

    it("should not modify original object", () => {
      const original = { password: "secret" };
      sanitizeForLogging(original);
      expect(original.password).toBe("secret");
    });
  });

  describe("createRateLimiter", () => {
    it("should allow requests within limit", () => {
      const limiter = createRateLimiter(3, 1000);
      expect(limiter.canRequest()).toBe(true);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(true);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(true);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(false);
    });

    it("should reset after window expires", async () => {
      const limiter = createRateLimiter(1, 50);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(false);
      await new Promise((r) => setTimeout(r, 60));
      expect(limiter.canRequest()).toBe(true);
    });

    it("should reset manually", () => {
      const limiter = createRateLimiter(1, 10000);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(false);
      limiter.reset();
      expect(limiter.canRequest()).toBe(true);
    });
  });
});
