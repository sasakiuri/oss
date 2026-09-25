import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Browser storage is reached only through the shared modules, which keep a backup restore apart from
 * the tools, keep the tools read-only while a cut-short restore waits, and are what the backup reads:
 * `browserStorage` / `readStoredText` for localStorage, `createIndexedDb` (the photos) and the hunter
 * map's own database. A tool that used them itself would be left out of all three, as the capture
 * record's photos once were. An ESLint rule enforces it; these tests check the rule, and read the
 * source for any mention the rule could not see.
 */
const ALLOWED = [
  'lib/browser-storage.ts',
  'lib/indexed-db.ts',
  'lib/hunter-map-storage.ts',
  'lib/labs-restore-journal.ts',
  'app/(standalone)/labs/data/backup.ts',
  // The site's language setting, which is not Labs data.
  'store/language-store.ts',
];

const packageDirectory = join(__dirname, '../../..');

/** Every extension TypeScript builds here (tsconfig.json includes `.mts`) or a bundler takes as JavaScript. */
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (SOURCE.test(entry.name)) files.push(path);
  }
  return files;
}

// Any mention: a direct call, an alias, a destructuring, a bracket or a global.
const MENTION =
  /\b(localStorage|sessionStorage|indexedDB)\b|\[\s*['"`](localStorage|sessionStorage|indexedDB)['"`]\s*\]/;
// Words in comments and strings are not access; they are left out before the check.
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('browser storage', () => {
  it('is not mentioned in code outside the shared storage modules', () => {
    const found: string[] = [];
    for (const directory of ['app', 'lib', 'components', 'store', 'features'])
      for (const file of sourceFiles(join(packageDirectory, directory))) {
        const path = relative(packageDirectory, file).split(sep).join('/');
        if (ALLOWED.includes(path)) continue;
        const source = withoutComments(readFileSync(file, 'utf8'));
        if (MENTION.test(source)) found.push(path);
      }
    // The backup format names its localStorage part; that is a field of a file, not the browser's storage.
    expect(found.filter((path) => path !== 'lib/labs-backup.ts')).toEqual([]);
  });

  it('is refused by the lint rule in a tool, however it is reached', async () => {
    const eslint = new ESLint({ cwd: packageDirectory });
    const code = [
      'export function probe() {',
      '  const s = window.localStorage;',
      "  s.setItem('a', 'b');",
      '  const { sessionStorage: t } = window;',
      '  t.clear();',
      "  indexedDB.open('x');",
      "  return globalThis['indexedDB'];",
      '}',
      '',
    ].join('\n');
    const [result] = await eslint.lintText(code, { filePath: join(packageDirectory, 'lib/storage-probe.ts') });
    const restricted = result!.messages.filter((message) =>
      ['no-restricted-properties', 'no-restricted-globals'].includes(message.ruleId ?? ''),
    );
    expect(restricted.map((message) => message.line)).toEqual([2, 4, 6, 7]);
    for (const extension of ['mts', 'cts', 'jsx']) {
      const [other] = await eslint.lintText(code, {
        filePath: join(packageDirectory, `lib/storage-probe.${extension}`),
      });
      const found = other!.messages.filter((message) =>
        ['no-restricted-properties', 'no-restricted-globals'].includes(message.ruleId ?? ''),
      );
      expect({ extension, lines: found.map((message) => message.line) }).toEqual({ extension, lines: [2, 4, 6, 7] });
    }
    const [allowed] = await eslint.lintText(code, { filePath: join(packageDirectory, 'lib/browser-storage.ts') });
    expect(allowed!.messages.filter((message) => message.ruleId?.startsWith('no-restricted'))).toEqual([]);
  }, 60_000);
});
