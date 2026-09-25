import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/load-development');
});

test('opens on an example series and says the flat stretch is not shown at this count', async ({ page }) => {
  await expect(page).toHaveTitle(/ロード開発（ラダーテスト）の解析/);
  // Each stretch carries its own verdict: the velocity one and the impact one.
  const velocity = page.getByText('平均初速の差が 5 m/s 以内の段').locator('..');
  const impacts = page.getByText('着弾の高さの中心の差が 5 mm 以内の段').locator('..');
  await expect(velocity).toContainText('40.3 gr 〜 41.2 gr');
  await expect(velocity).toContainText('この発数では小さいとは言えません');
  await expect(impacts).toContainText('40.3 gr 〜 41.2 gr');
  await expect(impacts).toContainText('この発数では小さいとは言えません');
  const row = page
    .getByRole('table', { name: '隣り合う段の初速の差' })
    .getByRole('row', { name: /^40\.6 gr → 40\.9 gr/ });
  await expect(row).toContainText('この発数では判断できない');
});

test('keeps an added step after a reload', async ({ page }) => {
  await page.getByRole('button', { name: '段を追加' }).click();
  await page.getByLabel('段 7の初速', { exact: false }).fill('821\n824');
  await page.reload();
  await expect(page.getByLabel('段 7の初速', { exact: false })).toHaveValue('821\n824');
});

test('shows the provisions it quotes', async ({ page }) => {
  await page.getByRole('button', { name: /^実包を自ら製造することと法令/ }).click();
  await expect(page.getByText('一日につき実包又は空包百個以下', { exact: false }).first()).toBeVisible();
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});
