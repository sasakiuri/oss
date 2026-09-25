import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/license-exam');
});

test('practises with the answer and its source shown at once, and counts the day', async ({ page }) => {
  await expect(page).toHaveTitle(/狩猟免許試験・考査の練習/);
  await page.getByRole('group', { name: '出題数' }).locator('label', { hasText: '10 問' }).click();
  await page.getByRole('button', { name: '練習を開始' }).click();
  await expect(page.getByText('1 / 10')).toBeVisible();
  await page.getByRole('group', { name: '選択肢' }).getByRole('button').first().click();
  await expect(page.getByText(/^根拠:/)).toBeVisible();
  await page.getByRole('button', { name: '次の問題へ' }).click();
  await expect(page.getByText('2 / 10')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.getByText('今日は学習済み', { exact: false })).toBeVisible();
});

test('runs the course mock exam without marking until it is handed in', async ({ page }) => {
  await page.getByRole('group', { name: '試験' }).locator('label', { hasText: '猟銃等講習会の考査' }).click();
  await expect(page.getByText('正誤式 50 問・60 分・45 問以上の正解で合格', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '模擬試験を開始' }).click();
  await expect(page.getByRole('timer')).toContainText('60:00');
  await page.getByRole('group', { name: '選択肢' }).getByRole('button', { name: '正しい' }).click();
  await expect(page.getByText(/^根拠:/)).toHaveCount(0);
  await page.getByRole('button', { name: '後で見直す' }).click();
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(page.getByText('2 / 50 問目', { exact: false })).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '提出して採点する' }).click();
  await expect(page.getByRole('heading', { name: '模擬試験の結果' })).toBeVisible();
  await expect(page.getByText('合格基準（45 問以上の正解）', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: '分野別の正答率' })).toBeVisible();
});

test('gives the same daily test after a reload', async ({ page }) => {
  await page.getByRole('button', { name: /今日のテスト/ }).click();
  const first = await page.getByRole('heading', { level: 2 }).first().textContent();
  await page.getByRole('button', { name: 'やめる' }).click();
  await page.reload();
  await page.getByRole('button', { name: /今日のテスト/ }).click();
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(first ?? '');
});
