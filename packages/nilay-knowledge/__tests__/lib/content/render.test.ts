import { describe, expect, it } from 'vitest';

import { renderContent, renderSearchDocuments } from '@/lib/content/render';
import type { ContentSource } from '@/lib/content/types';

function source(content: string): ContentSource {
  return {
    type: 'articles',
    slug: 'example',
    frontmatter: { title: 'Example', published: '2024-01-01', tags: [] },
    content,
  };
}

function renderDocument(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe('Markdown rendering', () => {
  it('resolves inline, reference and raw HTML URLs without rewriting code or URI schemes', async () => {
    const { html } = await renderContent(
      source(`
![Inline](./image.png "Image title")
[Download](docs/file.pdf?download=1#page=2)
![Shared](../../assets/shared.png)
[Reference][document]

[document]: report.pdf "Report"

<img src="raw.png" alt="Raw"><a href="raw.pdf">Raw link</a>

[Mail](mailto:hello@example.com) [Phone](tel:123) [Web](https://example.com/a)
[Root](/root/) [Fragment](#section) [Network](//example.com/a)

\`![Code](code.png)\`

\`\`\`text
[Example](example.pdf)
\`\`\`
`),
    );
    const document = renderDocument(html);
    const images = [...document.querySelectorAll('img')].map((image) => image.getAttribute('src'));
    expect(images).toEqual([
      '/content/articles/example/image.png',
      '/content/assets/shared.png',
      '/content/articles/example/raw.png',
    ]);
    const links = [...document.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual([
      '/content/articles/example/docs/file.pdf?download=1#page=2',
      '/content/articles/example/report.pdf',
      '/content/articles/example/raw.pdf',
      'mailto:hello@example.com',
      'tel:123',
      'https://example.com/a',
      '/root/',
      '#section',
      '//example.com/a',
    ]);
    expect(document.querySelector('img')?.getAttribute('title')).toBe('Image title');
    expect(document.querySelector('code')?.textContent).toBe('![Code](code.png)');
    expect(document.querySelector('pre')?.textContent).toContain('[Example](example.pdf)');
  });

  it('uses actual rendered IDs for formatted, duplicate, Japanese and underlined headings', async () => {
    const { html, tableOfContents } = await renderContent(
      source(`
## **Title** and [link](https://example.com)
## **Title** and [link](https://example.com)
### 日本語の見出し「例」
Underlined heading
--------------
<h2 id="custom" class="existing">HTML <em>heading</em></h2>

\`\`\`md
## Not a heading
\`\`\`
Text[^note]

[^note]: Note text
`),
    );
    const document = renderDocument(html);
    expect(tableOfContents.map((item) => item.title)).toEqual([
      'Title and link',
      'Title and link',
      '日本語の見出し「例」',
      'Underlined heading',
      'HTML heading',
    ]);
    expect(tableOfContents.slice(0, 2).map((item) => item.id)).toEqual(['title-and-link', 'title-and-link-1']);
    for (const item of tableOfContents) {
      const heading = document.getElementById(item.id);
      expect(heading?.tagName).toBe(`H${item.level}`);
      expect(heading).toHaveAccessibleName(item.title);
      expect(heading?.querySelector('.heading-anchor')?.getAttribute('href')).toBe(`#${encodeURIComponent(item.id)}`);
      expect(heading?.querySelector('.heading-anchor')).toHaveAccessibleName(`「${item.title}」へのリンク`);
      expect(heading?.lastElementChild?.className).toBe('heading-anchor');
      expect(heading?.getAttribute('tabindex')).toBe('-1');
      expect(heading?.querySelector('.heading-anchor svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(heading?.querySelector('.heading-anchor svg')?.getAttribute('focusable')).toBe('false');
    }
    expect(document.getElementById('custom')?.className).toBe('existing heading-with-anchor');
    expect(document.getElementById('footnote-label')?.textContent).toBe('脚注');
  });

  it('places legacy top-level headings below the page title and preserves search destinations', async () => {
    const content = source(`
# Chapter
## Section
### Detail
<h1 id="custom" aria-label="Authored heading label">HTML chapter</h1>

###### Deep detail
Text[^note]

[^note]: Note text
`);
    const { html, tableOfContents } = await renderContent(content);
    const document = renderDocument(html);
    expect(document.querySelector('h1')).toBeNull();
    expect(tableOfContents).toEqual([
      { id: 'chapter', level: 2, title: 'Chapter' },
      { id: 'section', level: 3, title: 'Section' },
      { id: 'custom', level: 2, title: 'HTML chapter' },
    ]);
    expect(document.getElementById('detail')?.tagName).toBe('H4');
    expect(document.getElementById('custom')).toHaveAccessibleName('Authored heading label');
    expect(document.getElementById('deep-detail')?.tagName).toBe('H6');
    expect(document.getElementById('footnote-label')?.tagName).toBe('H2');
    const searchDocuments = await renderSearchDocuments(content);
    for (const searchDocument of searchDocuments.slice(1)) {
      const fragment = new URL(searchDocument.id, 'https://example.com').hash.slice(1);
      expect(document.getElementById(decodeURIComponent(fragment))).not.toBeNull();
    }
  });

  it('identifies each footnote return link in Japanese, including repeated references', async () => {
    const { html } = await renderContent(source('First[^one] again[^one] second[^two].\n\n[^one]: One\n[^two]: Two'));
    const document = renderDocument(html);
    const backReferences = [...document.querySelectorAll('[data-footnote-backref]')];
    expect(backReferences.map((link) => link.getAttribute('aria-label'))).toEqual([
      '脚注 1 の参照元に戻る',
      '脚注 1 の参照元（2 か所目）に戻る',
      '脚注 2 の参照元に戻る',
    ]);
    for (const link of backReferences) {
      const reference = document.getElementById(link.getAttribute('href')!.slice(1));
      expect(reference?.getAttribute('aria-describedby')).toBe('footnote-label');
      expect(document.getElementById(reference!.getAttribute('href')!.slice(1))).not.toBeNull();
    }
  });

  it('retains tables, alerts, math, highlighting and trusted HTML', async () => {
    const { html } = await renderContent(
      source(`
| One | Two |
| --- | --- |
| a | b |

> [!NOTE]
> Notice

$x^2$

\`\`\`js
const example = 1;
\`\`\`

<details><summary>More</summary>Details</details>
`),
    );
    const document = renderDocument(html);
    expect(document.querySelector('table')).not.toBeNull();
    const tableRegion = document.querySelector('table')?.parentElement;
    expect(tableRegion?.getAttribute('role')).toBe('region');
    expect(tableRegion?.getAttribute('tabindex')).toBe('0');
    expect(tableRegion?.getAttribute('aria-label')).toContain('横にスクロール');
    expect(document.querySelector('pre')?.getAttribute('tabindex')).toBe('0');
    expect(document.querySelector('pre')?.getAttribute('role')).toBe('region');
    expect(document.querySelector('pre')).toHaveAccessibleName('コードブロック 1（横にスクロールできます）');
    expect([...document.querySelectorAll('th')].map((header) => header.getAttribute('scope'))).toEqual(['col', 'col']);
    expect(document.querySelector('.markdown-alert')).not.toBeNull();
    expect(document.querySelector('.markdown-alert-title')?.textContent).toBe('補足');
    expect(document.querySelector('.markdown-alert svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector('.katex')).not.toBeNull();
    expect(document.querySelector('.hljs')).not.toBeNull();
    expect(document.querySelector('details summary')?.textContent).toBe('More');
  });

  it('distinguishes scroll regions and preserves author-provided descriptions and table headers', async () => {
    const { html } = await renderContent(
      source(`
| Column |
| --- |
| Value |

<table><caption>年間の件数</caption><thead><tr><th scope="row">種類</th><th>件数</th></tr></thead><tbody><tr><th scope="row">申請</th><td>10</td></tr></tbody></table>

<table aria-label="月別の件数"><tr><td>1</td></tr></table>

\`\`\`text
First block
\`\`\`

\`\`\`text
Second block
\`\`\`

<pre aria-label="操作例">Custom block</pre>
<p id="example-label">入力例</p>
<pre aria-labelledby="example-label">Labelled block</pre>
`),
    );
    const document = renderDocument(html);
    expect([...document.querySelectorAll('.table-scroll')].map((region) => region.getAttribute('aria-label'))).toEqual([
      '表 1（横にスクロールできます）',
      '表 2：年間の件数（横にスクロールできます）',
      '表 3：月別の件数（横にスクロールできます）',
    ]);
    expect(document.querySelector('caption')?.textContent).toBe('年間の件数');
    expect(document.querySelectorAll('th[scope="row"]')).toHaveLength(2);
    const blocks = [...document.querySelectorAll('pre')];
    expect(blocks[0]).toHaveAccessibleName('コードブロック 1（横にスクロールできます）');
    expect(blocks[1]).toHaveAccessibleName('コードブロック 2（横にスクロールできます）');
    expect(blocks[2]).toHaveAccessibleName('操作例');
    expect(blocks[3]).toHaveAccessibleName('入力例');
    expect(blocks.every((block) => block.tabIndex === 0)).toBe(true);
  });

  it('does not share heading state between renders', async () => {
    const results = await Promise.all([renderContent(source('## Same\n## Same')), renderContent(source('## Same'))]);
    expect(results.map((result) => result.tableOfContents.map((item) => item.id))).toEqual([
      ['same', 'same-1'],
      ['same'],
    ]);
  });
});
