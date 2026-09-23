import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/wounded-game');
});

test('reads the signs into a wait and keeps them after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/半矢の追跡/);
  await expect(page.getByText('1 時間以上', { exact: true }).first()).toBeVisible();
  await page.getByText('腹（腸）', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '腹（腸）に当たった場合の目安' })).toBeVisible();
  await expect(page.getByText('6 時間以上', { exact: true }).first()).toBeVisible();
  await page.getByLabel('撃った時刻').fill('2026-09-23T15:30');
  // 15:30 + 6 h.
  await expect(page.getByText('9/23 21:30', { exact: true })).toBeVisible();
  await page.getByLabel('泡が混じる血').check();
  await page.reload();
  await expect(page.getByRole('radio', { name: '腹（腸）' })).toBeChecked();
  await expect(page.getByLabel('泡が混じる血')).toBeChecked();
  await expect(page.getByText('9/23 21:30', { exact: true })).toBeVisible();
});

test('logs the trail with a position and measures from the shot site', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 35, longitude: 135, accuracy: 5 });
  await page.getByLabel('現在地を付ける').check();
  await page.getByLabel('記録の種類').selectOption('shot-site');
  await page.getByLabel('時刻', { exact: true }).fill('2026-09-23T17:00');
  await page.getByRole('button', { name: '記録を追加' }).click();
  await expect(page.getByText('35.00000, 135.00000', { exact: false })).toBeVisible();
  await context.setGeolocation({ latitude: 35.001, longitude: 135, accuracy: 5 });
  await page.getByLabel('記録の種類').selectOption('blood');
  await page.getByLabel('時刻', { exact: true }).fill('2026-09-23T17:20');
  await page.getByLabel('メモ（目印・血の量・向きなど）').fill('倒木の手前');
  await page.getByRole('button', { name: '記録を追加' }).click();
  await expect(page.getByText('被弾地点から直線 111 m', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText('倒木の手前')).toBeVisible();
  await page.getByRole('button', { name: '9/23 17:20 の血痕を削除' }).click();
  await expect(page.getByText('倒木の手前')).toHaveCount(0);
});

test('states the law and the finishing cautions with their sources', async ({ page }) => {
  await page.getByRole('button', { name: /見つからないときと法令/ }).click();
  await expect(
    page.getByText('過失がなくて捕獲等をした鳥獣の行方を確知することができない場合', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('30 万円以下の罰金', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /止め刺しの安全/ }).click();
  await expect(
    page.getByRole('link', { name: /野生鳥獣被害防止マニュアル【総合対策編】第6章 安全対策/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /出典/ })).toContainText('確認日 2026-09-23');
  await page.getByRole('button', { name: /出典/ }).click();
  await expect(page.getByText('北米の資料はオジロジカを対象とする英語資料', { exact: false })).toBeVisible();
});

test('resets to an empty trail after confirming', async ({ page }) => {
  await page.getByRole('button', { name: '記録を追加' }).click();
  await expect(page.getByText('1 件の記録')).toBeVisible();
  await page.getByRole('button', { name: '入力を初期値に戻す' }).click();
  await page.getByRole('button', { name: '初期値に戻す', exact: true }).click();
  await expect(page.getByText('まだ記録はありません。')).toBeVisible();
});
