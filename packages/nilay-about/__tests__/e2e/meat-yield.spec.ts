import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/meat-yield');
});

test('works out the stages of a deer and keeps the inputs after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/肉の歩留まり計算/);
  // 30 kg × 20 % = 6 kg of meat; 30 kg × 50 % = 15 kg of carcass.
  await expect(page.getByText('食肉にできる部位は約 6 kg（全体重 30 kg）。')).toBeAttached();
  await page.getByText('枝肉', { exact: true }).first().click();
  await page.getByLabel('量った重さ').fill('20');
  // 20 kg ÷ 50 % = 40 kg whole; 40 × 20 % = 8 kg.
  await expect(page.getByText('食肉にできる部位は約 8 kg（全体重 40 kg）。')).toBeAttached();
  await page.reload();
  await expect(page.getByLabel('量った重さ')).toHaveValue('20');
  await expect(page.getByText('食肉にできる部位は約 8 kg（全体重 40 kg）。')).toBeAttached();
});

test('leaves the unpublished boar carcass share blank', async ({ page }) => {
  await page.getByText('イノシシ', { exact: true }).click();
  await expect(page.getByLabel('食肉にできる部位の割合')).toHaveValue('30');
  await expect(page.getByLabel('枝肉の割合')).toHaveValue('');
  await expect(page.getByText('食肉にできる部位は約 9 kg（全体重 30 kg）。')).toBeAttached();
});

test('explains a share out of order and shows the sources', async ({ page }) => {
  await page.getByLabel('食肉にできる部位の割合').fill('60');
  await expect(page.getByText('食肉にできる部位の割合は、枝肉の割合以下にしてください。').first()).toBeVisible();
  await page.getByRole('button', { name: 'シカの参考値に戻す' }).click();
  await expect(page.getByLabel('食肉にできる部位の割合')).toHaveValue('20');
  await page.getByRole('button', { name: /計算方法と出典/ }).click();
  await expect(page.getByRole('link', { name: /野生鳥獣被害防止マニュアル【総合対策編】/ })).toBeVisible();
});
