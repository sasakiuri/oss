import { readFile } from 'node:fs/promises';

import { test, expect } from '@playwright/test';

test('keeps the main site theme when navigating through Labs', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: '送信', exact: true }).click();
  const validation = page.getByText('タイトルは必須です。', { exact: true });
  await expect(validation).toBeVisible();
  const errorColor = await validation.evaluate((element) => getComputedStyle(element).color);
  await page.getByRole('link', { name: '[Labs]', exact: true }).click();
  await page.getByRole('link', { name: 'home-target', exact: true }).click();
  await expect(page).toHaveURL(/\/labs\/home-target$/);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Nilay/About', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '競技種目を編集' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'OK', exact: true })).toHaveCSS(
    'background-color',
    'rgb(26, 115, 232)',
  );
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.goBack();
  await page.getByRole('link', { name: '[Contact]', exact: true }).click();
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expect(validation).toBeVisible();
  await expect(validation).toHaveCSS('color', errorColor);
  await expect(page.getByRole('main')).toHaveCount(1);
});

test('downloads a valid PDF from the local target endpoint', async ({ page }) => {
  await page.goto('/labs/home-target');
  await expect(page.getByText('160.5 cm', { exact: true })).toBeVisible();
  const responsePromise = page.waitForResponse('**/api/home-targets');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Get Target/ }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('Download did not produce a local file');
  expect((await readFile(path)).subarray(0, 8).toString()).toBe('%PDF-1.7');
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
});

test('shows quiz answers, advances, and restarts', async ({ page }) => {
  await page.goto('/labs/game-species-test');
  await expect(page.getByRole('img', { name: '鳥獣の画像', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^正解を表示/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  await page.getByRole('button', { name: /^次へ/ }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
  await page.getByRole('button', { name: /^リセット/ }).click();
  await expect(page.getByRole('img', { name: '鳥獣の画像', exact: true })).toBeVisible();
});

test('can submit after hiding an invalid reply address', async ({ page }) => {
  let submissions = 0;
  await page.route('**/api/contact', async (route) => {
    submissions += 1;
    expect(route.request().postDataJSON()).toMatchObject({ requiresReply: false, email: '' });
    await route.fulfill({ json: { hasError: false, errorMessage: '', uuid: 'local-tracking-id' } });
  });
  await page.goto('/contact');
  await page.getByLabel('返信を希望する').check();
  await page.getByLabel('Ｅメールアドレス *').fill('invalid');
  await page.getByLabel('返信を希望する').uncheck();
  await page.getByLabel('タイトル *').fill('Test');
  await page.getByLabel('お問い合わせ内容 *').fill('Local browser test');
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('local-tracking-id');
  expect(submissions).toBe(1);
});
