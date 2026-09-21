// @vitest-environment node
import path from 'node:path';

import { createLinter, loadTextlintrc } from 'textlint';
import { beforeAll, expect, it } from 'vitest';

let linter: ReturnType<typeof createLinter>;

beforeAll(async () => {
  const descriptor = await loadTextlintrc({
    configFilePath: path.resolve(__dirname, '../../.textlintrc.json'),
  });
  linter = createLinter({ descriptor });
});

it.each([
  ['本文はは確認済みです。', 'ja-no-successive-word'],
  ['対応でｋない。', 'ja-unnatural-alphabet'],
  ['「閉じられていません。', 'no-unmatched-pair'],
  ['本文\u200bです。', 'no-zero-width-spaces'],
])('detects concrete editorial mistakes: %s', async (markdown, rule) => {
  const result = await linter.lintText(markdown, 'article.md');
  expect(result.messages).toEqual(
    expect.arrayContaining([expect.objectContaining({ ruleId: `ja-technical-writing/${rule}` })]),
  );
});

it('preserves quotations and linked titles while checking the following authored paragraph', async () => {
  const result = await linter.lintText(
    '> 本文はは引用です。\n\n[本文はは引用です。](https://example.com/)\n\n本文はは確認済みです。',
    'article.md',
  );
  expect(result.messages).toEqual([
    expect.objectContaining({ ruleId: 'ja-technical-writing/ja-no-successive-word', line: 5 }),
  ]);
});

it('allows a documented quote exception and resumes checking after it', async () => {
  const result = await linter.lintText(
    [
      '<!-- textlint-disable ja-technical-writing/no-hankaku-kana -->',
      '',
      '引用の記号は(ｱ)です。',
      '',
      '<!-- textlint-enable ja-technical-writing/no-hankaku-kana -->',
      '',
      '本文の記号は(ｱ)です。',
    ].join('\n'),
    'article.md',
  );
  expect(result.messages).toEqual([
    expect.objectContaining({ ruleId: 'ja-technical-writing/no-hankaku-kana', line: 7 }),
  ]);
});

it('allows legal terminology and qualified language used by the articles', async () => {
  const result = await linter.lintText(
    '銃砲刀剣類所持等取締法施行規則についての解釈は変わるかもしれません。',
    'article.md',
  );
  expect(result.messages).toEqual([]);
});
