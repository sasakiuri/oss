// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createContentRepository } from '@/lib/content/repository';

let directory: string;
let repository: ReturnType<typeof createContentRepository>;

async function entry(slug: string, metadata = 'title: Test\npublished: "2024-01-01"\ntags: []') {
  const folder = path.join(directory, 'articles', slug);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'index.md'), `---\n${metadata}\n---\n\n## Body\n`);
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nilay-content-'));
  await mkdir(path.join(directory, 'articles'));
  repository = createContentRepository(directory);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('content repository', () => {
  it('lists valid entries in deterministic publication order without exposing bodies', async () => {
    await entry('older');
    await entry('newer-b', 'title: New\npublished: "2025-01-01"\ntags: [Example]');
    await entry('newer-a', 'title: New\npublished: "2025-01-01"\ntags: [Example]');
    await mkdir(path.join(directory, 'articles', 'assets'));
    await writeFile(path.join(directory, 'articles', 'README.md'), 'Ignore this');

    const list = await repository.list('articles');
    expect(list.map((item) => item.slug)).toEqual(['newer-a', 'newer-b', 'older']);
    expect(list.every((item) => !('html' in item) && !('content' in item))).toBe(true);
    expect(await repository.read('articles', 'older')).toMatchObject({
      slug: 'older',
      type: 'articles',
      content: '\n## Body\n',
      frontmatter: { title: 'Test', published: '2024-01-01', tags: [] },
    });
  });

  it('preserves unquoted YAML dates and optional metadata', async () => {
    await entry(
      'dated',
      'title: Test\npublished: 2024-01-01\nupdated: "2024-02-01T12:00:00+09:00"\ntags: []\nimage: cover.png',
    );
    expect((await repository.read('articles', 'dated'))?.frontmatter).toEqual({
      title: 'Test',
      published: '2024-01-01',
      updated: '2024-02-01T12:00:00+09:00',
      tags: [],
      image: 'cover.png',
    });
  });

  it('returns null only for missing entries and reports missing collection roots', async () => {
    expect(await repository.read('articles', 'missing')).toBeNull();
    await expect(repository.list('news')).rejects.toThrow(/ENOENT/);
    await mkdir(path.join(directory, 'articles', 'bad', 'index.md'), { recursive: true });
    await expect(repository.read('articles', 'bad')).rejects.toThrow(/EISDIR/);
    await expect(repository.list('articles')).rejects.toThrow(/must be a file/);
  });

  it.each(['../news/entry', '/etc/passwd', '..', 'one/two', 'one\\two', '%2e%2e', ''])(
    'rejects non-segment slug %j',
    async (slug) => {
      await expect(repository.read('articles', slug)).rejects.toThrow('Invalid content slug');
    },
  );

  it.each([
    ['title: 123\npublished: "2024-01-01"\ntags: []', 'title'],
    ['title: Test\npublished: "2024-02-30"\ntags: []', 'published'],
    ['title: Test\npublished: 2024-02-30\ntags: []', 'published'],
    ['title: Test\npublished: 2024-13-01\ntags: []', 'published'],
    ['title: Test\npublished: "2024-01-01T24:00:00Z"\ntags: []', 'published'],
    ['title: Test\npublished: "2024-01-01T12:00:00"\ntags: []', 'published'],
    ['title: Test\npublished: "invalid"\ntags: []', 'published'],
    ['title: Test\npublished: "2024-01-01"\ntags: example', 'tags'],
    ['title: Test\npublished: "2024-01-01"\ntags: [123]', 'tags'],
    ['title: Test\npublished: "2024-01-01"\ntags: []\nupdated: false', 'updated'],
    ['title: Test\npublished: "2024-01-01"\ntags: []\nimage: []', 'image'],
  ])('rejects invalid metadata with its source and field (%s)', async (metadata, field) => {
    await entry('invalid', metadata);
    await expect(repository.read('articles', 'invalid')).rejects.toThrow(`invalid/index.md: ${field}`);
    await expect(repository.list('articles')).rejects.toThrow(`invalid/index.md: ${field}`);
  });
});
