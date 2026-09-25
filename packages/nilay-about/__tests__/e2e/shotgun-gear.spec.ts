import { test, expect } from './fixtures';

test('registers a combination and picks it in the score sheet', async ({ page }) => {
  await page.goto('/labs/shotgun-gear');
  await expect(page).toHaveTitle(/散弾銃の装備の登録/);
  await page.getByLabel('銃の名前').fill('O/U');
  await page.getByRole('button', { name: '銃を登録' }).click();
  await page.getByLabel('チョークの名前').fill('IC');
  await page.getByRole('button', { name: 'チョークを登録' }).click();
  await page.getByLabel('装弾の名前').fill('Trap 24 g');
  await page.getByLabel('号数から直径を入れる').selectOption('7.5');
  await page.getByLabel(/装弾量/).fill('24');
  await page.getByRole('button', { name: '装弾を登録' }).click();
  await page.getByLabel('銃身', { exact: true }).selectOption({ label: 'O/U' });
  await page.getByLabel('チョーク', { exact: true }).selectOption({ label: 'IC' });
  await page.getByLabel('装弾', { exact: true }).selectOption({ label: 'Trap 24 g' });
  await page.getByRole('button', { name: '組み合わせを登録' }).click();
  await expect(page.getByText('O/U（IC） ／ Trap 24 g')).toBeVisible();

  await page.goto('/labs/clay-score');
  await page.getByLabel('登録した装備から入れる').selectOption({ label: 'O/U（IC） ／ Trap 24 g' });
  await expect(page.getByLabel('銃', { exact: true })).toHaveValue('O/U（IC）');
  await expect(page.getByLabel('装弾', { exact: true })).toHaveValue('Trap 24 g');
});
