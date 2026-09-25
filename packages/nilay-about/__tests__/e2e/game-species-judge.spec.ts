import { test, expect } from './fixtures';

test('asks whether each photo is a game species, then its name, and counts mistakes by kind', async ({ page }) => {
  await page.goto('/labs/game-species-test');
  await page.getByRole('group', { name: 'モード' }).locator('label', { hasText: '本番形式' }).click();
  await page.getByRole('group', { name: '1 枚の制限時間' }).locator('label', { hasText: '無制限' }).click();
  await page.getByRole('button', { name: '本番形式で開始' }).click();
  await expect(page.getByText('1 / 16')).toBeVisible();

  // Calling it a game species leads on to the names; the other answer moves straight on.
  await page.getByRole('button', { name: '狩猟鳥獣', exact: true }).click();
  await expect(page.getByRole('heading', { name: '名前は？' })).toBeVisible();
  await page.getByRole('group', { name: '名前の選択肢' }).getByRole('button').first().click();
  await expect(page.getByText('2 / 16')).toBeVisible();
  for (let photo = 2; photo <= 16; photo++) await page.getByRole('button', { name: '狩猟鳥獣ではない' }).click();

  await expect(page.getByRole('heading', { name: '判別テストの結果' })).toBeVisible();
  await expect(page.getByText('狩猟鳥獣かどうかの誤り')).toBeVisible();
  await expect(page.getByText('名前の誤り')).toBeVisible();
});

test('shows non-game species beside the game species they are mistaken for', async ({ page }) => {
  await page.goto('/labs/game-species-test');
  await page.getByRole('button', { name: /間違えやすい非狩猟鳥獣との比較/ }).click();
  await expect(page.getByRole('img', { name: 'オシドリ' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'マガモ' }).first()).toBeVisible();
});
