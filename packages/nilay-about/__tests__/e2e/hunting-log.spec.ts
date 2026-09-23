import { test, expect, type Page } from './fixtures';

// Written out rather than imported: this spec checks what the browser actually holds.
const STORAGE_KEY = 'nilay-labs-hunting-log-v1';

const recordOuting = async (page: Page, { date, mesh, count }: { date: string; mesh: string; count: string }) => {
  await page.getByLabel('出猟日').fill(date);
  await page.getByLabel('都道府県（狩猟者登録を受けたところ）').selectOption('長野県');
  await page.getByLabel('メッシュ番号等').fill(mesh);
  await page.getByLabel('猟法（免許の種類）').selectOption('trap');
  await page.getByRole('button', { name: '鳥獣を追加' }).click();
  await page.getByLabel('鳥獣の種類 1').selectOption('ニホンジカ');
  await page.getByLabel('数', { exact: true }).fill(count);
  await page.getByRole('button', { name: '記録を追加' }).click();
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto('/labs/hunting-log');
});

test('records outings, sums them into the report draft and keeps them after a reload', async ({ page }) => {
  await expect(page).toHaveTitle(/出猟・捕獲の記録/);
  await recordOuting(page, { date: '2025-11-20', mesh: '12', count: '1' });
  await recordOuting(page, { date: '2026-01-10', mesh: '12', count: '2' });
  const table = page.getByRole('table').first();
  await expect(table.getByRole('row').nth(1)).toContainText('わな猟');
  await expect(table.getByRole('row').nth(1)).toContainText('3');
  await expect(page.getByText('2026年5月15日', { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toContain('ニホンジカ');

  await page.reload();
  await expect(page.getByText('出猟の記録（2 件）')).toBeVisible();
  await page.getByRole('button', { name: '下書きを印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
});

test('shows the provisions behind the report', async ({ page }) => {
  await page.getByRole('button', { name: /^報告の義務と条文/ }).click();
  await expect(
    page.getByText('その狩猟者登録に係る狩猟の結果を登録都道府県知事に報告しなければならない', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('鳥獣の捕獲等をした場所及びその捕獲等をした鳥獣の種類別の員数', { exact: false }),
  ).toBeVisible();
});

test('refuses an incomplete record', async ({ page }) => {
  await page.getByRole('button', { name: '記録を追加' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('入力内容を確認してください。');
  await expect(page.getByLabel('都道府県（狩猟者登録を受けたところ）')).toBeFocused();
});
