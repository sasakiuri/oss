import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { renderContent, renderSearchDocuments } from '@/lib/content/render';
import type { ContentSource } from '@/lib/content/types';

const heading = fc.record({
  level: fc.integer({ min: 1, max: 6 }),
  title: fc
    .array(
      fc.constantFrom('日本語', '申請', '図版', 'ABC', 'abc', '1', 'é', 'é', 'ガ', '（補足）', '50%', 'a/b', 'a?b'),
      {
        minLength: 1,
        maxLength: 4,
      },
    )
    .map((words) => `資料 ${words.join(' ')}`),
  format: fc.constantFrom('plain', 'strong', 'emphasis', 'code', 'link', 'strikethrough'),
});

function formatHeading({ level, title, format }: fc.ArbitraryValue<typeof heading>): string {
  const text = {
    plain: title,
    strong: `**${title}**`,
    emphasis: `*${title}*`,
    code: `\`${title}\``,
    link: `[${title}](https://example.com)`,
    strikethrough: `~~${title}~~`,
  }[format];
  return `${'#'.repeat(level)} ${text}`;
}

describe('Markdown heading properties', () => {
  it('keeps duplicate Japanese headings, permalinks, the TOC and search destinations in agreement', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(heading, { minLength: 1, maxLength: 6 }),
        fc.constantFrom('articles' as const, 'news' as const),
        async (generated, type) => {
          // Every run contains duplicate headings, even when the generated titles are all different.
          const headings = [...generated, ...generated];
          const source: ContentSource = {
            type,
            slug: 'example',
            frontmatter: { title: '資料', published: '2024-01-01', tags: [] },
            content: `${headings.map(formatHeading).join('\n\n')}\n\n参照[^note]\n\n[^note]: 脚注の本文`,
          };
          const [{ html, tableOfContents }, documents] = await Promise.all([
            renderContent(source),
            renderSearchDocuments(source),
          ]);
          const page = new DOMParser().parseFromString(html, 'text/html');
          const renderedHeadings = [...page.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(
            (node) => node.id !== 'footnote-label',
          );
          const ids = renderedHeadings.map((node) => node.id);
          expect(renderedHeadings).toHaveLength(headings.length);
          expect(new Set(ids).size).toBe(headings.length);
          expect(ids.every(Boolean)).toBe(true);

          const shift = headings.some(({ level }) => level === 1) ? 1 : 0;
          const expected = headings.map(({ level, title }, index) => ({
            id: ids[index]!,
            level: Math.min(level + shift, 6),
            title,
          }));
          expect(tableOfContents).toEqual(expected.filter(({ level }) => level === 2 || level === 3));
          expect(documents.slice(1).map(({ id, section }) => ({ id, section }))).toEqual(
            expected.map(({ id, title }) => ({ id: `/${type}/example/#${encodeURIComponent(id)}`, section: title })),
          );

          for (const [index, node] of renderedHeadings.entries()) {
            expect(node.tagName).toBe(`H${expected[index]!.level}`);
            expect(node.textContent).toBe(expected[index]!.title);
            const anchors = node.querySelectorAll<HTMLAnchorElement>('.heading-anchor');
            expect(anchors).toHaveLength(1);
            const anchor = anchors[0]!;
            expect(anchor.tabIndex).toBe(0);
            expect(anchor.getAttribute('aria-label')).toBe(`「${expected[index]!.title}」へのリンク`);
            expect(anchor.getAttribute('href')).toBe(`#${encodeURIComponent(node.id)}`);
            expect(page.getElementById(decodeURIComponent(anchor.hash.slice(1)))).toBe(node);
          }
          expect(page.getElementById('footnote-label')?.querySelector('a')).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });
});
