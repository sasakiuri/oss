// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { lintMarkdown, lintMarkdownDirectory } from '../../scripts/lint-markdown';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('Markdown reference lint', () => {
  it.each(['[資料][missing]', '[missing][]', '[missing]', '![写真][missing]', '本文[^missing]'])(
    'rejects an undefined reference: %s',
    async (markdown) => {
      const file = await lintMarkdown(`---\ntitle: Test\n---\n\n${markdown}\n`, 'article.md');
      expect(file.messages).toEqual([expect.objectContaining({ ruleId: 'no-undefined-references', line: 5 })]);
    },
  );

  it.each([
    '[source]: https://example.com/first\n[SOURCE]: https://example.com/second\n',
    '[^note]: first\n\n[^note]: second\n',
  ])('rejects duplicate link and footnote definitions', async (markdown) => {
    const file = await lintMarkdown(markdown, 'article.md');
    expect(file.messages).toEqual([expect.objectContaining({ ruleId: 'no-duplicate-definitions' })]);
  });

  it('accepts frontmatter, GFM tables, tasks, footnotes, math, alerts and literal brackets', async () => {
    const file = await lintMarkdown(
      [
        '---',
        'title: "[not a link]"',
        'tags: [one, two]',
        '---',
        '',
        '| 資料 | 注記 |',
        '| --- | --- |',
        '| [資料][source] | 本文[^note] |',
        '',
        '- [x] 確認済み',
        '',
        '> [!NOTE]',
        '> 注記。',
        '',
        '本文 \\[図 1] \\[※1] と [\\[資料\\]](https://example.com/)。',
        '',
        '式 $x = [a,b]$。',
        '',
        '$$',
        'x = [a,b]',
        '$$',
        '',
        '`[example][not-defined]`',
        '',
        '```md',
        '[example][not-defined]',
        '```',
        '',
        '[source]: https://example.com/',
        '[^note]: 注記。',
      ].join('\n'),
      'article.md',
    );
    expect(file.messages).toEqual([]);
  });

  it('supports explicit remark-lint exceptions without suppressing following references', async () => {
    const file = await lintMarkdown(
      '<!--lint ignore no-undefined-references-->\n\n[example][allowed]\n\n[broken][missing]\n',
      'article.md',
    );
    expect(file.messages).toEqual([expect.objectContaining({ ruleId: 'no-undefined-references', line: 5 })]);
  });

  it('parses directive labels and checks references inside their Markdown bodies', async () => {
    const valid = await lintMarkdown(
      ':::details[資料の詳細]{open}\n[資料][source]\n:::\n\n[source]: document.pdf\n',
      'article.md',
    );
    expect(valid.messages).toEqual([]);
    const invalid = await lintMarkdown(':::details[詳細]\n[資料][missing]\n:::\n', 'article.md');
    expect(invalid.messages).toEqual([expect.objectContaining({ ruleId: 'no-undefined-references', line: 2 })]);
  });

  it('reports directive errors with original file positions and continues checking following blocks', async () => {
    const file = await lintMarkdown(
      '---\ntitle: Test\n---\n\n:::unknown[Label]\nBody\n:::\n\n:::details[Label]{style="display:none"}\nBody\n:::\n',
      'article.md',
    );
    expect(file.messages).toEqual([
      expect.objectContaining({ ruleId: 'invalid-directive', line: 5, file: 'article.md' }),
      expect.objectContaining({ ruleId: 'invalid-directive', line: 9, file: 'article.md' }),
    ]);
  });

  it('checks nested Markdown files and exits nonzero for broken references', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'knowledge-markdown-'));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, 'article'));
    await writeFile(path.join(directory, 'article/index.md'), '[broken][missing]\n');
    await writeFile(path.join(directory, 'image.svg'), '[not Markdown][ignored]');

    const files = await lintMarkdownDirectory(directory);
    expect(files).toHaveLength(1);
    expect(files[0].messages[0].ruleId).toBe('no-undefined-references');

    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', path.resolve(__dirname, '../../scripts/lint-markdown.ts'), directory],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('article/index.md:1:1 no-undefined-references:');

    await writeFile(path.join(directory, 'article/index.md'), '[working](https://example.com/)\n');
    const passing = spawnSync(
      process.execPath,
      ['--import', 'tsx', path.resolve(__dirname, '../../scripts/lint-markdown.ts'), directory],
      { encoding: 'utf8' },
    );
    expect(passing.status).toBe(0);
    expect(passing.stdout).toContain('Checked 1 Markdown files; 0 reference problems.');
  }, 15_000);
});
