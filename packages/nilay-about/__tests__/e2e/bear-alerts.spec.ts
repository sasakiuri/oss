import { SCHEDULED_CHECKS_PAUSED } from '../../lib/scheduled-checks';

import { test, expect } from './fixtures';
import { FAKE_SUBSCRIPTION, mockApi, stubPush, VAPID_KEY } from './labs-push';

// Registering is paused with the scheduled checks; `scheduled-checks-paused.spec.ts` covers the page meanwhile.
test.skip(SCHEDULED_CHECKS_PAUSED, 'the scheduled checks are paused');

test.beforeEach(async ({ page }) => {
  await stubPush(page);
  await mockApi(page, '**/api/labs/push/key', () => ({ body: VAPID_KEY }));
});

test('registers places for bear alerts and stops them', async ({ page }) => {
  const calls = await mockApi(page, '**/api/labs/bear-alerts', ({ method }) =>
    method === 'PUT' ? { body: { expiresAt: '2026-12-23T00:00:00.000Z' } } : { body: { removed: true } },
  );
  await page.goto('/labs/bear-alerts');
  await expect(page).toHaveTitle(/クマ出没の通知/);
  await expect(page.getByText(/秋田県「ツキノワグマ等情報マップシステム『クマダス』データ」/)).toBeAttached();

  await page.getByLabel('緯度').fill('39.7186');
  await page.getByLabel('経度').fill('140.1024');
  await page.getByLabel('半径').selectOption('10');
  await page.getByRole('button', { name: '地点を追加' }).click();
  await expect(page.getByRole('list', { name: '登録した地点' })).toContainText('39.7186, 140.1024 ・ 半径 10 km');

  await page.getByRole('button', { name: 'この地点で通知を受け取る' }).click();
  await expect(page.getByText('通知の登録を保存しました。')).toBeVisible();
  expect(calls[0]).toMatchObject({
    method: 'PUT',
    body: {
      subscription: FAKE_SUBSCRIPTION,
      language: 'ja',
      places: [{ latitude: 39.7186, longitude: 140.1024, radiusKm: 10 }],
    },
  });
  await expect(page.getByText(/登録済み。/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/登録済み。/)).toBeVisible();
  await page.getByRole('button', { name: '通知を止める' }).click();
  await expect(page.getByText('クマ出没の通知を止めました。')).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: 'DELETE', body: { subscription: FAKE_SUBSCRIPTION } });
});

test('says so when the server feature is unavailable', async ({ page }) => {
  await mockApi(page, '**/api/labs/bear-alerts', () => ({ status: 503, body: { error: 'unavailable' } }));
  await page.goto('/labs/bear-alerts');
  await page.getByLabel('緯度').fill('39.7');
  await page.getByLabel('経度').fill('140.1');
  await page.getByRole('button', { name: '地点を追加' }).click();
  await page.getByRole('button', { name: 'この地点で通知を受け取る' }).click();
  await expect(page.getByText('サーバーの機能が現在利用できません。時間をおいてお試しください。')).toBeVisible();
});

test('refuses a place outside the range', async ({ page }) => {
  await page.goto('/labs/bear-alerts');
  await page.getByLabel('緯度').fill('91');
  await page.getByLabel('経度').fill('140');
  await page.getByRole('button', { name: '地点を追加' }).click();
  // The page's own alert, not the router's announcer, which is also an alert.
  await expect(page.getByRole('alert').filter({ hasText: '緯度は' })).toHaveText(
    '緯度は -90〜90、経度は -180〜180 です。',
  );
});
