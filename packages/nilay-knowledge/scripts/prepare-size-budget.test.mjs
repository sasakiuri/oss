import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { collectInitialAssets, prepareSizeBudget } from './prepare-size-budget.mjs';

const limits = { javascript: '330 kB', stylesheet: '20 kB', searchIndex: '125 kB', pdfIndex: '800 kB' };
const html = '<link rel="stylesheet" href="/_next/static/app.css"><script src="/_next/static/app.js"></script>';

async function fixture(t) {
  const rootDir = await mkdtemp(join(tmpdir(), 'knowledge-size-budget-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const files = {
    '.next/BUILD_ID': 'production-build',
    '.next/server/app/index.html': html,
    '.next/server/app/articles/example.html': html,
    '.next/static/app.js': 'console.log("initial app")',
    '.next/static/app.css': 'body { color: black; }',
    '.next/static/mermaid-lazy.js': 'This unreferenced lazy chunk is excluded from initial budgets.',
    '.next/server/app/search-index.json.body': '{"documents":[]}',
    '.next/server/app/pdf-search-index.json.body': '{"documents":[]}',
  };
  for (const [file, content] of Object.entries(files)) {
    const target = join(rootDir, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return rootDir;
}

test('extracts initial JS and CSS once, including preloads and public styles, and ignores lazy or external assets', () => {
  const assets = collectInitialAssets(
    `<!doctype html>
      <link href='/_next/static/app.js?v=1&amp;build=2' as=script rel=preload>
      <link rel=modulepreload href="/_next/static/module.js#chunk">
      <link href="/_next/static/app.css?build=2" rel="stylesheet">
      <link rel="preload" as="style" href="/content-styles/katex.min.css">
      <link rel="stylesheet" href="/content-styles/katex.min.css">
      <link rel="prefetch" as="script" href="/_next/static/mermaid-lazy.js">
      <link rel="preload" as="image" href="/image.png">
      <script src="/_next/static/app.js?v=1"></script>
      <script src="https://external.example/analytics.js"></script>
      <script>const example = '<link rel="stylesheet" href="/not-real.css">';</script>
      <!-- <script src="/not-real.js"></script> -->`,
    '/workspace',
  );
  assert.deepEqual(assets, {
    javascript: ['.next/static/app.js', '.next/static/module.js'],
    stylesheet: ['.next/static/app.css', 'public/content-styles/katex.min.css'],
  });
});

test('resolves relative asset URLs against their route', () => {
  assert.deepEqual(
    collectInitialAssets('<script src="../../custom.js"></script>', '/workspace', '/articles/example/'),
    {
      javascript: ['public/custom.js'],
      stylesheet: [],
    },
  );
});

test('uses one gzip check for each distinct initial asset set, while checking every static page', async (t) => {
  const rootDir = await fixture(t);
  await writeFile(join(rootDir, '.next/server/app/news.html'), `${html}<script src="/_next/static/news.js"></script>`);
  await writeFile(join(rootDir, '.next/static/news.js'), 'console.log("news")');

  const checks = await prepareSizeBudget({ rootDir, limits });
  const scriptChecks = checks.filter((check) => check.name.startsWith('Initial JS:'));
  assert.equal(scriptChecks.length, 2);
  assert.deepEqual(scriptChecks.map((check) => check.path).sort(), [
    ['.next/static/app.js'],
    ['.next/static/app.js', '.next/static/news.js'],
  ]);
  assert.equal(checks.filter((check) => check.name.startsWith('Initial CSS:')).length, 1);
  assert.ok(checks.every((check) => check.gzip && check.path.length > 0 && check.limit));
  assert.ok(checks.some((check) => check.name.includes('(+1 pages)')));
  assert.ok(checks.some((check) => check.path.includes('.next/server/app/search-index.json.body')));
  assert.ok(checks.some((check) => check.path.includes('.next/server/app/pdf-search-index.json.body')));
  assert.ok(checks.every((check) => !check.path.some((file) => file.includes('mermaid-lazy'))));
});

for (const file of [
  '.next/BUILD_ID',
  '.next/server/app/index.html',
  '.next/static/app.js',
  '.next/static/app.css',
  '.next/server/app/search-index.json.body',
  '.next/server/app/pdf-search-index.json.body',
]) {
  test(`fails explicitly when a required build input is missing: ${file}`, async (t) => {
    const rootDir = await fixture(t);
    await rm(join(rootDir, file));
    await assert.rejects(prepareSizeBudget({ rootDir, limits }), (error) => {
      assert.ok(error.message.includes(file));
      assert.match(error.message, /production build first/);
      return true;
    });
  });
}

test('rejects empty artifacts instead of passing a zero-byte budget', async (t) => {
  const rootDir = await fixture(t);
  await writeFile(join(rootDir, '.next/static/app.js'), '');
  await assert.rejects(prepareSizeBudget({ rootDir, limits }), /non-empty file: .next\/static\/app.js/);
});

test('fails when a page no longer contains identifiable initial scripts', async (t) => {
  const rootDir = await fixture(t);
  await writeFile(join(rootDir, '.next/server/app/articles/example.html'), '<h1>Missing script markup</h1>');
  await assert.rejects(prepareSizeBudget({ rootDir, limits }), /No initial JavaScript.*articles\/example.html/);
});

test('fails when the root page no longer contains identifiable initial CSS', async (t) => {
  const rootDir = await fixture(t);
  await writeFile(join(rootDir, '.next/server/app/index.html'), '<script src="/_next/static/app.js"></script>');
  await assert.rejects(prepareSizeBudget({ rootDir, limits }), /No initial CSS.*index.html/);
});
