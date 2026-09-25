import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/ammo-purchase-plan');
});

test('totals the plan against the quantity applied for and keeps it after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/火薬類の消費（購入）計画/);
  await page.getByLabel('譲受期間の初日').fill('2026-10-01');
  await page.getByLabel('譲受期間の末日').fill('2027-09-30');
  await page.getByLabel('実包（申請数量）').fill('200');
  await page.getByRole('button', { name: '予定を追加' }).click();
  await page.getByRole('spinbutton', { name: '数量 (個)', exact: true }).fill('150');
  await expect(page.getByText('計画の合計と申請数量が違う種類があります。')).toBeVisible();
  await page.getByRole('spinbutton', { name: '数量 (個)', exact: true }).fill('200');
  await expect(page.getByRole('cell', { name: '一致' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: '数量 (個)', exact: true })).toHaveValue('200');
});

test('rejects an acquisition period of more than one year', async ({ page }) => {
  await page.getByLabel('譲受期間の初日').fill('2026-10-01');
  await page.getByLabel('譲受期間の末日').fill('2027-10-01');
  await expect(page.getByText('譲受期間は 1 年を超えないこと（様式第 2 号 備考 3）。')).toBeVisible();
});
