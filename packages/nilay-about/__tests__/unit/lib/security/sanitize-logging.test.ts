import { afterEach, describe, it, expect, vi } from 'vitest';

import { sanitizeForLogging, sanitizeForSlack } from '@/lib/security/sanitize-logging';

afterEach(() => vi.unstubAllEnvs());

describe('Server logging sanitization', () => {
  describe('sanitizeForLogging', () => {
    it('redacts normalized credential names and HTTP authorization headers', () => {
      expect(
        sanitizeForLogging({ api_key: 'key', Authorization: 'Bearer token', 'set-cookie': 'session=value' }),
      ).toEqual({
        api_key: '[REDACTED]',
        Authorization: '[REDACTED]',
        'set-cookie': '[REDACTED]',
      });
    });

    it('preserves arrays and sanitizes every element without changing the input', () => {
      const input = { users: [{ email: 'user@example.com', token: 'secret' }], ips: ['example'] };
      const result = sanitizeForLogging(input);
      expect(result.users).toEqual([{ email: expect.stringMatching(/^\[HMAC:/), token: '[REDACTED]' }]);
      expect(input.users[0]?.token).toBe('secret');
      expect(input.users[0]?.email).toBe('user@example.com');
    });

    it('masks PII values nested in arrays and objects under a PII field', () => {
      const result = sanitizeForLogging({
        email: ['first@example.com', { primary: 'second@example.com' }],
        phone: 123456789,
      });
      expect(result.email).toEqual([expect.stringMatching(/^\[HMAC:/), { primary: expect.stringMatching(/^\[HMAC:/) }]);
      expect(result.phone).toMatch(/^\[HMAC:/);
    });

    it('does not confuse description or membership with an IP field', () => {
      expect(sanitizeForLogging({ description: 'Useful detail', membership: 'active', clientIp: '192.0.2.1' })).toEqual(
        {
          description: 'Useful detail',
          membership: 'active',
          clientIp: expect.stringMatching(/^\[HMAC:/),
        },
      );
    });

    it('handles cycles and repeated references independently', () => {
      const shared = { token: 'secret' };
      const input: Record<string, unknown> = { first: shared, second: shared };
      input.self = input;
      expect(sanitizeForLogging(input)).toEqual({
        first: { token: '[REDACTED]' },
        second: { token: '[REDACTED]' },
        self: '[Circular]',
      });
    });

    it('serializes dates and bigint values without throwing', () => {
      const result = sanitizeForLogging({ date: new Date('2026-01-01T00:00:00Z'), count: 10n });
      expect(JSON.parse(JSON.stringify(result))).toEqual({ date: '2026-01-01T00:00:00.000Z', count: '10' });
    });

    it('fingerprints arbitrary error messages rather than exposing their contents', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const result = sanitizeForLogging({ error: new TypeError('Password secret-value for user@example.com') });
      expect(result.error).toEqual({ name: 'TypeError', fingerprint: expect.stringMatching(/^\[HMAC:/) });
      expect(JSON.stringify(result)).not.toContain('secret-value');
      expect(JSON.stringify(result)).not.toContain('user@example.com');
    });

    it.each(['', 'too-short'])('requires a production masking secret of at least 16 characters (%j)', (secret) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LOG_MASKING_SECRET', secret);
      expect(() => sanitizeForLogging({ ip: '192.0.2.1' })).toThrow('LOG_MASKING_SECRET');
    });

    it('should redact password fields', () => {
      const obj = { username: 'user', password: 'secret123' };
      const result = sanitizeForLogging(obj);
      expect(result.username).toBe('user');
      expect(result.password).toBe('[REDACTED]');
    });

    it('should redact nested sensitive fields', () => {
      const obj = {
        user: { name: 'test', apiKey: 'key123' },
      };
      const result = sanitizeForLogging(obj);
      expect(result.user).toEqual({ name: 'test', apiKey: '[REDACTED]' });
    });

    it('should handle case-insensitive field names', () => {
      const obj = { PASSWORD: 'secret', ApiKey: 'key' };
      const result = sanitizeForLogging(obj);
      expect(result.PASSWORD).toBe('[REDACTED]');
      expect(result.ApiKey).toBe('[REDACTED]');
    });

    it('should not modify original object', () => {
      const original = { password: 'secret' };
      sanitizeForLogging(original);
      expect(original.password).toBe('secret');
    });

    describe('PII masking', () => {
      it('should hash IP addresses with HMAC', () => {
        const obj = { ip: '192.168.1.1', path: '/api' };
        const result = sanitizeForLogging(obj);
        // HMAC format: [HMAC:xxxxxxxxxxxx] (12 hex chars)
        expect(result.ip).toMatch(/^\[HMAC:[0-9a-f]{12}\]$/);
        expect(result.path).toBe('/api');
      });

      it('should produce consistent hashes for same IP with same key', () => {
        const obj1 = { ip: '192.168.1.1' };
        const obj2 = { ip: '192.168.1.1' };
        const result1 = sanitizeForLogging(obj1);
        const result2 = sanitizeForLogging(obj2);
        expect(result1.ip).toBe(result2.ip);
      });

      it('should produce different hashes for different IPs', () => {
        const obj1 = { ip: '192.168.1.1' };
        const obj2 = { ip: '10.0.0.1' };
        const result1 = sanitizeForLogging(obj1);
        const result2 = sanitizeForLogging(obj2);
        expect(result1.ip).not.toBe(result2.ip);
      });

      it('should hash User-Agent strings', () => {
        const obj = {
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };
        const result = sanitizeForLogging(obj);
        expect(result.userAgent).toMatch(/^\[HMAC:[0-9a-f]{12}\]$/);
      });

      it('should mask email addresses', () => {
        const obj = { email: 'john.doe@example.com' };
        const result = sanitizeForLogging(obj);
        expect(result.email).toMatch(/^\[HMAC:[0-9a-f]{12}\]$/);
      });

      it('should handle email without domain', () => {
        const obj = { email: 'invalid-email' };
        const result = sanitizeForLogging(obj);
        expect(result.email).toMatch(/^\[HMAC:[0-9a-f]{12}\]$/);
      });

      it('should allow disabling PII masking', () => {
        const obj = { ip: '192.168.1.1' };
        const result = sanitizeForLogging(obj, undefined, false);
        expect(result.ip).toBe('192.168.1.1');
      });

      it('should handle nested PII fields', () => {
        const obj = {
          request: {
            ip: '192.168.1.1',
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
          },
        };
        const result = sanitizeForLogging(obj);
        expect((result.request as { ip: string }).ip).toMatch(/^\[HMAC:[0-9a-f]{12}\]$/);
        expect((result.request as { userAgent: string }).userAgent).toMatch(/^\[HMAC:[0-9a-f]{12}\]$/);
      });
    });
  });

  describe('sanitizeForSlack', () => {
    it('should escape ampersand', () => {
      expect(sanitizeForSlack('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(sanitizeForSlack('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than', () => {
      expect(sanitizeForSlack('a > b')).toBe('a &gt; b');
    });

    it('should neutralize @channel mention with zero-width space', () => {
      const result = sanitizeForSlack('@channel');
      expect(result).toBe('@\u200Bchannel');
      expect(result).not.toBe('@channel');
    });

    it('should neutralize @here mention with zero-width space', () => {
      const result = sanitizeForSlack('@here');
      expect(result).toBe('@\u200Bhere');
      expect(result).not.toBe('@here');
    });

    it('should neutralize @everyone mention with zero-width space', () => {
      const result = sanitizeForSlack('@everyone');
      expect(result).toBe('@\u200Beveryone');
      expect(result).not.toBe('@everyone');
    });

    it('should neutralize <!channel> special command', () => {
      // < and > are escaped, @ is also neutralized
      expect(sanitizeForSlack('<!channel>')).toBe('&lt;!channel&gt;');
    });

    it('should neutralize user mentions', () => {
      // Both < > and @ are handled
      expect(sanitizeForSlack('<@U12345678>')).toBe('&lt;@\u200BU12345678&gt;');
    });

    it('should neutralize link injection', () => {
      expect(sanitizeForSlack('<http://evil.com|Click here>')).toBe('&lt;http://evil.com|Click here&gt;');
    });

    it('should neutralize subteam mentions', () => {
      expect(sanitizeForSlack('<!subteam^S12345678>')).toBe('&lt;!subteam^S12345678&gt;');
    });

    it('should handle empty string', () => {
      expect(sanitizeForSlack('')).toBe('');
    });

    it('should preserve normal text', () => {
      expect(sanitizeForSlack('お問い合わせです')).toBe('お問い合わせです');
    });

    it('should handle multiple special characters', () => {
      // @ is neutralized with zero-width space
      expect(sanitizeForSlack("<script>alert('xss')</script> & @channel")).toBe(
        "&lt;script&gt;alert('xss')&lt;/script&gt; &amp; @\u200Bchannel",
      );
    });

    it('should neutralize email addresses containing @', () => {
      const result = sanitizeForSlack('user@example.com');
      expect(result).toBe('user@\u200Bexample.com');
      expect(result).toContain('@\u200B');
    });
  });
});
