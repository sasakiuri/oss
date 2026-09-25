import { test, expect } from './fixtures';

test('records a stock, keeps it after reload and tallies the eye test', async ({ page }) => {
  await page.goto('/labs/gun-fit');
  await expect(page).toHaveTitle(/ガンフィットと利き目/);
  await page.getByLabel('銃の名前').fill('O/U');
  await page.getByLabel(/^引き長/).fill('368');
  await page.getByLabel(/^コム落差/).fill('38');
  await page.getByRole('button', { name: /シートを保存/ }).click();
  await expect(page.getByText('シートを保存しました。')).toBeVisible();
  await expect(page.getByRole('img', { name: /測る位置の図/ }).first()).toBeVisible();

  await page.getByRole('button', { name: '右目' }).click();
  await page.getByRole('button', { name: '右目' }).click();
  await expect(page.getByText(/半数を超えたのは右目です/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel(/^引き長/)).toHaveValue('368');
  await expect(page.getByRole('button', { name: 'O/U を削除' })).toBeVisible();
  await page.getByRole('button', { name: /出典/ }).click();
  await expect(page.getByRole('link', { name: /Orvis/ })).toBeVisible();
});
