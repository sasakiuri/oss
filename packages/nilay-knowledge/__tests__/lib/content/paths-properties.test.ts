import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { resolveContentUrl } from '@/lib/content/paths';

const type = fc.constantFrom('articles' as const, 'news' as const);
const slug = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,15}$/);
const segment = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9_-]{1,15}$/),
  fc.constantFrom('日本語', '図版 1', '100%', 'file.png', 'a?b', 'a#b'),
);

describe('content URL properties', () => {
  it('leaves absolute URLs, custom URI schemes, root paths and fragments unchanged', () => {
    const prefix = fc.oneof(
      fc.constantFrom('/', '//', '#'),
      fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9+.-]{0,15}$/).map((scheme) => `${scheme}:`),
    );
    fc.assert(
      fc.property(prefix, fc.string(), type, slug, (prefix, suffix, type, slug) => {
        const reference = `${prefix}${suffix}`;
        expect(resolveContentUrl(reference, type, slug)).toBe(reference);
        expect(resolveContentUrl('', type, slug)).toBe('');
      }),
    );
  });

  it('resolves relative path segments without losing escaped filenames, queries or fragments', () => {
    fc.assert(
      fc.property(
        fc.array(segment, { minLength: 1, maxLength: 6 }),
        fc.string(),
        fc.string(),
        type,
        slug,
        (segments, query, fragment, type, slug) => {
          const path = segments.map(encodeURIComponent).join('/');
          const suffix = `?${new URLSearchParams({ q: query })}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`;
          const reference = `${path}${suffix}`;
          const expected = `/content/${type}/${slug}/${reference}`;

          expect(resolveContentUrl(reference, type, slug)).toBe(expected);
          expect(resolveContentUrl(`./${reference}`, type, slug)).toBe(expected);
          expect(resolveContentUrl(`discard/../${reference}`, type, slug)).toBe(expected);
          expect(resolveContentUrl(`../${reference}`, type, slug)).toBe(`/content/${type}/${reference}`);
          expect(resolveContentUrl(`../../${reference}`, type, slug)).toBe(`/content/${reference}`);
          expect(resolveContentUrl(`../../../${reference}`, type, slug)).toBe(`/${reference}`);
          expect(resolveContentUrl(suffix, type, slug)).toBe(`/content/${type}/${slug}/${suffix}`);
          expect(resolveContentUrl(expected, type, slug)).toBe(expected);
        },
      ),
    );
  });
});
