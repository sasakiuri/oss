import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { contentDescription } from '@/lib/content/description';
import { parseFrontmatter } from '@/lib/content/frontmatter';
import { createContentRepository } from '@/lib/content/repository';
import type { ContentSource } from '@/lib/content/types';

const source: ContentSource = {
  type: 'news',
  slug: 'example',
  content: '',
  frontmatter: { title: '固有のタイトル', published: '2024-01-01', tags: [] },
};

describe('search descriptions', () => {
  it('uses visible prose and decodes entities without leaking comments, code, CSS or link destinations', () => {
    const content = `<!-- unpublished notes -->
<style>.secret { display: none }</style>
<script>privateScript()</script>
<p hidden>hidden text</p>
<div aria-hidden="true"><p>decorative text</p></div>

# Heading

![Cover](cover.png)

\`\`\`js
codeExample()
\`\`\`

本文の **要点**と[資料][ref]、&amp; 記号。<br>次の行。

[ref]: https://example.com/private-destination

第二段落。`;
    expect(contentDescription({ ...source, content })).toBe('本文の 要点と資料、& 記号。 次の行。');
  });

  it('uses an explicit summary before prose and normalizes its whitespace', () => {
    const frontmatter = parseFrontmatter({ ...source.frontmatter, description: '  編集した\n説明文。  ' }, 'example');
    expect(contentDescription({ ...source, frontmatter, content: '本文。' })).toBe('編集した 説明文。');
    expect(() => parseFrontmatter({ ...source.frontmatter, description: ' ' }, 'example')).toThrow('description');
  });

  it('uses the title for content without prose and truncates without splitting Unicode code points', () => {
    expect(contentDescription({ ...source, content: '# 見出し\n\n![図](figure.png)' })).toBe('固有のタイトル');
    const text = contentDescription({ ...source, content: '😀'.repeat(180) });
    expect(Array.from(text)).toHaveLength(160);
    expect(text).toBe(`${'😀'.repeat(159)}…`);
  });

  it('produces a distinct, plain-text description for every committed article and news entry', async () => {
    const repository = createContentRepository(path.join(process.cwd(), 'content'));
    const items = [...(await repository.listSources('articles')), ...(await repository.listSources('news'))];
    const descriptions = items.map((item) => {
      const description = contentDescription(item);
      expect(description, `${item.type}/${item.slug}`).not.toMatch(/<\/?(?:style|script|table)|<!--|!\[|https?:\/\//);
      expect(description.length).toBeGreaterThan(10);
      return description;
    });
    expect(new Set(descriptions).size).toBe(items.length);
  });
});
