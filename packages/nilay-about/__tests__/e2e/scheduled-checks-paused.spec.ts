import { SCHEDULED_CHECKS_PAUSED } from '../../lib/scheduled-checks';

import { test, expect } from './fixtures';

test.skip(!SCHEDULED_CHECKS_PAUSED, 'the scheduled checks are running');

for (const [path, button] of [
  ['/labs/bear-alerts', 'この地点で通知を受け取る'],
  ['/labs/course-watch', '更新を通知する'],
  ['/labs/return-alert', '登録して見守り用リンクを作る'],
] as const)
  test(`${path} takes no registration while the scheduled checks are paused`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('note').filter({ hasText: '定期確認を一時停止しているため' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`^${button}`) }).first()).toBeDisabled();
  });
