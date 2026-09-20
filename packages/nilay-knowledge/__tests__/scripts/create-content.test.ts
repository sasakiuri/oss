import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import matter from 'gray-matter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createContent } from '../../scripts/create-content';

let contentRoot: string;

beforeEach(() => {
  contentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nilay-create-content-'));
});

afterEach(() => {
  fs.rmSync(contentRoot, { recursive: true, force: true });
});

describe('createContent', () => {
  it('creates an article with a Unix-second slug and the existing template', () => {
    const result = createContent({ type: 'articles', contentRoot, now: new Date(1_700_000_000_123) });
    const { data, content } = matter(fs.readFileSync(result.filePath, 'utf8'));

    expect(result.slug).toBe('1700000000');
    expect(result.filePath).toBe(path.join(contentRoot, 'articles', '1700000000', 'index.md'));
    expect(data).toEqual({ title: '新しい記事', published: '2023-11-14T22:13:20.123Z', tags: [] });
    expect(content).toContain('ここに記事の内容を書いてください。');
  });

  it('creates news with a local calendar-date slug and the existing template', () => {
    const now = new Date(2026, 8, 21, 0, 15, 30);
    const result = createContent({ type: 'news', contentRoot, now });
    const { data, content } = matter(fs.readFileSync(result.filePath, 'utf8'));

    expect(result.slug).toBe('20260921');
    expect(result.filePath).toBe(path.join(contentRoot, 'news', '20260921', 'index.md'));
    expect(data.title).toBe('新しいニュース');
    expect(new Date(data.published).getTime()).toBe(now.getTime());
    expect(content).toContain('ここにニュースの内容を書いてください。');
  });

  it.each(['articles', 'news'] as const)('preserves quoted, multiline titles in %s frontmatter', (type) => {
    const title = '引用 "タイトル" と \\パス\n---\n次の行: 値 # コメントではない';
    const result = createContent({ type, contentRoot, title, now: new Date('2026-09-21T00:15:30.123+05:30') });
    const { data } = matter(fs.readFileSync(result.filePath, 'utf8'));

    expect(data).toEqual({ title, published: '2026-09-20T18:45:30.123Z', tags: [] });
  });

  it.each(['articles', 'news'] as const)('uses suffixes and preserves existing %s files on collisions', (type) => {
    const now = new Date(1_700_000_000_123);
    const first = createContent({ type, contentRoot, now, title: '最初' });
    const second = createContent({ type, contentRoot, now, title: '次' });
    const third = createContent({ type, contentRoot, now, title: '最後' });

    expect(second.slug).toBe(`${first.slug}-1`);
    expect(third.slug).toBe(`${first.slug}-2`);
    expect(matter(fs.readFileSync(first.filePath, 'utf8')).data.title).toBe('最初');
    expect(matter(fs.readFileSync(second.filePath, 'utf8')).data.title).toBe('次');
    expect(matter(fs.readFileSync(third.filePath, 'utf8')).data.title).toBe('最後');
  });

  it('skips reserved directories and files without modifying them', () => {
    const articlesDirectory = path.join(contentRoot, 'articles');
    fs.mkdirSync(path.join(articlesDirectory, '1700000000'), { recursive: true });
    const existingFile = path.join(articlesDirectory, '1700000000-1');
    fs.writeFileSync(existingFile, 'existing');

    const result = createContent({ type: 'articles', contentRoot, now: new Date(1_700_000_000_123) });

    expect(result.slug).toBe('1700000000-2');
    expect(fs.readdirSync(path.join(articlesDirectory, '1700000000'))).toEqual([]);
    expect(fs.readFileSync(existingFile, 'utf8')).toBe('existing');
  });

  it('rejects invalid timestamps before creating content', () => {
    expect(() => createContent({ type: 'articles', contentRoot, now: new Date('invalid') })).toThrow(RangeError);
    expect(fs.readdirSync(contentRoot)).toEqual([]);
  });

  it('reports filesystem errors instead of retrying them as slug collisions', () => {
    fs.writeFileSync(path.join(contentRoot, 'articles'), 'existing');

    expect(() => createContent({ type: 'articles', contentRoot })).toThrow();
    expect(fs.readFileSync(path.join(contentRoot, 'articles'), 'utf8')).toBe('existing');
  });

  it.each([
    { script: 'new-article.ts', type: 'articles' },
    { script: 'new-news.ts', type: 'news' },
  ])('runs $script independently of the working directory', ({ script, type }) => {
    const packageDirectory = path.join(contentRoot, 'package');
    const scriptsDirectory = path.join(packageDirectory, 'scripts');
    const workingDirectory = path.join(contentRoot, 'unrelated');
    fs.mkdirSync(scriptsDirectory, { recursive: true });
    fs.mkdirSync(workingDirectory);
    for (const filename of ['create-content.ts', script]) {
      fs.copyFileSync(path.resolve(__dirname, '../../scripts', filename), path.join(scriptsDirectory, filename));
    }

    const output = execFileSync(
      process.execPath,
      [
        '--import',
        createRequire(__filename).resolve('tsx'),
        path.join(scriptsDirectory, script),
        'CLI "タイトル"\n次の行',
      ],
      { cwd: workingDirectory, encoding: 'utf8' },
    );
    const collectionDirectory = path.join(packageDirectory, 'content', type);
    const slugs = fs.readdirSync(collectionDirectory);

    expect(slugs).toHaveLength(1);
    expect(output).toBe(`Created: content/${type}/${slugs[0]}/index.md\n`);
    expect(matter(fs.readFileSync(path.join(collectionDirectory, slugs[0]!, 'index.md'), 'utf8')).data.title).toBe(
      'CLI "タイトル"\n次の行',
    );
    expect(fs.readdirSync(workingDirectory)).toEqual([]);
  });
});
