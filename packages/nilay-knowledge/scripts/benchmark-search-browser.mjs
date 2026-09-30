import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const output = process.argv[3];
const repeats = Number(process.argv[4] ?? 3);
if (!Number.isSafeInteger(repeats) || repeats < 1) throw new Error('Repeat count must be a positive integer');
const cases = [
  ['所持許可', 'all', false],
  ['PDF 申請', 'articles', false],
  ['ＰＤＦ', 'all', false],
  ['所持許可 更新', 'articles', false],
  ['更新', 'news', false],
  ['銃砲所持許可申請書', 'pdf', false],
  ['申請', 'pdf', false],
  ['申請', 'pdf', true],
];
const dataset = {};
for (const kind of ['search', 'pdf-search']) {
  const documents = await (await fetch(new URL(`/${kind}-index.json`, base))).json();
  const core = documents.map(({ id, type, title, section, tags, text }) => ({ id, type, title, section, tags, text }));
  dataset[kind] = { sections: core.length, digest: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
}
const browser = await chromium.launch();
const samples = [];
try {
  for (const [query, scope, synthetic] of cases) {
    for (let repetition = 0; repetition < repeats; repetition += 1) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.searchMeasurements = [];
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
          constructor(...args) {
            super(...args);
            this.addEventListener('message', (event) => {
              const value = event.data?.value;
              if (value?.groups?.length)
                window.searchMeasurements.push({
                  receivedMs: performance.now(),
                  serializedMessageBytes: new TextEncoder().encode(JSON.stringify(value)).length,
                  initialExcerpts: value.groups.reduce((total, group) => total + group.matches.length, 0),
                  totalMatches: value.totalMatches,
                });
            });
          }
        };
      });
      if (synthetic)
        await page.route('**/pdf-search-index.json', (route) =>
          route.fulfill({
            json: Array.from({ length: 500 }, (_, index) => ({
              id: `/content/assets/synthetic.pdf#page=${index + 1}`,
              type: 'pdf',
              title: 'Synthetic PDF',
              section: `${index + 1}ページ`,
              tags: [],
              text: '所持許可 申請書 USB 接続 印刷'.repeat(50),
            })),
          }),
        );
      await page.goto(base);
      await page.getByRole('button', { name: '記事・ニュースを検索 Ctrl / ⌘ K' }).click();
      await page.getByRole('combobox', { name: '検索対象' }).selectOption(scope);
      await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent.includes('検索を準備'));
      const startedMs = await page.evaluate(() => performance.now());
      await page.getByRole('combobox', { name: '検索キーワード' }).fill(query);
      await page
        .locator('[data-search-group] a[cmdk-item]')
        .first()
        .waitFor({ timeout: 30000 })
        .catch(async (cause) => {
          throw new Error(
            `Search benchmark failed for ${JSON.stringify({ query, scope, synthetic })}: ${await page.locator('[role="status"]').allTextContents()}`,
            { cause },
          );
        });
      const firstResultMs = await page.evaluate((start) => performance.now() - start, startedMs);
      const messages = await page.evaluate(() => window.searchMeasurements);
      const group = page.locator('[data-search-group]').first();
      const toggle = group
        .locator('button')
        .filter({ hasText: /ほか.*一致箇所を表示/ })
        .first();
      if (await toggle.count()) {
        await toggle.click();
        // The bounded UI announces progress. The previous UI expands synchronously.
        await page.waitForFunction(() => !document.querySelector('[cmdk-list][aria-busy="true"]'));
      }
      const expandedDomElements = await group.locator('*').count();
      const expandedMatches = await group.locator('a[cmdk-item]:not([data-search-related])').count();
      samples.push({
        query,
        scope,
        synthetic,
        repetition,
        firstResultMs,
        initialResponse: messages[0] ?? null,
        expandedMatches,
        expandedDomElements,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const report = {
  environment: {
    node: process.version,
    browser: browser.version(),
    platform: process.platform,
    cpu: os.cpus()[0]?.model,
    viewport: '390x844',
    throttling: 'none',
  },
  base,
  dataset,
  samples,
};
if (output) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
