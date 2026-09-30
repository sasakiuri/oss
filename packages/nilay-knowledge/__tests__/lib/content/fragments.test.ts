import { describe, expect, it } from 'vitest';

import { collectPublishedFragments, comparePublishedFragments } from '@/lib/content/fragments';
import { parseContentTree, renderContent, renderSearchDocuments } from '@/lib/content/render';
import type { ContentSource } from '@/lib/content/types';

const source = (content: string): ContentSource => ({
  type: 'articles',
  slug: 'revision',
  content,
  frontmatter: { title: 'Revision', published: '2026-09-30', tags: [] },
});
const inventory = (content: string) => ({
  '/articles/revision/': collectPublishedFragments(parseContentTree(source(content))),
});

it('reports removed headings with public URL and source context without updating the baseline', () => {
  const previous = inventory('## Installation\n\nInstall the tool.');
  expect(comparePublishedFragments(previous, inventory('## Setup\n\nInstall the tool.'))).toEqual([
    '/articles/revision/#installation: published fragment removed (content/articles/revision/index.md)',
  ]);
  expect(comparePublishedFragments(previous, inventory('Section deleted.'))).toHaveLength(1);
  expect(
    comparePublishedFragments(previous, inventory('<h2 id="installation">Setup</h2>\n\nInstall the tool.')),
  ).toEqual([]);
  expect(previous).toEqual(inventory('## Installation\n\nInstall the tool.'));
});

it('detects semantic retargeting when repeated headings are inserted or reordered', () => {
  const previous = inventory('## Step\n\nInstall the tool.\n\n## Step\n\nConfigure the tool.');
  const inserted = inventory(
    '## Step\n\nUnrelated new step.\n\n## Step\n\nInstall the tool.\n\n## Step\n\nConfigure the tool.',
  );
  const reordered = inventory('## Step\n\nConfigure the tool.\n\n## Step\n\nInstall the tool.');
  expect(comparePublishedFragments(previous, inserted)).toHaveLength(2);
  expect(comparePublishedFragments(inventory('## Step\n\nInstall the tool.'), inserted)).toHaveLength(1);
  expect(comparePublishedFragments(previous, reordered)).toHaveLength(2);
  const stable = inventory(
    '<h2 id="step">Step</h2>\n\nInstall the tool.\n\n<h2 id="step-1">Step</h2>\n\nConfigure the tool.',
  );
  expect(stable['/articles/revision/'].map(({ id }) => id)).toEqual(['step', 'step-1']);
  expect(comparePublishedFragments(previous, stable)).toEqual([]);
  const stableReordered = inventory(
    '<h2 id="step-1">Step</h2>\n\nConfigure the tool.\n\n<h2 id="step">Step</h2>\n\nInstall the tool.',
  );
  expect(comparePublishedFragments(previous, stableReordered)).toEqual([]);
});

it('preserves Japanese and existing authored anchors with encoded diagnostics', () => {
  const previous = inventory('<span id="旧参照"></span>\n\n## 日本語の見出し');
  expect(comparePublishedFragments(previous, inventory('## 新しい見出し'))).toEqual([
    '/articles/revision/#%E6%97%A7%E5%8F%82%E7%85%A7: published fragment removed (content/articles/revision/index.md)',
    '/articles/revision/#%E6%97%A5%E6%9C%AC%E8%AA%9E%E3%81%AE%E8%A6%8B%E5%87%BA%E3%81%97: published fragment removed (content/articles/revision/index.md)',
  ]);
});

it('places an alias inside its intended canonical section without duplicate TOC/search headings', async () => {
  const content = '<span id="installation" data-fragment-alias-for="setup"></span>\n\n## Setup\n\nInstall the tool.';
  expect(comparePublishedFragments(inventory('## Installation'), inventory(content))).toEqual([]);
  const rendered = await renderContent(source(content));
  expect(rendered.html).toContain('<h2 id="setup"');
  expect(rendered.html).toMatch(
    /<h2[^>]*><span id="installation" data-fragment-alias-for="setup" aria-hidden="true"><\/span>Setup/,
  );
  expect(rendered.tableOfContents).toEqual([{ id: 'setup', level: 2, title: 'Setup' }]);
  expect((await renderSearchDocuments(source(content))).map(({ id }) => id)).toEqual([
    '/articles/revision/',
    '/articles/revision/#setup',
  ]);
});

describe('invalid fragment contracts', () => {
  it.each([
    '<h2 id="same">One</h2><h2 id="same">Two</h2>',
    '<span id="setup"></span>\n\n## Setup',
    '<span id="old" data-fragment-alias-for="missing"></span>\n\n## Setup',
    '<span id="old" data-fragment-alias-for="body"></span><p id="body">Body</p>',
    '<span id="old" data-fragment-alias-for="setup">Wrong content</span>\n\n## Setup',
    '<h2 id="bad id">Invalid</h2>',
  ])('rejects %s with source diagnostics', (content) => {
    expect(() => parseContentTree(source(content))).toThrow();
  });
});
