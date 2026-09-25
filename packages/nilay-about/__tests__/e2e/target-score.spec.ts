import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/target-score');
});

test('scores taps on the drawn air rifle target and keeps the card after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/標的の採点/);
  const target = page.getByRole('img', { name: /10m エアライフルの標的/ });
  const box = (await target.boundingBox())!;
  // The centre of the drawing is the centre of the target: a shot there is a 10.9 inner ten.
  await target.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByText('1 発目：10.9*')).toBeVisible();
  await expect(page.getByRole('row', { name: '1 1 10.9 1' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 発目：10.9*')).toBeVisible();
});

test('saves cards by name and draws the average over time', async ({ page }) => {
  const target = page.getByRole('img', { name: /10m エアライフルの標的/ });
  const box = (await target.boundingBox())!;
  await target.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await page
    .getByRole('heading', { name: /^4\. 記録を保存/ })
    .getByRole('button')
    .click();
  await page.getByLabel('記録名').fill('first');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByLabel('記録名').fill('second');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('img', { name: /1 発あたり平均点の推移/ })).toBeVisible();
});

test('names the rule book edition it scores by', async ({ page }) => {
  await page
    .getByRole('heading', { name: /^採点方法と出典/ })
    .getByRole('button')
    .click();
  await expect(page.getByText('ISSF Rule Book 2026', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('電子標的が小数点を求める式は規則に定めがありません', { exact: false })).toBeVisible();
});
