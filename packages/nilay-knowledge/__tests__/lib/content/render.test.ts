import { describe, expect, it } from 'vitest';

import { renderContent } from '@/lib/content/render';
import type { ContentSource } from '@/lib/content/types';

function source(content: string): ContentSource {
  return {
    type: 'articles',
    slug: 'example',
    frontmatter: { title: 'Example', published: '2024-01-01', tags: [] },
    content,
  };
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
    const document = new DOMParser().parseFromString(html, 'text/html');
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
    const document = new DOMParser().parseFromString(html, 'text/html');
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
      expect(heading?.querySelector('.heading-anchor')?.getAttribute('href')).toBe(`#${item.id}`);
    }
    expect(document.getElementById('custom')?.className).toBe('existing heading-with-anchor');
    expect(document.getElementById('footnote-label')?.textContent).toBe('脚注');
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
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelector('table')).not.toBeNull();
    expect(document.querySelector('.markdown-alert')).not.toBeNull();
    expect(document.querySelector('.katex')).not.toBeNull();
    expect(document.querySelector('.hljs')).not.toBeNull();
    expect(document.querySelector('details summary')?.textContent).toBe('More');
  });

  it('does not share heading state between renders', async () => {
    const results = await Promise.all([renderContent(source('## Same\n## Same')), renderContent(source('## Same'))]);
    expect(results.map((result) => result.tableOfContents.map((item) => item.id))).toEqual([
      ['same', 'same-1'],
      ['same'],
    ]);
  });
});
