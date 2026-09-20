import { afterEach, describe, expect, it, vi } from 'vitest';

import { stripHtml, stripHtmlTags } from '@/lib/utils/html';

afterEach(() => vi.unstubAllGlobals());

describe('news summary text', () => {
  it('extracts browser text and decodes entities', () => {
    expect(stripHtml('<p>Hello <strong>World</strong> &amp; friends</p>')).toBe('Hello World & friends');
  });

  it('removes tags during server rendering', () => {
    vi.stubGlobal('window', undefined);
    expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
  });

  it('preserves long runs of unmatched opening brackets during server rendering', () => {
    vi.stubGlobal('window', undefined);
    const input = '<'.repeat(100_000);
    expect(stripHtml(input)).toBe(input);
  });
});

describe('tag removal for text display', () => {
  it.each([
    ['<p title="1<2">Hello</p>', 'Hello'],
    ['<p>Hello</p> <unfinished', 'Hello <unfinished'],
    ['1 > 0 <strong>text</strong>', '1 > 0 text'],
    ['<scr<script>ipt>', 'ipt>'],
    ['', ''],
  ])('preserves existing text extraction for %s', (input, expected) => {
    expect(stripHtmlTags(input)).toBe(expected);
  });
});
