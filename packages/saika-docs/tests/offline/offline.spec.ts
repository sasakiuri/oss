// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

test('sealed public documents work offline with the installed service worker', async ({ page, context }) => {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/.test(message.text())) violations.push(message.text());
  });
  await page.goto(`${base}/`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 60000 });
  await context.setOffline(true);
  await page.goto(`${base}/getting-started/`);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('h1')).not.toBeEmpty();
  await page.reload();
  await expect(page.locator('h1')).not.toBeEmpty();
  expect(violations).toEqual([]);
});
