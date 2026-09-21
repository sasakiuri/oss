import { describe, it, expect } from 'vitest';

import { escapeHtml, stripHtml, sanitizeForDisplay, sanitizeUrl, sanitizeHtml } from '@/lib/security/html';

describe('Security Sanitization', () => {
  describe('sanitizeHtml', () => {
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

  describe('stripHtml', () => {
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

  describe('sanitizeForDisplay', () => {
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
});
