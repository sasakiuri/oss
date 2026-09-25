import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/pcp-fill');
});

test('counts fills from a cylinder and keeps the inputs after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/PCP 空気銃の充填回数/);
  // 12 L at 300 bar into a 200 cc gun refilled from 100 to 200 bar.
  await expect(page.getByText('60', { exact: true }).first()).toBeVisible();
  await page.getByLabel('ボンベの内容積').fill('6');
  await expect(page.getByText('30', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('ボンベの内容積')).toHaveValue('6');
});

test('states that real air holds less than an ideal gas', async ({ page }) => {
  await page
    .getByRole('heading', { name: /^計算方法と注意/ })
    .getByRole('button')
    .click();
  await expect(page.getByText('実際の回数は計算より少なくなります', { exact: false })).toBeVisible();
});
