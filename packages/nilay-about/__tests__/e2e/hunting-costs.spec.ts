import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/hunting-costs');
});

test('totals one class 1 gun registration and keeps it after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/狩猟にかかる費用の計算/);
  // Registration 1,800 + tax 16,500 = 18,300; first year + 5,200; renewal year + 2,900.
  await expect(page.getByText('通常の年は 18,300 円、初年度は 23,500 円、更新年は 21,200 円。')).toBeAttached();
  await page.getByLabel(/道府県民税の所得割を納めなくてよい/).check();
  // Tax 11,000 instead of 16,500.
  await expect(page.getByText('通常の年は 12,800 円、初年度は 18,000 円、更新年は 15,700 円。')).toBeAttached();
  await page.reload();
  await expect(page.getByLabel(/道府県民税の所得割を納めなくてよい/)).toBeChecked();
});

test('adds a second prefecture with the half-rate relief', async ({ page }) => {
  await page.getByRole('button', { name: '都道府県を追加' }).click();
  await page.getByLabel('都道府県').nth(1).selectOption('長野県');
  await page.getByLabel('狩猟税の特例').nth(1).selectOption('half');
  // Second registration: 1,800 + 8,250.
  await expect(page.getByText('通常の年は 28,350 円、初年度は 33,550 円、更新年は 31,250 円。')).toBeAttached();
});

test('flags a registration for a licence that is not held', async ({ page }) => {
  await page.getByLabel('わな猟', { exact: true }).first().check();
  await page.getByLabel('わな猟', { exact: true }).first().uncheck();
  await page.getByLabel('第一種銃猟', { exact: true }).first().uncheck();
  await expect(page.getByText('東京都：登録する免許の種類を選んでください。')).toBeVisible();
});
