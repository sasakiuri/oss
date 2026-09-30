// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { contentDescription } from '@/lib/content/description';
import { createContentProjectionProcessor } from '@/lib/content/grammar';
import { findReferences } from '@/lib/content/pdf-search';
import { renderContent, renderSearchDocuments } from '@/lib/content/render';
import type { ContentSource } from '@/lib/content/types';
import { lintMarkdown } from '@/scripts/lint-markdown';

function source(content: string): ContentSource {
  return {
    type: 'articles',
    slug: 'grammar',
    content,
    frontmatter: { title: 'Grammar', published: '2026-09-30', tags: [] },
  };
}

const fixtures = [
  {
    name: 'collapsed details and actual PDF references',
    markdown:
      ':::details[More **information**]\n\nCollapsed supplement paragraph. [PDF](supplement.pdf)\n\n## Supplement section\n\nReadable details text.\n:::\n\nNormal paragraph.',
    description: 'Collapsed supplement paragraph. PDF',
    headings: ['supplement-section'],
    pdfs: ['supplement.pdf'],
    searchable: ['More information', 'Readable details text.', 'Normal paragraph.'],
    excluded: [':::details'],
    html: '<details>',
  },
  {
    name: 'reference-style figure with an excluded summary caption',
    markdown:
      ':::figure[Caption **text**]\n![Illustration description][image]\n:::\n\nNormal introductory paragraph.\n\n[image]: illustration.png',
    description: 'Normal introductory paragraph.',
    headings: [],
    pdfs: [],
    searchable: ['Illustration description', 'Caption text'],
    excluded: [':::figure'],
    html: '<figcaption>',
  },
  {
    name: 'hidden content and code-shaped PDF examples',
    markdown:
      '<div hidden><p>Secret text <a href="hidden.pdf">Hidden PDF</a></p></div>\n\n<div aria-hidden="true"><a href="decorative.pdf">Decoration</a></div>\n\n```mermaid\n[example](code.pdf)\nflowchart LR\n```\n\nReadable paragraph. [Public PDF](public.pdf)',
    description: 'Readable paragraph. Public PDF',
    headings: [],
    pdfs: ['public.pdf'],
    searchable: ['[example](code.pdf)', 'flowchart LR', 'Readable paragraph.'],
    excluded: ['Secret text', 'Hidden PDF', 'Decoration'],
    html: 'data-code-language="mermaid"',
  },
  {
    name: 'alerts, math, footnotes, formatted and repeated headings',
    markdown:
      '> [!NOTE]\n> Alert paragraph with $x^2$.\n\n$$\ny^2\n$$\n\n## **Formatted** heading\n\nFirst section.[^note]\n\n## **Formatted** heading\n\nSecond section.\n\n[^note]: Footnote [PDF](note.pdf).',
    description: 'Alert paragraph with x^2.',
    headings: ['formatted-heading', 'formatted-heading-1'],
    pdfs: ['note.pdf'],
    searchable: ['Alert paragraph', 'x^2', 'y^2', 'Footnote PDF.'],
    excluded: ['[!NOTE]'],
    html: 'markdown-alert',
  },
  {
    name: 'literal colons and authored section IDs',
    markdown:
      '<h2 id="stable">Authored heading</h2>\n\nTime 12:30, namespace:name and https://example.com remain ordinary prose.',
    description: 'Time 12:30, namespace:name and https://example.com remain ordinary prose.',
    headings: ['stable'],
    pdfs: [],
    searchable: ['12:30', 'namespace:name'],
    excluded: [':::'],
    html: 'id="stable"',
  },
];

describe('shared Markdown grammar and independent projections', () => {
  it.each(fixtures)('$name', async ({ markdown, description, headings, pdfs, searchable, excluded, html }) => {
    const input = source(markdown);
    const [rendered, documents, references, lint] = await Promise.all([
      renderContent(input),
      renderSearchDocuments(input),
      findReferences([input]),
      lintMarkdown(`---\ntitle: Grammar\n---\n\n${markdown}`, 'content/articles/grammar/index.md'),
    ]);
    expect(contentDescription(input)).toBe(description);
    expect(rendered.html).toContain(html);
    expect(rendered.tableOfContents.map(({ id }) => id)).toEqual(headings);
    expect(documents.slice(1).map(({ id }) => id)).toEqual(headings.map((id) => `/articles/grammar/#${id}`));
    const text = documents.map(({ text }) => text).join(' ');
    for (const expected of searchable) expect(text).toContain(expected);
    for (const unexpected of excluded) expect(text).not.toContain(unexpected);
    expect(references.map(({ url }) => url)).toEqual(pdfs.map((name) => `/content/articles/grammar/${name}`));
    expect(lint.messages).toEqual([]);
  });

  it('keeps invalid directive diagnostics at original frontmatter-aware positions', async () => {
    const markdown = '---\ntitle: Grammar\n---\n\n:::details[Label]{invalid}\nBody\n:::';
    const lint = await lintMarkdown(markdown, 'article.md');
    expect(lint.messages).toEqual([
      expect.objectContaining({ line: 5, column: 1, ruleId: 'invalid-directive', file: 'article.md' }),
    ]);
    const input = source(':::details[Label]{invalid}\nBody\n:::');
    expect(() => contentDescription(input)).toThrow('Attribute "invalid"');
    await expect(findReferences([input])).rejects.toThrow('Attribute "invalid"');
    await expect(renderContent(input)).rejects.toThrow('Attribute "invalid"');
  });

  it('owns separate ASTs for concurrent documents and synchronous projections', async () => {
    const processor = createContentProjectionProcessor();
    const first = processor.runSync(processor.parse(':::details[First]\nFirst paragraph.\n:::'));
    const second = processor.runSync(processor.parse(':::details[Second]\nSecond paragraph.\n:::'));
    first.children.length = 0;
    expect(second.children.length).toBeGreaterThan(0);
    const results = await Promise.all(fixtures.map(({ markdown }) => renderContent(source(markdown))));
    results.forEach((result, index) => expect(result.html).toContain(fixtures[index]!.html));
  });
});
