import { test, expect } from './fixtures';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 35.49, longitude: 138.52, accuracy: 15 } });

test.beforeEach(async ({ page }) => {
  await page.route('https://cyberjapandata.gsi.go.jp/**', (route) => route.fulfill({ status: 404 }));
  await page.goto('/labs/shot-danger');
});

test('draws the danger area from the device position and a typed bearing, and keeps it', async ({ page }) => {
  await expect(page).toHaveTitle(/射撃の危険範囲/);
  await page.getByRole('button', { name: '現在地を射座にする' }).click();
  await page.getByLabel(/射向（真北から右回り）/).fill('90');
  await page.getByLabel('弾（出典の表の行）').selectOption('22-lr');
  await expect(page.getByRole('region', { name: '危険範囲' }).getByText(/^1,400\s*m$/)).toBeVisible();
  const map = page.getByRole('application', { name: '危険範囲の地図' });
  // Five areas and the line of fire.
  await expect(map.locator('svg path')).toHaveCount(6);
  await page.reload();
  await expect(page.getByLabel(/射向（真北から右回り）/)).toHaveValue('90');
  await expect(page.getByLabel('弾（出典の表の行）')).toHaveValue('22-lr');
  await expect(map.locator('svg path')).toHaveCount(6);
});

test('sets the bearing from a point picked on the map', async ({ page }) => {
  await page.getByRole('button', { name: '現在地を射座にする' }).click();
  await page.getByRole('button', { name: '地図で撃つ方向を選ぶ' }).click();
  const map = page.getByRole('application', { name: '危険範囲の地図' });
  const box = (await map.boundingBox())!;
  // Straight up from the centre, where the firing point sits: due north.
  await map.click({ position: { x: box.width / 2, y: 10 } });
  await expect(page.getByLabel(/射向（真北から右回り）/)).toHaveValue(/^(0|360)(\.\d)?$/);
});
