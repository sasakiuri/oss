import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/shoot-decision');
});

test('asks whether to shoot, then why not, and shows the rule behind the answer', async ({ page }) => {
  await expect(page).toHaveTitle(/撃つか撃たないかの判断と急所/);
  await page.getByRole('button', { name: '練習を開始' }).click();
  await expect(page.getByText('1 / 15')).toBeVisible();
  await page.getByRole('button', { name: '撃たない' }).click();
  await page.getByRole('group', { name: '撃たない理由' }).getByRole('button').first().click();
  await expect(page.getByText(/^根拠:/)).toBeVisible();
  await expect(page.getByText('正しい判断', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '次の場面へ' }).click();
  await expect(page.getByText('2 / 15')).toBeVisible();
});

test('marks a tap on the side view against the vital zones', async ({ page }) => {
  const drawing = page.getByRole('img', { name: 'シカの横向きの模式図' });
  const box = await drawing.boundingBox();
  if (!box) throw new Error('The drawing has no box');
  // The chest zone is centred at (160, 150) in the drawing's 400 × 260 box. Clicked through the
  // locator, which scrolls the drawing into view first: it can start below the fold.
  await drawing.click({ position: { x: (160 / 400) * box.width, y: (150 / 260) * box.height } });
  await expect(page.getByText('胸部（心臓・肺）に当たる位置です。')).toBeVisible();
  await expect(page.getByRole('link', { name: 'エゾシカ利活用のための捕獲・運搬テキスト' })).toBeVisible();
});
