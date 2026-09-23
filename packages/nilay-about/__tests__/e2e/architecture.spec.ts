import { readFile } from 'node:fs/promises';

import { test, expect } from './fixtures';

test('keeps the main site theme when navigating through Labs', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: '送信', exact: true }).click();
  const validation = page.getByText('タイトルは必須です。', { exact: true });
  await expect(validation).toBeVisible();
  const errorColor = await validation.evaluate((element) => getComputedStyle(element).color);
  await page.getByRole('link', { name: '[Labs]', exact: true }).click();
  await page.getByRole('link', { name: '練習用標的の作成', exact: true }).click();
  await expect(page).toHaveURL(/\/labs\/home-target$/);
  // Labs sits inside the site's own chrome, so there is still exactly one main landmark.
  await expect(page.getByRole('main')).toHaveCount(1);
  // The tool's own colours apply inside it: the primary action is Material's primary blue.
  await expect(page.getByRole('button', { name: 'PDF をダウンロード' })).toHaveCSS(
    'background-color',
    'rgb(26, 115, 232)',
  );
  await page.goBack();
  await page.getByRole('link', { name: '[Contact]', exact: true }).click();
  await page.getByRole('button', { name: '送信', exact: true }).click();
  await expect(validation).toBeVisible();
  // Nothing of the tool's theme is left behind on the way back to the site.
  await expect(validation).toHaveCSS('color', errorColor);
  await expect(page.getByRole('main')).toHaveCount(1);
});

test('downloads a valid PDF from the local target endpoint', async ({ page }) => {
  await page.goto('/labs/home-target');
  await expect(page.getByText('160.5 cm', { exact: true })).toBeVisible();
  const responsePromise = page.waitForResponse('**/api/home-targets');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF をダウンロード' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('Download did not produce a local file');
  expect((await readFile(path)).subarray(0, 8).toString()).toBe('%PDF-1.7');
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
});

test('shows quiz answers and advances', async ({ page }) => {
  await page.goto('/labs/game-species-test');
  const reveal = page.getByRole('button', { name: '答えを見る', exact: true });
  await expect(reveal).toBeVisible();
  await reveal.click();
  await expect(page.getByRole('button', { name: 'わかった', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '採点せず次へ' }).click();
  await expect(reveal).toBeVisible();
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
