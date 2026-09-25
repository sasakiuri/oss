import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.route('https://cyberjapandata.gsi.go.jp/**', (route) => route.fulfill({ status: 404 }));
  await page.goto('/labs/drive-hunt');
});

test('places stands on the map, draws lots and keeps the plan after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/巻き狩りの配置図/);
  await page.getByRole('button', { name: '地図で待ち場を追加' }).click();
  const map = page.getByRole('application', { name: '待ち場の地図' });
  await map.click({ position: { x: 100, y: 100 } });
  await map.click({ position: { x: 200, y: 150 } });
  await page.getByRole('button', { name: '地図で待ち場を追加' }).click();
  await expect(page.getByRole('listitem', { name: /^待ち場 \d$/ })).toHaveCount(2);

  for (const name of ['山田', '佐藤']) {
    await page.getByLabel('氏名').fill(name);
    await page.getByRole('button', { name: '追加', exact: true }).click();
  }
  await page.getByRole('button', { name: '抽選する' }).click();
  await expect(page.getByText('抽選しました。')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('listitem', { name: /^待ち場 \d$/ })).toHaveCount(2);
  await expect(page.getByLabel('担当').first()).not.toHaveValue('');
});

test('prints only the plan sheet', async ({ page }) => {
  await page.getByRole('button', { name: '地図で待ち場を追加' }).click();
  await page.getByRole('application', { name: '待ち場の地図' }).click({ position: { x: 120, y: 120 } });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('region', { name: '印刷用の配置図' })).toBeVisible();
  await expect(page.getByRole('button', { name: '抽選する' })).toBeHidden();
});
