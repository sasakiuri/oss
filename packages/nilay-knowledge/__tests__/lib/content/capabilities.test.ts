import type { Root } from 'hast';
import { describe, expect, it } from 'vitest';

import { collectContentCapabilities } from '@/lib/content/capabilities';
import { renderContent } from '@/lib/content/render';

const empty = { mathStyles: false, highlightStyles: false, codeControls: false };

async function markdown(content: string) {
  return renderContent({
    type: 'articles',
    slug: 'example',
    frontmatter: { title: 'Example', published: '2024-01-01', tags: [] },
    content,
  });
}

describe('rendered content capabilities', () => {
  it.each([
    ['ordinary prose', 'Plain text with `inline code`.', empty],
    ['literal marker', '`data-code-block` and `data-code-controls`.', empty],
    ['escaped classes', '`<span class="katex hljs">`.', empty],
    ['comment', '<!-- <span class="katex hljs" data-code-block> -->', empty],
    ['unrelated attribute', '<p title="katex hljs data-code-block" data-example="data-code-block">Text</p>', empty],
    ['class substrings', '<p class="katex-example hljs-keyword">Text</p>', empty],
    ['authored math', '<p class="example katex">Text</p>', { ...empty, mathStyles: true }],
    ['authored highlighting', '<p class="hljs example">Text</p>', { ...empty, highlightStyles: true }],
    ['authored empty marker', '<div data-code-block></div>', { ...empty, codeControls: true }],
    ['inline math', '$x^2$', { ...empty, mathStyles: true }],
    ['display math', '$$\nx^2\n$$', { ...empty, mathStyles: true }],
    ['plain fence', '```\nsource\n```', { ...empty, codeControls: true }],
    ['highlighted fence', '```js\nconst x = 1;\n```', { ...empty, highlightStyles: true, codeControls: true }],
    ['diagram fence', '```mermaid\ngraph TD; A-->B;\n```', { ...empty, codeControls: true }],
    ['DOT fence', '```dot\ndigraph { a -> b }\n```', { ...empty, codeControls: true }],
  ])('reports final emitted features for %s', async (_name, content, expected) => {
    const result = await markdown(String(content));
    expect(result.capabilities).toEqual(expected);
    document.body.innerHTML = result.html;
    expect(result.capabilities).toEqual({
      mathStyles: document.querySelector('.katex') !== null,
      highlightStyles: document.querySelector('.hljs') !== null,
      codeControls: document.querySelector('[data-code-block]') !== null,
    });
    expect(JSON.parse(JSON.stringify(result.capabilities))).toEqual(expected);
  });

  it('collects string or token-array classes and attribute presence without leaking state', () => {
    const tree: Root = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'p', properties: { className: 'example\tkatex' }, children: [] },
        {
          type: 'element',
          tagName: 'div',
          properties: { className: ['hljs', 'example'], dataCodeBlock: '' },
          children: [],
        },
      ],
    };
    expect(collectContentCapabilities(tree)).toEqual({ mathStyles: true, highlightStyles: true, codeControls: true });
    expect(collectContentCapabilities({ type: 'root', children: [] })).toEqual(empty);
  });

  it('keeps the generated client portal selectors consistent with code and diagram capabilities', async () => {
    const result = await markdown('```ts:example.ts\nconst x = 1;\n```\n\n```mermaid\ngraph TD; A-->B;\n```');
    document.body.innerHTML = result.html;
    expect(result.capabilities).toEqual({ mathStyles: false, highlightStyles: true, codeControls: true });
    const blocks = [...document.querySelectorAll('[data-code-block]')];
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.querySelectorAll('[data-code-controls]')).toHaveLength(1);
      expect(block.querySelectorAll('pre > code')).toHaveLength(1);
      expect(block.querySelector('figcaption > span')?.textContent).not.toBe('');
    }
    const diagram = blocks[1]!;
    expect(diagram).toHaveAttribute('data-code-language', 'mermaid');
    expect(diagram.querySelectorAll('[data-diagram-target]')).toHaveLength(1);
    expect(diagram.querySelector('[data-diagram-source]')).toHaveAttribute('open');
  });

  it('creates independent metadata for concurrent renders', async () => {
    const [math, plain, code] = await Promise.all([markdown('$x$'), markdown('Plain'), markdown('```\nx\n```')]);
    expect(math.capabilities).toEqual({ ...empty, mathStyles: true });
    expect(plain.capabilities).toEqual(empty);
    expect(code.capabilities).toEqual({ ...empty, codeControls: true });
  });
});
