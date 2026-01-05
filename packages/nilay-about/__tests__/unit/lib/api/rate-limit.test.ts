import { describe, it, expect } from "vitest";
import {
  checkRateLimit,
  getClientIp,
  rateLimitPresets,
} from "@/lib/api/rate-limit";

describe("Rate Limiting", () => {
  describe("checkRateLimit", () => {
    it("should allow first request", async () => {
      const result = await checkRateLimit("test-ip-1", {
        maxRequests: 5,
        windowMs: 60000,
      });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("should track requests correctly", async () => {
      const ip = "test-ip-2";
      const config = { maxRequests: 3, windowMs: 60000 };

      const result1 = await checkRateLimit(ip, config);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = await checkRateLimit(ip, config);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = await checkRateLimit(ip, config);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);

      const result4 = await checkRateLimit(ip, config);
      expect(result4.allowed).toBe(false);
      expect(result4.remaining).toBe(0);
    });

    it("should reset after window expires", async () => {
      const ip = "test-ip-3";
      const config = { maxRequests: 1, windowMs: 50 };

      const result1 = await checkRateLimit(ip, config);
      expect(result1.allowed).toBe(true);

      const result2 = await checkRateLimit(ip, config);
      expect(result2.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((r) => setTimeout(r, 60));

      const result3 = await checkRateLimit(ip, config);
      expect(result3.allowed).toBe(true);
    });

    it("should track different IPs separately", async () => {
      const config = { maxRequests: 1, windowMs: 60000 };

      const result1 = await checkRateLimit("ip-a", config);
      expect(result1.allowed).toBe(true);

      const result2 = await checkRateLimit("ip-b", config);
      expect(result2.allowed).toBe(true);

      const result3 = await checkRateLimit("ip-a", config);
      expect(result3.allowed).toBe(false);
    });

    it("should return correct resetIn time", async () => {
      const ip = "test-ip-4";
      const windowMs = 60000;
      const config = { maxRequests: 5, windowMs };

      const result = await checkRateLimit(ip, config);
      expect(result.resetIn).toBeLessThanOrEqual(windowMs);
      expect(result.resetIn).toBeGreaterThan(windowMs - 100);
    });
  });

  describe("getClientIp", () => {
    it("should prefer x-vercel-forwarded-for header (trusted)", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-vercel-forwarded-for": "192.168.1.3",
          "x-forwarded-for": "192.168.1.1",
          "x-real-ip": "192.168.1.2",
        },
      });
      expect(getClientIp(request)).toBe("192.168.1.3");
    });

    it("should prefer cf-connecting-ip over x-forwarded-for", () => {
      const request = new Request("http://localhost", {
        headers: {
          "cf-connecting-ip": "192.168.1.4",
          "x-forwarded-for": "192.168.1.1",
          "x-real-ip": "192.168.1.2",
        },
      });
      expect(getClientIp(request)).toBe("192.168.1.4");
    });

    it("should extract IP from x-real-ip header", () => {
      const request = new Request("http://localhost", {
        headers: { "x-real-ip": "192.168.1.2" },
      });
      expect(getClientIp(request)).toBe("192.168.1.2");
    });

    it("should extract IP from x-forwarded-for header as fallback", () => {
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
      });
      expect(getClientIp(request)).toBe("192.168.1.1");
    });

    it("should return fallback IP when no headers present", () => {
      const request = new Request("http://localhost");
      expect(getClientIp(request)).toBe("127.0.0.1");
    });
  });

  describe("rateLimitPresets", () => {
    it("should have correct contact preset", () => {
      expect(rateLimitPresets.contact.maxRequests).toBe(5);
      expect(rateLimitPresets.contact.windowMs).toBe(60 * 1000);
    });

    it("should have correct apiRead preset", () => {
      expect(rateLimitPresets.apiRead.maxRequests).toBe(60);
    });

    it("should have correct strict preset", () => {
      expect(rateLimitPresets.strict.maxRequests).toBe(3);
    });
  });
});
