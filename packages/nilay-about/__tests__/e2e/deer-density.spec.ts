import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/deer-density');
});

test('estimates density with the random encounter model', async ({ page }) => {
  await expect(page).toHaveTitle(/シカの生息密度の推定/);
  // 1 pass a camera-day, 7.4 km/day, 18.1 m, 57°: π / (7.4 × 0.0181 × (2 + 0.9948)) ≈ 7.83.
  await page.getByLabel(/撮影回数/).fill('300');
  await expect(page.getByRole('region', { name: '推定密度' }).getByText(/^7\.83\s*頭\/km²$/)).toBeVisible();
});

test('reproduces the FUNRYU example and keeps the method across a reload', async ({ page }) => {
  await page.getByText('糞粒法（FUNRYU）').click();
  await expect(page.getByRole('region', { name: '推定密度' }).getByText(/^12\.57\s*頭\/km²$/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: '推定密度' }).getByText(/^12\.57\s*頭\/km²$/)).toBeVisible();
});
