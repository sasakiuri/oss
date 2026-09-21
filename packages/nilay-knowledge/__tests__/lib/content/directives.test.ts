import { describe, expect, it } from 'vitest';

import { renderContent, renderSearchDocuments } from '@/lib/content/render';
import type { ContentSource } from '@/lib/content/types';

function source(content: string): ContentSource {
  return {
    type: 'articles',
    slug: 'directives',
    frontmatter: { title: 'Directives', published: '2024-01-01', tags: [] },
    content,
  };
}

describe('Markdown content directives', () => {
  it('renders native details with Markdown and keeps hidden sections searchable at the rendered headings', async () => {
    const content = source(`
:::details[資料の **詳細**]
## 資料

- 本文の項目
- [添付資料](document.pdf)
:::

:::details[最初から開く]{open}
補足。
:::
`);
    const { html, tableOfContents } = await renderContent(content);
    document.body.innerHTML = html;
    const details = document.querySelectorAll('details');
    expect(details).toHaveLength(2);
    expect(details[0]).not.toHaveAttribute('open');
    expect(details[1]).toHaveAttribute('open');
    expect(details[0].firstElementChild?.tagName).toBe('SUMMARY');
    expect(details[0].querySelector('summary strong')).toHaveTextContent('詳細');
    expect(details[0].querySelectorAll('li')).toHaveLength(2);
    expect(details[0].querySelector('li a')).toHaveAttribute('href', '/content/articles/directives/document.pdf');
    expect(tableOfContents).toEqual([{ id: '資料', title: '資料', level: 2 }]);
    const indexed = await renderSearchDocuments(content);
    expect(indexed[0].text).toBe('資料の 詳細');
    expect(indexed[1].id).toBe(`/articles/directives/#${encodeURIComponent('資料')}`);
    expect(indexed[1].text).toContain('本文の項目 添付資料');
    expect(indexed[1].text).toContain('最初から開く 補足。');
    expect(document.getElementById(decodeURIComponent(indexed[1].id.split('#')[1]))).not.toBeNull();
  });

  it('supports nested details, ordinary Markdown and literal directive examples in code', async () => {
    const { html } = await renderContent(
      source(`
::::details[外側]
:::details[内側]
**本文**
:::
::::

通常の本文と \\:literal[文字列]。
時刻 15:15、見出し:普通の本文。

\`\`\`markdown
:::unknown[Example]
Example body
:::
\`\`\`
`),
    );
    document.body.innerHTML = html;
    expect(document.querySelector('details details strong')).toHaveTextContent('本文');
    expect(document.body).toHaveTextContent('通常の本文と :literal[文字列]。');
    expect(document.body).toHaveTextContent('時刻 15:15、見出し:普通の本文。');
    expect(document.querySelector('code')).toHaveTextContent(':::unknown[Example]');
  });

  it('keeps figure captions, descriptions, relative image URLs and illustration styling', async () => {
    const content = source(`
:::figure[図1 **比較図**]{illustration}
![上下の違いを示す図。](comparison.png "比較")
:::

:::figure[図2 写真]
![対象の写真][photo]
:::

[photo]: photo.jpg
`);
    const { html } = await renderContent(content, { imageDimensions: async () => ({ width: 800, height: 600 }) });
    document.body.innerHTML = html;
    const figures = document.querySelectorAll('figure');
    expect(figures).toHaveLength(2);
    expect(figures[0].lastElementChild?.tagName).toBe('FIGCAPTION');
    expect(figures[0].querySelector('figcaption strong')).toHaveTextContent('比較図');
    expect(figures[0].querySelector('img')).toHaveClass('content-illustration');
    expect(figures[0].querySelector('img')).toHaveAttribute('src', '/content/articles/directives/comparison.png');
    expect(figures[0].querySelector('img')).toHaveAttribute('width', '800');
    expect(figures[0].querySelector('img')).toHaveAttribute('alt', '上下の違いを示す図。');
    expect(figures[0].querySelector('a[data-image-zoom]')).toHaveAccessibleName('上下の違いを示す図。を拡大');
    expect(figures[1].querySelector('img')).toHaveAttribute('src', '/content/articles/directives/photo.jpg');
    expect(figures[1].querySelector('img')).not.toHaveClass('content-illustration');
    expect((await renderSearchDocuments(content))[0].text).toBe('上下の違いを示す図。 図1 比較図 対象の写真 図2 写真');
  });

  it.each([
    [':::unknown[Label]\nBody\n:::', 'Unknown directive "unknown"'],
    [':details[Label]', 'Use :::details'],
    ['::figure[Label]', 'Use :::figure'],
    [':::details\nBody\n:::', 'requires a nonempty [label]'],
    [':::details[ ]\nBody\n:::', 'requires a text label'],
    [':::details[[Link](https://example.com)]\nBody\n:::', 'requires a text label'],
    [':::details[<button>Button</button>]\nBody\n:::', 'requires a text label'],
    [':::details[Label]{onclick="alert(1)"}\nBody\n:::', 'Attribute "onclick" is not supported'],
    [':::details[Label]{.hidden}\nBody\n:::', 'Attribute "class" is not supported'],
    [':::details[Label]{open=false}\nBody\n:::', 'bare boolean attribute {open}'],
    [':::details[Label]\n:::', 'requires a body'],
    [':::figure[Label]{illustration=false}\n![Alt](image.png)\n:::', 'bare boolean attribute {illustration}'],
    [':::figure[Label]\n![](image.png)\n:::', 'exactly one Markdown image'],
    [':::figure[Label]\n![Alt](image.png) ![Second](second.png)\n:::', 'exactly one Markdown image'],
    [':::figure[Label]\nA paragraph\n:::', 'exactly one Markdown image'],
  ])('rejects invalid directives in both rendering and indexing: %s', async (markdown, reason) => {
    for (const render of [renderContent, renderSearchDocuments]) {
      await expect(render(source(markdown))).rejects.toMatchObject({
        reason: expect.stringContaining(reason),
        line: 1,
        column: 1,
        file: 'content/articles/directives/index.md',
        ruleId: 'invalid-directive',
      });
    }
  });
});
