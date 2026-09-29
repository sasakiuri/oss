// @vitest-environment node
// cspell:ignore udpated descripton catagory rewiew
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseFrontmatter } from '@/lib/content/frontmatter';
import { createContentRepository } from '@/lib/content/repository';
import { checkFrontmatterKeys } from '@/scripts/frontmatter-keys';

const metadata = { title: 'Example', published: '2026-01-01', tags: [] };
const source = 'content/articles/example/index.md';
let directory: string;
let filename: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'knowledge-frontmatter-'));
  filename = path.join(directory, 'articles/example/index.md');
  await mkdir(path.dirname(filename), { recursive: true });
  await mkdir(path.join(directory, 'news'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function fixture(extra = ''): string {
  return `---\ntitle: Example\npublished: '2026-01-01'\ntags: []\n${extra}---\nBody\n`;
}

function checkDirectory() {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/article-taxonomy.ts', '--check', '--content-dir', directory],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 10_000 },
  );
}

describe('frontmatter authoring key policy', () => {
  it.each(['udpated', 'descripton', 'catagory', 'rewiew', 'extra', 'x-', 'X-owner', 'x_owner'])(
    'reports the exact filename and unknown key %s without changing runtime stripping',
    (key) => {
      const input = { ...metadata, [key]: '2026-09-29' };
      expect(() => checkFrontmatterKeys(input, source)).toThrow(`${source}: unknown frontmatter key "${key}"`);
      expect(parseFrontmatter(input, source)).toEqual(metadata);
      expect(input[key]).toBe('2026-09-29');
    },
  );

  it('lists all unknown keys deterministically and quotes unusual keys safely', () => {
    expect(() => checkFrontmatterKeys({ zzz: true, 'a"b': true, ...metadata }, source)).toThrow(
      `${source}: unknown frontmatter key "a\\"b"; use a documented field or an x- extension\n${source}: unknown frontmatter key "zzz"; use a documented field or an x- extension`,
    );
  });

  it('accepts all supported fields and explicitly namespaced custom metadata without exposing it at runtime', () => {
    const input = {
      ...metadata,
      description: 'Description',
      category: 'procedures',
      updated: '2026-02-01',
      image: 'image.png',
      review: {
        checked: '2026-02-01',
        region: 'Example region',
        scope: 'Example scope',
        sources: [{ title: 'Evidence', url: 'https://example.com/source' }],
      },
      'x-editorial-owner': 'Example',
      'x-build-data': { private: true },
    };
    expect(() => checkFrontmatterKeys(input, source)).not.toThrow();
    const parsed = parseFrontmatter(input, source);
    expect(parsed.updated).toBe(input.updated);
    expect(parsed.review).toEqual(input.review);
    expect(parsed).not.toHaveProperty('x-editorial-owner');
    expect(parsed).not.toHaveProperty('x-build-data');
  });

  it.each([null, [], 'text', 42])('leaves non-mapping validation to the existing schema: %j', (input) => {
    expect(() => checkFrontmatterKeys(input, source)).not.toThrow();
    expect(() => parseFrontmatter(input, source)).toThrow('a mapping');
  });

  it.each([
    { published: '2026-02-30' },
    { tags: [''] },
    { category: 'unknown-category' },
    { updated: '2025-01-01' },
    { review: { checked: '2026-01-01', unknown: true } },
  ])('does not weaken supported-field validation: %j', (invalid) => {
    const input = { ...metadata, ...invalid };
    expect(() => checkFrontmatterKeys(input, source)).not.toThrow();
    expect(() => parseFrontmatter(input, source)).toThrow();
  });

  it('checks original YAML keys at the repository authoring boundary while ordinary reads stay compatible', async () => {
    await writeFile(filename, fixture("udpated: '2026-09-29'\n"));
    const runtime = createContentRepository(directory);
    expect((await runtime.read('articles', 'example'))?.frontmatter).toEqual(metadata);
    const authoring = createContentRepository(directory, { validateFrontmatter: checkFrontmatterKeys });
    await expect(authoring.read('articles', 'example')).rejects.toThrow(
      `${filename}: unknown frontmatter key "udpated"`,
    );
  });

  it('accepts empty collections without inventing entries', () => {
    const result = checkDirectory();
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Validated metadata for 0 entries.');
  });

  it('fails the CLI for a misspelled optional key and preserves the exact authored file', async () => {
    const bytes = fixture("udpated: '2026-09-29'\n");
    await writeFile(filename, bytes);
    const result = checkDirectory();
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${filename}: unknown frontmatter key "udpated"`);
    expect(result.stdout).not.toContain('Validated metadata');
    expect(await readFile(filename, 'utf8')).toBe(bytes);
  });

  it('passes the CLI for supported fields and namespaced extensions in articles and news', async () => {
    await writeFile(filename, fixture("updated: '2026-02-01'\nx-editorial-owner: Example\n"));
    const news = path.join(directory, 'news/example/index.md');
    await mkdir(path.dirname(news), { recursive: true });
    await writeFile(news, fixture('x-build-data:\n  status: draft\n'));
    const result = checkDirectory();
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Validated metadata for 2 entries.');
  });
});
