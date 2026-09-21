// @vitest-environment node
// cspell:words aticles hhttps
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prepareLinkCheck } from '../../scripts/link-check';

const binary = process.env.LYCHEE_BIN || 'lychee';
const hasLychee = spawnSync(binary, ['--version']).status === 0;
let packageDirectory: string;

beforeEach(async () => {
  packageDirectory = await mkdtemp(path.join(os.tmpdir(), 'knowledge-links-'));
  await Promise.all(
    [
      'app/about',
      'app/articles/[slug]',
      'content/articles/example',
      'content/news',
      'public/content/articles/example',
    ].map((directory) => mkdir(path.join(packageDirectory, directory), { recursive: true })),
  );
  await copyFile(path.resolve(__dirname, '../../lychee.toml'), path.join(packageDirectory, 'lychee.toml'));
  await writeFile(path.join(packageDirectory, 'app/about/page.tsx'), '');
  await writeFile(path.join(packageDirectory, 'app/articles/[slug]/page.tsx'), '');
  await writeFile(path.join(packageDirectory, 'public/content/articles/example/photo.png'), 'image');
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

it('uses rendered anchors, actual public assets and only existing page targets', async () => {
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

it('rejects malformed URL schemes that lychee otherwise excludes silently', async () => {
  await expect(prepare('[Broken](hhttps://example.com/path)')).rejects.toThrow(
    'Unsupported URL scheme in content/articles/example/index.md',
  );
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

  it.each([
    ['route', '[Missing](/articles/missing/)'],
    ['typo', '[Missing](/aticles/example/)'],
    ['asset', '![Missing](missing.png)'],
    ['fragment', '[Missing](/articles/example/#missing)'],
  ])('rejects a missing %s', async (_label, content) => {
    const result = await check(content);
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ errors: 1 });
  });
});
