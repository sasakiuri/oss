// @vitest-environment node
/* eslint-disable @next/next/no-head-element -- This fixture exercises full-document React SSR without Next.js. */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContentStyles } from '@/components/content-styles';
import { renderContent } from '@/lib/content/render';

const mathStylesheet = '/content-styles/katex.min.css';
const codeStylesheet = '/content-styles/github-dark.css';

describe('content styles in server HTML', () => {
  it.each([
    { name: 'plain content', content: '# Plain article\n\nA paragraph and `inline code`.', expected: [] },
    { name: 'inline math', content: 'The formula is $x^2$.', expected: [mathStylesheet] },
    { name: 'display math', content: '$$\nx^2 + y^2\n$$', expected: [mathStylesheet] },
    { name: 'highlighted code', content: '```js\nconst answer = 42;\n```', expected: [codeStylesheet] },
    {
      name: 'mixed math and highlighted code',
      content: '$x^2$ and $y^2$.\n\n```js\nconst answer = 42;\n```\n\n```css\np { color: red; }\n```',
      expected: [mathStylesheet, codeStylesheet],
    },
    {
      name: 'plain code and class-like text',
      content:
        '`<span class="katex">` and `class="hljs"`.\n\n```\n<span class="katex">\n```\n\n<p class="katex-example hljs-keyword" data-class="katex">Example</p>',
      expected: [],
    },
    {
      name: 'text language fence with an actual highlighter class',
      content: '```text\n<span class="katex">\n```',
      expected: [codeStylesheet],
    },
    {
      name: 'commented HTML and attribute values mentioning classes',
      content:
        '<!-- <span class="katex hljs">Hidden example</span> -->\n\n<p title=\'class="katex" class="hljs"\'>Visible text</p>',
      expected: [],
    },
  ])('includes only required styles for $name without client JavaScript', async ({ content, expected }) => {
    const { html } = await renderContent({
      type: 'articles',
      slug: 'example',
      frontmatter: { title: 'Example', published: '2024-01-01', tags: [] },
      content,
    });
    const markup = renderToStaticMarkup(
      <html lang="en">
        <head />
        <body>
          <ContentStyles html={html} />
          <main dangerouslySetInnerHTML={{ __html: html }} />
        </body>
      </html>,
    );
    const head = markup.slice(0, markup.indexOf('</head>'));
    const links = [...head.matchAll(/<link\b[^>]*>/g)].map(([link]) => link);
    expect(links).toHaveLength(expected.length);
    for (const [index, href] of expected.entries()) {
      expect(links[index]).toContain('rel="stylesheet"');
      expect(links[index]).toContain(`href="${href}"`);
      expect(links[index]).toContain('data-precedence="content"');
    }
    expect(markup).not.toContain('<script');
    expect(markup).toContain(html);
  });
});
