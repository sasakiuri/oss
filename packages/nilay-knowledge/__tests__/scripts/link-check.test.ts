// @vitest-environment node
// cspell:words aticles hhttps
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSitemap } from '../../lib/content/publication';
import { createContentRepository } from '../../lib/content/repository';
import { prepareLinkCheck } from '../../scripts/link-check';

const binary = process.env.LYCHEE_BIN || 'lychee';
const hasLychee = spawnSync(binary, ['--version']).status === 0;
let packageDirectory: string;

beforeEach(async () => {
  packageDirectory = await mkdtemp(path.join(os.tmpdir(), 'knowledge-links-'));
  await Promise.all(
    ['app/about', 'app/articles/[slug]', 'content/articles/example', 'content/news', 'public'].map((directory) =>
      mkdir(path.join(packageDirectory, directory), { recursive: true }),
    ),
  );
  await copyFile(path.resolve(__dirname, '../../lychee.toml'), path.join(packageDirectory, 'lychee.toml'));
  await writeFile(path.join(packageDirectory, 'app/about/page.tsx'), '');
  await writeFile(path.join(packageDirectory, 'app/articles/[slug]/page.tsx'), '');
  await writeFile(path.join(packageDirectory, 'content/articles/example/photo.png'), 'image');
});

afterEach(async () => {
  await rm(packageDirectory, { recursive: true, force: true });
});

async function prepare(content: string) {
  await writeFile(
    path.join(packageDirectory, 'content/articles/example/index.md'),
    `---\ntitle: Test\npublished: 2026-09-21\ntags: []\n---\n${content}`,
  );
  return prepareLinkCheck(packageDirectory);
}

it('uses rendered anchors, assets from the authored content tree and only existing page targets', async () => {
  const { siteDirectory } = await prepare('## 見出し\n\n![Photo](photo.png)');
  const html = await readFile(path.join(siteDirectory, 'articles/example/index.html'), 'utf8');
  expect(html).toContain('id="見出し"');
  expect(html).toContain('src="/content/articles/example/photo.png"');
  expect(await readFile(path.join(siteDirectory, 'content/articles/example/photo.png'), 'utf8')).toBe('image');
  await expect(readFile(path.join(siteDirectory, 'about/index.html'), 'utf8')).resolves.toContain('<!doctype html>');
  await expect(readFile(path.join(siteDirectory, 'articles/missing/index.html'))).rejects.toHaveProperty(
    'code',
    'ENOENT',
  );
});

async function writeArticle(slug: string, category: string) {
  const directory = path.join(packageDirectory, 'content/articles', slug);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'index.md'),
    `---\ntitle: ${slug}\npublished: 2026-09-21\ntags: []\ncategory: ${category}\n---\nArticle body`,
  );
}

async function categoryFixture() {
  const directory = path.join(packageDirectory, 'app/articles/category/[category]');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'page.tsx'), '');
  await Promise.all([
    writeArticle('procedure-a', 'procedures'),
    writeArticle('procedure-b', 'procedures'),
    writeArticle('equipment-a', 'equipment'),
    writeArticle('unclassified-a', 'uncategorized'),
    writeArticle('unclassified-b', 'uncategorized'),
    writeArticle('hunting-a', 'hunting'),
    writeArticle('hunting-b', 'hunting'),
  ]);
}

async function sitemapCategoryPaths() {
  const repository = createContentRepository(path.join(packageDirectory, 'content'));
  const sitemap = createSitemap(await repository.list('articles'));
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1]!).pathname)
    .filter((url) => url.startsWith('/articles/category/'));
}

it('registers only eligible category routes and keeps their inventory in step with the sitemap', async () => {
  await categoryFixture();
  const { siteDirectory, inputs } = await prepare('[Category guide](/articles/category/procedures/)');
  const categories = path.join(siteDirectory, 'articles/category');
  expect(await readdir(categories)).toEqual(['procedures']);
  expect(await sitemapCategoryPaths()).toEqual(['/articles/category/procedures/']);
  expect(await readFile(path.join(categories, 'procedures/index.html'), 'utf8')).toContain('<!doctype html>');
  expect(await readFile(path.join(siteDirectory, 'articles/example/index.html'), 'utf8')).toContain(
    'href="/articles/category/procedures/"',
  );
  // Placeholders are link destinations, not invented page bodies to audit.
  expect(await readFile(inputs, 'utf8')).not.toContain(path.join(categories, 'procedures/index.html'));

  await writeArticle('procedure-b', 'equipment');
  await prepare('[Category guide](/articles/category/equipment/)');
  expect(await readdir(categories)).toEqual(['equipment']);
  expect(await sitemapCategoryPaths()).toEqual(['/articles/category/equipment/']);
  await expect(readFile(path.join(categories, 'procedures/index.html'))).rejects.toHaveProperty('code', 'ENOENT');

  await rm(path.join(packageDirectory, 'content/articles/equipment-a'), { recursive: true });
  await prepare('No eligible category remains.');
  expect(await sitemapCategoryPaths()).toEqual([]);
  await expect(readFile(path.join(categories, 'equipment/index.html'))).rejects.toHaveProperty('code', 'ENOENT');
});

