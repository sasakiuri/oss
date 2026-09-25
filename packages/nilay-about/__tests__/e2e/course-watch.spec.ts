import { SCHEDULED_CHECKS_PAUSED } from '../../lib/scheduled-checks';

import { test, expect } from './fixtures';
import { FAKE_SUBSCRIPTION, mockApi, stubPush, VAPID_KEY } from './labs-push';

// Registering is paused with the scheduled checks; `scheduled-checks-paused.spec.ts` covers the page meanwhile.
test.skip(SCHEDULED_CHECKS_PAUSED, 'the scheduled checks are paused');

test('watches a course page and shows when it last changed', async ({ page }) => {
  await stubPush(page);
  await mockApi(page, '**/api/labs/push/key', () => ({ body: VAPID_KEY }));
  const calls = await mockApi(page, '**/api/labs/course-watch', ({ method }) =>
    method === 'GET'
      ? {
          body: {
            pages: [
              { id: 'tokyo-police-course', changedAt: '2026-09-01T03:00:00.000Z' },
              { id: 'saitama-police-beginner-course', changedAt: null },
            ],
          },
        }
      : { body: { expiresAt: '2026-12-23T00:00:00.000Z' } },
  );
  await page.goto('/labs/course-watch');
  await expect(page).toHaveTitle(/講習会ページの更新通知/);
  await expect(page.getByRole('link', { name: '警視庁ホームページの該当ページを開く' })).toHaveAttribute(
    'href',
    'https://www.keishicho.metro.tokyo.lg.jp/about_mpd/welcome/event_koshu/koshu/koshukai.html',
  );
  await expect(page.getByText(/最後に変更を検知：/)).toBeVisible();

  const register = page.getByRole('button', { name: '更新を通知する' });
  await expect(register).toBeDisabled();
  await page.getByLabel(/東京都・警視庁ホームページ/).check();
  await register.click();
  await expect(page.getByText('更新通知を登録しました。')).toBeVisible();
  expect(calls.find((call) => call.method === 'PUT')).toMatchObject({
    body: { subscription: FAKE_SUBSCRIPTION, language: 'ja', pages: ['tokyo-police-course'] },
  });
});
