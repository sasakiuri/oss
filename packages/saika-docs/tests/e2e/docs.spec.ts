// SPDX-License-Identifier: MIT
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('reads documents and follows nested links', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Saika Docs');
  await page.locator('main').getByRole('link', { name: '導入と接続', exact: true }).click();
  await expect(page).toHaveURL(/\/getting-started\/$/);
  await page.locator('[data-diagram-source]').first().scrollIntoViewIfNeeded();
  await expect(page.locator('.mermaid svg')).toHaveCount(1);
  await page.goto('/lane/devices/kohto/bpt216/');
  await page.locator('main').getByRole('link', { name: 'JRSF_BP_10M', exact: true }).click();
  await expect(page).toHaveURL(/\/common\/target-spec\/#/);
  await expect(page.locator('main h1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('searches Japanese text and closes with Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '文書を検索', exact: true }).click();
  await page.getByLabel('検索キーワード').fill('射座');
  const results = page.getByRole('list', { name: '検索結果' }).getByRole('link');
  await expect(results.first()).toBeVisible();
  await results.first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main h1')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('changes theme and keeps all diagrams visible', async ({ page }) => {
  await page.goto('/lane/spec/');
  const diagramCount = await page.locator('[data-diagram-source]').count();
  expect(diagramCount).toBeGreaterThan(0);
  for (const figure of await page.locator('[data-diagram-source]').all()) {
    await figure.scrollIntoViewIfNeeded();
    await expect(figure.locator('svg')).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.locator('.mermaid svg')).toHaveCount(diagramCount);
  await page.getByRole('button', { name: 'テーマを切り替え' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  for (const figure of await page.locator('[data-diagram-source]').all()) {
    await figure.scrollIntoViewIfNeeded();
    await expect(figure.locator('svg')).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.locator('.mermaid svg')).toHaveCount(diagramCount);
});

for (const theme of ['light', 'dark'] as const) {
  test(`keeps diagram labels readable and fits printed pages in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const path of ['/getting-started/', '/lane/spec/']) {
      await page.goto(path);
      const figure = page.locator('[data-diagram-source]').first();
      await figure.scrollIntoViewIfNeeded();
      await expect(figure).toHaveAttribute('data-diagram-state', 'ready');
      const labels = figure.locator('.node .label');
      expect(await labels.count()).toBeGreaterThan(0);
      const labelHeights = await labels.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height),
      );
      expect(Math.min(...labelHeights)).toBeGreaterThanOrEqual(12);
      const clippedLabels = await labels.evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const label = node.getBoundingClientRect();
            const svg = node.closest('svg')!.getBoundingClientRect();
            return (
              label.left < svg.left - 1 ||
              label.right > svg.right + 1 ||
              label.top < svg.top - 1 ||
              label.bottom > svg.bottom + 1
            );
          })
          .map((node) => node.textContent),
      );
      expect(clippedLabels).toEqual([]);
      expect(await figure.locator('svg').evaluate((node) => node.getBoundingClientRect().width)).toBeLessThan(4000);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (await figure.evaluate((node) => node.scrollWidth > node.clientWidth)) {
        await figure.focus();
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => figure.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
      await page.emulateMedia({ media: 'print' });
      expect(
        await figure.evaluate((node) => node.querySelector('svg')!.getBoundingClientRect().width <= node.clientWidth),
      ).toBe(true);
      await page.emulateMedia({ media: 'screen' });
    }
  });
}

test('provides a mobile menu and useful 404', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    await page.getByRole('button', { name: '文書メニューを開く' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Lane 操作ガイド', exact: true }).click();
    await expect(page.locator('main h1')).toContainText('Lane 操作ガイド');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const response = await page.goto('/missing-document/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
});

test('@a11y supports accessible reading and search', async ({ page }) => {
  await page.goto('/');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: '文書を検索', exact: true }).click();
  await page.getByLabel('検索キーワード').fill('射座');
  await expect(page.getByRole('list', { name: '検索結果' }).getByRole('link').first()).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('@visual home page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page).toHaveScreenshot('home.png', { fullPage: true, animations: 'disabled' });
});

for (const path of [
  '/getting-started/',
  '/common/target-spec/',
  '/lane/spec/',
  '/lane/devices/disag/reddot/',
  '/reference/',
  '/reference/material/',
]) {
  test(`@a11y reads ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('main h1').first()).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual(
      [],
    );
  });
}
test('restores filters and supports form, tabs and history keyboard interactions', async ({ page }) => {
  await page.goto('/reference/?q=Lane&page=2&sort=desc');
  if (await page.getByRole('button', { name: '検索条件', exact: true }).isVisible()) {
    await page.getByRole('button', { name: '検索条件', exact: true }).click();
    await expect(page.getByLabel('文書名で検索').filter({ visible: true })).toHaveValue('Lane');
    await page.keyboard.press('Escape');
  } else await expect(page.getByLabel('文書名で検索').filter({ visible: true })).toHaveValue('Lane');
  await page.getByRole('textbox', { name: '名前' }).fill('Saika');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('入力を受け付けました。この例ではサーバーに保存しません。')).toBeVisible();
  await page.getByRole('button', { name: '履歴を見る' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '履歴を見る' })).toBeFocused();
  await page.getByRole('tab', { name: 'エラー', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('通信に失敗');
});
test('serves metadata, assets and security headers', async ({ page, request }) => {
  const response = await page.goto('/getting-started/');
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  expect(response?.headers()['content-security-policy']).toContain("object-src 'none'");
  expect(response?.headers()['x-powered-by']).toBeUndefined();
  expect(response?.headers()['strict-transport-security']).toBeUndefined();
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /\/getting-started\/$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\.png$/);
  expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThan(0);
  expect((await request.get('/api/health/')).status()).toBe(200);
  expect((await request.get('/api/catalog/')).status()).toBe(200);
  expect((await request.get('/manifest.webmanifest')).status()).toBe(200);
  expect((await request.get('/opengraph-image.png')).status()).toBe(200);
});
test('renders the DOT diagram in a worker', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/reference/');
  const figure = page.locator('[data-diagram-source^="digraph"]');
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toHaveAttribute('data-diagram-state', 'ready', { timeout: 15_000 });
  await expect(figure.locator('svg')).toBeVisible();
  expect(errors).toEqual([]);
});
test('keeps the documentation route within its JavaScript transfer budget', async ({ page }) => {
  let javascriptBytes = 0;
  page.on('response', async (response) => {
    if (response.request().resourceType() === 'script') javascriptBytes += (await response.body()).length;
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  expect(javascriptBytes).toBeLessThan(1_500_000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('@visual documentation in dark mode', async ({ page }) => {
  await page.goto('/getting-started/');
  await page.getByRole('button', { name: 'テーマを切り替え' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.locator('[data-diagram-source]').first().scrollIntoViewIfNeeded();
  await expect(page.locator('.mermaid svg')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page).toHaveScreenshot('manual-dark.png', { fullPage: true, animations: 'disabled' });
});