it.each(['unknown', 'uncategorized', 'equipment', 'hunting'])(
  'does not invent a landing page for the ineligible category %s',
  async (category) => {
    await categoryFixture();
    const { siteDirectory } = await prepare(`[Category](/articles/category/${category}/)`);
    await expect(
      readFile(path.join(siteDirectory, 'articles/category', category, 'index.html')),
    ).rejects.toHaveProperty('code', 'ENOENT');
  },
);

it('rejects malformed URL schemes that lychee otherwise excludes silently', async () => {
  await expect(prepare('[Broken](hhttps://example.com/path)')).rejects.toThrow(
    'Unsupported URL scheme in content/articles/example/index.md',
  );
});

it('checks review source links as rendered anchors outside the Markdown body', async () => {
  await writeFile(
    path.join(packageDirectory, 'content/articles/example/index.md'),
    `---
title: Test
published: 2026-09-21
tags: []
review:
  checked: 2026-09-22
  region: 全国
  scope: 制度の概要
  sources:
    - title: 公式資料
      url: https://example.com/reference?a=1&b=2
---
記事の本文
`,
  );
  const { siteDirectory } = await prepareLinkCheck(packageDirectory);
  const html = await readFile(path.join(siteDirectory, 'articles/example/index.html'), 'utf8');
  expect(html).toContain('href="https://example.com/reference?a=1&#x26;b=2">公式資料</a>');
});

it('does not treat code examples as malformed link attributes', async () => {
  await expect(prepare('Example: `href="hhttps://example.com"`')).resolves.toHaveProperty('inputs');
});

it('preserves code examples and data attributes while resolving protocol-relative links', async () => {
  const { siteDirectory } = await prepare(
    '`href="//example.com"`\n\n<span data-href="hhttps://example.com">Example</span>\n\n[Remote](//example.com)',
  );
  const html = await readFile(path.join(siteDirectory, 'articles/example/index.html'), 'utf8');
  expect(html).toContain('<code>href="//example.com"</code>');
  expect(html).toContain('data-href="hhttps://example.com"');
  expect(html).toContain('href="https://example.com"');
});

// The dedicated link workflow installs lychee; ordinary unit tests need no Rust binary.
describe.skipIf(!hasLychee)('lychee integration', () => {
  async function check(content: string) {
    const { config, inputs } = await prepare(content);
    return spawnSync(binary, ['--config', config, '--files-from', inputs, '--offline', '--format', 'json'], {
      encoding: 'utf8',
    });
  }

  it('accepts local routes, published assets and canonical article fragments', async () => {
    const result = await check(
      '## 見出し\n\n[About](/about/)\n\n![Photo](photo.png)\n\n[Article](https://knowledge.nilay.jp/articles/example/#見出し)\n\n[Remote](//example.com/photo)',
    );
    expect(result).toMatchObject({ status: 0 });
  });

  it('accepts an authored link to an eligible generated category', async () => {
    await categoryFixture();
    const result = await check('[Category guide](/articles/category/procedures/)');
    expect(result).toMatchObject({ status: 0 });
  });

  it.each(['unknown', 'uncategorized', 'equipment', 'hunting'])(
    'rejects a link to the ineligible category %s',
    async (category) => {
      await categoryFixture();
      const result = await check(`[Category](/articles/category/${category}/)`);
      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ errors: 1 });
    },
  );

  it.each([
    ['route', '[Missing](/articles/missing/)', 1],
    ['typo', '[Missing](/aticles/example/)', 1],
    // Images reference the original in both the zoom link and the image source.
    ['asset', '![Missing](missing.png)', 2],
    ['fragment', '[Missing](/articles/example/#missing)', 1],
  ] as const)('rejects a missing %s', async (_label, content, errors) => {
    const result = await check(content);
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ errors });
  });
});

it.each(['photo.png', 'https://example.com/cover.webp'])(
  'includes the metadata image %s in link-check inputs',
  async (image) => {
    await writeFile(
      path.join(packageDirectory, 'content/articles/example/index.md'),
      `---\ntitle: Test\npublished: 2026-09-21\ntags: []\nimage: ${image}\n---\nNo body images.`,
    );
    const { siteDirectory } = await prepareLinkCheck(packageDirectory);
    const html = await readFile(path.join(siteDirectory, 'articles/example/index.html'), 'utf8');
    expect(html).toContain(`src="${image === 'photo.png' ? '/content/articles/example/photo.png' : image}"`);
  },
);
