import { test, expect } from './fixtures';

test.use({ permissions: ['geolocation'], geolocation: { latitude: 35.49, longitude: 138.52, accuracy: 15 } });

test.beforeEach(async ({ page }) => {
  // The GSI tiles are not fetched in the tests; the map works without them.
  await page.route('https://cyberjapandata.gsi.go.jp/**', (route) => route.fulfill({ status: 404 }));
  await page.goto('/labs/coordinate-convert');
});

test('converts a typed plane coordinate and keeps it after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/座標の変換/);
  // The radio is visually hidden inside its segment, so the reader's target is the segment itself.
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '平面直角' }) })
    .click();
  await page.getByLabel('系', { exact: true }).selectOption('9');
  await page.getByLabel('X（北向き、m）').fill('55538.7916');
  await page.getByLabel('Y（東向き、m）').fill('32846.8514');
  await expect(page.getByText('36.500000, 140.200000')).toBeVisible();
  await page.reload();
  await expect(page.getByText('36.500000, 140.200000')).toBeVisible();
});

test('uses the device position and shows its grid squares', async ({ page }) => {
  await page.getByRole('button', { name: '現在地を使う' }).click();
  await expect(page.getByText('35.490000, 138.520000')).toBeVisible();
  await expect(page.getByRole('cell', { name: /^\d{8}$/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '地理院タイル' })).toBeVisible();
});

test('picks a point on the map', async ({ page }) => {
  await page.getByRole('button', { name: '地図で選ぶ' }).click();
  const map = page.getByRole('application', { name: '座標の地図' });
  await map.click();
  await expect(page.getByRole('button', { name: '地図で選ぶ' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('緯度（北緯）')).not.toHaveValue('35.6581');
});
