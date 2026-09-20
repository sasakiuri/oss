import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { rehypeCodeBlocks, remarkCodeMeta } from '@/lib/content/code-blocks';

async function render(content: string): Promise<Document> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkCodeMeta)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeHighlight, { plainText: ['mermaid', 'dot', 'graphviz', 'not-a-language', 'math'] })
    .use(rehypeKatex)
    .use(rehypeCodeBlocks)
    .use(rehypeStringify)
    .process(content);
  document.body.innerHTML = String(result);
  return document;
}

describe('code block metadata', () => {
  it.each(['ts:example.ts', 'ts filename="example.ts"', "ts filename='example.ts'", 'ts filename=example.ts'])(
    'renders a filename and highlights the language from %s',
    async (fence) => {
      const document = await render(`\`\`\`${fence}\nconst value = 1;\n\`\`\``);
      const figure = document.querySelector('figure');
      expect(figure?.className).toBe('markdown-code');
      expect(figure?.getAttribute('data-code-language')).toBe('ts');
      expect(figure?.querySelector('.code-caption')?.textContent).toBe('example.ts');
      expect(figure?.querySelector('code')?.classList).toContain('language-ts');
      expect(figure?.querySelector('code .hljs-keyword')?.textContent).toBe('const');
      expect(figure?.querySelector('[data-code-controls]')).not.toBeNull();
    },
  );

  it('accepts spaces in quoted filenames and gives explicit metadata precedence', async () => {
    const document = await render('```ts:old.ts linenos filename="my example.ts"\nconst value = 1;\n```');
    expect(document.querySelector('.code-caption')?.textContent).toBe('my example.ts');
  });

  it('escapes filenames as text and attribute values instead of injecting HTML', async () => {
    const filename = '"><img src=x onerror=alert(1)>&.ts';
    const document = await render(`\`\`\`ts filename='${filename}'\nconst value = 1;\n\`\`\``);
    expect(document.querySelector('.code-caption')?.textContent).toBe(filename);
    expect(document.querySelector('code')?.getAttribute('data-filename')).toBe(filename);
    expect(document.querySelector('img, [onerror]')).toBeNull();
  });

  it('limits long filenames without changing the code text', async () => {
    const document = await render(`\`\`\`ts:${'a'.repeat(250)}.ts\nconst value = 1;\n\`\`\``);
    expect(document.querySelector('.code-caption')?.textContent).toBe('a'.repeat(200));
    expect(document.querySelector('code')?.textContent).toBe('const value = 1;\n');
  });
});

describe('code block wrappers', () => {
  it('preserves the exact text copied from nested highlighted spans', async () => {
    const code = 'const markup = `<span>${value}</span>`;\n\tconsole.log(markup);\n\n';
    const document = await render(`\`\`\`js\n${code}\`\`\``);
    expect(document.querySelector('code span span')).not.toBeNull();
    expect(document.querySelector('pre code')?.textContent).toBe(code);
    expect(document.querySelector('.code-caption')?.textContent).toBe('js');
  });

  it('preserves authored pre attributes and wraps code inside nested content', async () => {
    const document = await render(
      '<blockquote><pre id="sample" class="original" tabindex="0" role="region" aria-label="入力例"><code>sample</code></pre></blockquote>',
    );
    const pre = document.querySelector('blockquote > figure > pre');
    expect(pre?.id).toBe('sample');
    expect(pre?.className).toBe('original');
    expect(pre?.getAttribute('tabindex')).toBe('0');
    expect(pre?.getAttribute('role')).toBe('region');
    expect(pre).toHaveAccessibleName('入力例');
  });

  it('leaves inline code and pre elements without a single code child alone', async () => {
    const document = await render('`inline`\n\n<pre>plain text</pre>\n\n<pre><code>one</code><code>two</code></pre>');
    expect(document.querySelector('figure')).toBeNull();
    expect(document.querySelector('p > code')?.textContent).toBe('inline');
    expect(document.querySelectorAll('pre')).toHaveLength(2);
  });

  it.each(['mermaid', 'dot', 'graphviz'])('keeps %s source visible before client rendering', async (language) => {
    const source = language === 'mermaid' ? 'graph TD\n  A["<input>"] --> B\n' : 'digraph G { a -> b; }\n';
    const document = await render(`\`\`\`${language}\n${source}\`\`\``);
    const figure = document.querySelector('figure.markdown-diagram');
    expect(figure?.getAttribute('data-code-language')).toBe(language);
    expect(figure?.querySelector('.code-caption')?.textContent).toBe(language);
    expect(figure?.querySelector('[data-code-controls]')).not.toBeNull();
    expect(figure?.querySelector('[data-diagram-target]')?.nextElementSibling?.tagName).toBe('DETAILS');
    const details = figure?.querySelector('details[data-diagram-source]');
    expect(details?.hasAttribute('open')).toBe(true);
    expect(details?.querySelector('summary')?.textContent).toBe('図のソース');
    expect(details?.querySelector('pre code')?.textContent).toBe(source);
    expect(details?.querySelector('input')).toBeNull();
  });

  it('renders unlabelled and unknown languages as readable code', async () => {
    const document = await render('```\nplain <text>\n```\n\n```not-a-language\nunknown <text>\n```');
    expect([...document.querySelectorAll('.code-caption')].map((caption) => caption.textContent)).toEqual([
      'text',
      'not-a-language',
    ]);
    expect([...document.querySelectorAll('pre code')].map((code) => code.textContent)).toEqual([
      'plain <text>\n',
      'unknown <text>\n',
    ]);
  });

  it('does not turn display or inline math into code figures', async () => {
    const document = await render('$$\nx^2 + y^2\n$$\n\n$x^2$\n\n```math\nx^2\n```');
    expect(document.querySelectorAll('.katex')).toHaveLength(3);
    expect(document.querySelector('figure')).toBeNull();
    expect(document.querySelector('[data-code-controls]')).toBeNull();
  });
});
