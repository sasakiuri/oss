import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/electric-fence');
});

const results = (page: import('@playwright/test').Page) => page.getByRole('region', { name: '計算結果' });

test('counts the default Tottori fence and keeps changes after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/電気柵の設計計算/);
  // Six rows round 200 m with posts every 3 m, four corners and a gate: 1,200 m of wire,
  // ceil(200 / 3) + (4 + 2 − 1) = 72 posts, (72 + 4) × 6 = 456 insulators.
  await expect(results(page)).toContainText('1,200');
  await expect(results(page)).toContainText('72');
  await expect(results(page)).toContainText('456');
  await page.getByLabel('外周長').fill('120');
  await expect(results(page)).toContainText('720');
  await page.reload();
  await expect(page.getByLabel('外周長')).toHaveValue('120');
  await expect(results(page)).toContainText('720');
});

test('switches source and species, and asks for rows where a source gives none', async ({ page }) => {
  await page.getByLabel('対象の獣種').selectOption('boar');
  // Exact: an inspection item's label mentions 出典 in passing, but only the select is named 出典.
  await page.getByLabel('出典', { exact: true }).selectOption('kyoto-boar');
  await expect(page.getByRole('spinbutton', { name: /^2 段目/ })).toHaveValue('40');
  await page.getByLabel('対象の獣種').selectOption('monkey');
  await expect(page.getByText('この出典は段の高さを数値で示していません', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '段を追加' }).click();
  await expect(page.getByRole('spinbutton', { name: /^1 段目/ })).toBeVisible();
});

test('shows the legal requirements and ticks the inspection list', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '電気さくの法令要件' })).toBeVisible();
  await expect(page.getByText('定格感度電流 15 mA 以下', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /効かないときの点検/ }).click();
  await page.getByLabel(/電圧計で柵線の電圧を測った/).check();
  await expect(page.getByRole('button', { name: /効かないときの点検/ })).toContainText('1 項目を確認済み');
});

test('resets to the defaults', async ({ page }) => {
  await page.getByLabel('外周長').fill('50');
  await page.getByRole('button', { name: '入力を初期値に戻す' }).click();
  await page.getByRole('button', { name: '初期値に戻す', exact: true }).click();
  await expect(page.getByLabel('外周長')).toHaveValue('200');
});
