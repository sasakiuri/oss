import { describe, it, expect } from 'vitest';

import {
  escapeHtml,
  stripHtml,
  sanitizeForDisplay,
  sanitizeUrl,
  createRateLimiter,
  sanitizeHtml,
} from '@/lib/security/sanitize';
import { sanitizeForLogging, sanitizeForSlack } from '@/lib/security/sanitize-logging';
import {
  sanitizeHtml as sanitizeClientHtml,
  sanitizeForDisplay as sanitizeClientForDisplay,
  stripHtml as stripClientHtml,
} from '@/lib/security/sanitize.client';

describe('Security Sanitization', () => {
  describe.each([
    ['server', sanitizeHtml],
    ['client', sanitizeClientHtml],
  ] as const)('sanitizeHtml (%s)', (_name, sanitizeHtml) => {
    it('should remove script tags', () => {
      const input = '<p>Hello</p><script>alert("xss")</script>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>Hello</p>');
    });

    it('should remove event handlers with double quotes', () => {
      const input = '<div onclick="alert(1)">Click me</div>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onclick');
      expect(result).toContain('Click me');
    });

    it('should remove event handlers with single quotes', () => {
      const input = "<img onerror='alert(1)' src='x'>";
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onerror');
    });

    it('should remove javascript: URLs', () => {
      const input = '<a href="javascript:alert(1)">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
    });

    it('should remove data: URLs', () => {
      const input = '<a href="data:text/html,<script>alert(1)</script>">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('data:');
    });

    it('should remove style tags', () => {
      const input = '<style>body { display: none; }</style><p>Text</p>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<style>');
      expect(result).toContain('<p>Text</p>');
    });

    it('should remove iframe tags', () => {
      const input = '<iframe src="evil.com"></iframe><p>Safe</p>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<iframe');
      expect(result).toContain('<p>Safe</p>');
    });

    it('should remove form and input tags', () => {
      const input = '<form action="evil.com"><input type="text"></form>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<form');
      expect(result).not.toContain('<input');
    });

    it('should preserve safe HTML content', () => {
      const input = '<p><strong>Bold</strong> and <em>italic</em></p>';
      const result = sanitizeHtml(input);
      expect(result).toBe(input);
    });

    it('should preserve links with safe href', () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).toBe(input);
    });

    it("should add rel='noopener noreferrer' to links with target='_blank'", () => {
      const input = '<a href="https://example.com" target="_blank">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).toContain('rel="noopener noreferrer"');
      expect(result).toContain('target="_blank"');
    });

    it("should not add rel to links without target='_blank'", () => {
      const input = '<a href="https://example.com" target="_self">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('rel="noopener noreferrer"');
    });

    it('should not add rel to links without target attribute', () => {
      const input = '<a href="https://example.com">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('rel=');
    });

    it('should handle empty string', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('should handle complex XSS attempts', () => {
      const input = `
        <div onmouseover="alert(1)">
          <img src="x" onerror="alert(2)">
          <script>document.cookie</script>
          <a href="javascript:void(0)">Click</a>
        </div>
      `;
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onmouseover');
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('javascript:');
    });

    it('should block SVG-based XSS vectors', () => {
      const input = '<svg onload="alert(1)"><circle cx="50" cy="50" r="40"/></svg>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<svg');
      expect(result).not.toContain('onload');
    });

    it('should block MathML-based XSS vectors', () => {
      const input = '<math><maction actiontype="statusline#http://evil.com">Click</maction></math>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('<math');
      expect(result).not.toContain('<maction');
    });

    it('should block attribute splitting attacks', () => {
      const input = '<a href="valid" onclick="alert(1)" href="javascript:alert(2)">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('javascript:');
    });

    it('should block encoded XSS attempts', () => {
      const input = '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
    });

    it('should block malformed tag XSS', () => {
      const input = '<img src=x onerror=alert(1)//>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onerror');
    });

    it('should block base64 data URI XSS', () => {
      const input = '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('data:');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe('&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;');
    });

    it('should escape ampersand', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape quotes', () => {
      expect(escapeHtml('He said "Hello"')).toBe('He said &quot;Hello&quot;');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle string without special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe.each([
    ['server', stripHtml],
    ['client', stripClientHtml],
  ] as const)('stripHtml (%s)', (_name, stripHtml) => {
    it('should remove HTML tags', () => {
      expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
    });

    it('should handle nested tags', () => {
      expect(stripHtml('<div><span>Test</span></div>')).toBe('Test');
    });

    it('should handle self-closing tags', () => {
      expect(stripHtml('Hello<br/>World')).toBe('HelloWorld');
    });

    it('should remove tags with opening brackets in quoted attributes', () => {
      expect(stripHtml('<p title="1<2">Hello</p>')).toBe('Hello');
    });

    it('should handle empty string', () => {
      expect(stripHtml('')).toBe('');
    });

    it('should preserve long runs of unmatched opening brackets as text', () => {
      const input = '<'.repeat(100_000);
      expect(stripHtml(input)).toBe(input);
    });
  });

  describe.each([
    ['server', sanitizeForDisplay],
    ['client', sanitizeClientForDisplay],
  ] as const)('sanitizeForDisplay (%s)', (_name, sanitizeForDisplay) => {
    it('should strip and escape HTML', () => {
      expect(sanitizeForDisplay('<p>Hello & <script>evil</script></p>')).toBe('Hello &amp; evil');
    });

    it('should handle complex nested HTML with special chars', () => {
      expect(sanitizeForDisplay('<div onclick="alert()">Test & <b>bold</b></div>')).toBe('Test &amp; bold');
    });

    it('should escape an unfinished tag left after text extraction', () => {
      expect(sanitizeForDisplay('<p>Text</p><script')).toBe('Text&lt;script');
    });
  });

  describe('sanitizeUrl', () => {
    it('should allow https URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
    });

    it('should allow http URLs', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
    });

    it('should reject javascript: URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    });

    it('should reject data: URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('should return null for invalid URLs', () => {
      expect(sanitizeUrl('not-a-url')).toBeNull();
    });

    it('should preserve URL path and query', () => {
      expect(sanitizeUrl('https://example.com/path?query=value')).toBe('https://example.com/path?query=value');
    });

    it('should reject file: URLs', () => {
      expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
    });
  });

  describe('sanitizeForLogging', () => {
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
      expect(result.user.name).toBe('test');
      expect(result.user.apiKey).toBe('[REDACTED]');
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

      it('should truncate User-Agent strings', () => {
        const obj = {
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };
        const result = sanitizeForLogging(obj);
        expect(result.userAgent).toContain('...');
        expect((result.userAgent as string).length).toBeLessThan(100);
      });

      it('should mask email addresses', () => {
        const obj = { email: 'john.doe@example.com' };
        const result = sanitizeForLogging(obj);
        expect(result.email).toBe('jo***@example.com');
      });

      it('should handle email without domain', () => {
        const obj = { email: 'invalid-email' };
        const result = sanitizeForLogging(obj);
        expect(result.email).toBe('[REDACTED]');
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
        expect((result.request as { userAgent: string }).userAgent).toContain('...');
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

  describe('createRateLimiter', () => {
    it('should allow requests within limit', () => {
      const limiter = createRateLimiter(3, 1000);
      expect(limiter.canRequest()).toBe(true);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(true);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(true);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(false);
    });

    it('should reset after window expires', async () => {
      const limiter = createRateLimiter(1, 50);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(false);
      await new Promise((r) => setTimeout(r, 60));
      expect(limiter.canRequest()).toBe(true);
    });

    it('should reset manually', () => {
      const limiter = createRateLimiter(1, 10000);
      limiter.recordRequest();
      expect(limiter.canRequest()).toBe(false);
      limiter.reset();
      expect(limiter.canRequest()).toBe(true);
    });
  });
});
