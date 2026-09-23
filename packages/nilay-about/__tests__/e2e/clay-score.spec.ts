import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/clay-score');
});

test('records a trap round, saves it and keeps the history after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/クレー射撃のスコアシート/);
  await page.getByLabel('開始射台').selectOption('3');
  await expect(page.getByText('次：1 枚目・射台 3')).toBeVisible();
  const hit = page.getByRole('button', { name: '命中 ○' });
  const miss = page.getByRole('button', { name: '失中 ×' });
  // Target 6 is the second from station 3 when the round starts there.
  for (let index = 0; index < 25; index++) await (index === 5 ? miss : hit).click();
  await expect(page.getByText('25 枚すべて記録しました。')).toBeVisible();
  await expect(page.getByText('失中 1 枚', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '6 枚目・射台 3：失中' })).toBeVisible();
  await page.getByRole('button', { name: 'このラウンドを保存' }).click();
  await expect(page.getByText('ラウンドを保存しました。', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /ラウンドの履歴/ })).toContainText(
    'トラップ 1 ラウンド・平均 24 枚・最高 24 枚',
  );
  await expect(page.getByLabel('開始射台')).toHaveValue('3');
});

test('keeps a round in progress across a reload and corrects one box', async ({ page }) => {
  await page.getByRole('button', { name: '命中 ○' }).click();
  await page.getByRole('button', { name: '命中 ○' }).click();
  await page.reload();
  await expect(page.getByText('次：3 枚目・射台 3')).toBeVisible();
  await page.getByRole('button', { name: '2 枚目・射台 2：命中' }).click();
  await expect(page.getByRole('button', { name: '2 枚目・射台 2：失中' })).toBeVisible();
  await page.getByRole('button', { name: '最後の記録を消す' }).click();
  await expect(page.getByText('次：2 枚目・射台 2')).toBeVisible();
});

test('switches to skeet after confirming and shows the rule book sequence', async ({ page }) => {
  await page.getByRole('button', { name: '命中 ○' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByText('スキート', { exact: true }).click();
  await expect(page.getByText('次：1 枚目・射台 1・シングル・ハイハウス')).toBeVisible();
  await expect(page.getByRole('button', { name: '25 枚目・射台 8・シングル・ローハウス：未記録' })).toBeVisible();
  await page.getByRole('button', { name: /白紙のスコアシートを印刷/ }).click();
  await expect(page.getByRole('img', { name: 'スキートの白紙スコアシートのプレビュー' })).toBeVisible();
});

test('states that it does not replace the official score', async ({ page }) => {
  await expect(page.getByText('練習の記録用で、公式記録の代わりにはなりません', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /出典/ }).click();
  await expect(page.getByRole('link', { name: /ISSF Rule Book 2026 Edition/ })).toBeVisible();
});
