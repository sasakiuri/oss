import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/clay-score');
});

test('records a trap round, saves it and keeps the history after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/クレー射撃のスコアシート/);
  await page.getByLabel('開始射台').selectOption('3');
  await expect(page.getByText('次：1 枚目・射台 3')).toBeVisible();
  const hit = page.getByRole('button', { name: '初矢 ①' });
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
  await page.getByRole('button', { name: '初矢 ①' }).click();
  await page.getByRole('button', { name: '初矢 ①' }).click();
  await page.reload();
  await expect(page.getByText('次：3 枚目・射台 3')).toBeVisible();
  await page.getByRole('button', { name: '2 枚目・射台 2：初矢で命中' }).click();
  await expect(page.getByRole('button', { name: '2 枚目・射台 2：二の矢で命中' })).toBeVisible();
  await page.getByRole('button', { name: '最後の記録を消す' }).click();
  await expect(page.getByText('次：2 枚目・射台 2')).toBeVisible();
});

test('switches to skeet after confirming and shows the rule book sequence', async ({ page }) => {
  await page.getByRole('button', { name: '初矢 ①' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByText('スキート', { exact: true }).click();
  await expect(page.getByText('次：1 枚目・射台 1・シングル・ハイハウス')).toBeVisible();
  await expect(page.getByRole('button', { name: '25 枚目・射台 8・シングル・ローハウス：未記録' })).toBeVisible();
  await page.getByRole('button', { name: /白紙のスコアシートを印刷/ }).click();
  await expect(page.getByRole('img', { name: 'スキートの白紙スコアシートのプレビュー' })).toBeVisible();
});

test('links the ISSF rule book in the sources', async ({ page }) => {
  await page.getByRole('button', { name: /出典/ }).click();
  await expect(page.getByRole('link', { name: /ISSF Rule Book 2026 Edition/ })).toBeVisible();
});

test('records by key with the direction, and scores a squad in turn', async ({ page }) => {
  await page.getByLabel('クレーの飛んだ方向も記録する').check();
  await page.getByRole('button', { name: /キーボード・リモコンでの入力/ }).click();
  await page.getByLabel('キーで記録する').check();
  // Keys typed while a field has focus stay in the field, so leave the checkbox first.
  await page.getByRole('heading', { name: 'このラウンド' }).click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('1');
  await expect(page.getByRole('button', { name: '1 枚目・射台 1：初矢で命中・左', exact: true })).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.getByRole('button', { name: '1 枚目・射台 1：未記録', exact: true })).toBeVisible();

  await page.getByLabel('射手の人数').selectOption('2');
  await page.getByLabel('射順 1 の名前').fill('Aki');
  await page.getByLabel('射順 2 の名前').fill('Ben');
  await expect(page.getByText('次：Aki・1 枚目・射台 1')).toBeVisible();
  await page.getByRole('button', { name: '初矢 ①・正面' }).click();
  await expect(page.getByText('次：Ben・1 枚目・射台 2')).toBeVisible();
});
