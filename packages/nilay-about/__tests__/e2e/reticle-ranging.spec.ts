import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/reticle-ranging');
});

test('reads the same triangle from all three directions and keeps the choice after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/レティクルの測距/);
  // 1 m at 2 mil is 500 m, and the two remaining directions have to agree with that.
  await expect(page.getByText('500 m', { exact: true })).toBeVisible();
  await expect(page.getByText('546.8 yd', { exact: true })).toBeVisible();
  await expect(page.getByText('推定距離は 500 m（546.8 yd）。')).toBeAttached();
  await page.getByText('実寸', { exact: true }).click();
  await expect(page.getByText('100 cm', { exact: true })).toBeVisible();
  await expect(page.getByText('39.4 inch', { exact: true })).toBeVisible();
  await page.getByText('読み値', { exact: true }).click();
  await expect(page.getByText('2 mil', { exact: true })).toBeVisible();
  await expect(page.getByText('6.88 MOA', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: '読み値', exact: true })).toBeChecked();
  await expect(page.getByText('2 mil', { exact: true })).toBeVisible();
  await page.getByText('距離', { exact: true }).click();
  await page.getByLabel('レティクルの読み値').fill('1');
  await expect(page.getByText('1,000 m', { exact: true })).toBeVisible();
});

test('corrects a second focal plane reading and shows what a misread costs', async ({ page }) => {
  // A tenth of a mil either side of a 2 mil reading is about 5 % of the estimate. The section says
  // so while closed, and has the figures inside.
  await expect(page.getByRole('button', { name: /読み違えたときの距離/ })).toContainText(
    '476.2 m – 526.3 m（最大 5.3 %）',
  );
  await page.getByRole('button', { name: /読み違えたときの距離/ }).click();
  await expect(page.getByText('476.2 m', { exact: true })).toBeVisible();
  await expect(page.getByText('526.3 m', { exact: true })).toBeVisible();
  await expect(page.getByText('最大 5.3 %。', { exact: false })).toBeVisible();
  await expect(page.getByText('450 m – 550 m', { exact: true })).toBeVisible();
  // The focal plane is set once per scope, so it waits closed and states what it assumes.
  await expect(page.getByRole('button', { name: /レティクル/ })).toContainText('FFP・倍率による補正なし');
  await page.getByRole('button', { name: /レティクル/ }).click();
  await page.getByText('SFP（第二焦点面）', { exact: true }).click();
  await expect(page.getByText('500 m', { exact: true })).toBeVisible();
  await page.getByLabel('実際に使った倍率').fill('5');
  // Half the calibrated power, so two graduations really mean 4 mil and the target is half as far off.
  await expect(page.getByText('250 m', { exact: true })).toBeVisible();
  await expect(page.getByText('実際には 4 mil に相当します', { exact: false })).toBeVisible();
});

test('explains missing input, shows the method and stays translated after reload', async ({ page }) => {
  await page.getByLabel('レティクルの読み値').fill('');
  await expect(page.getByText('0 より大きい数値を入力してください。').first()).toBeVisible();
  await expect(page.locator('p:not(.sr-only)', { hasText: '必要な 2 つの値を入力してください。' })).toBeVisible();
  await page.getByLabel('レティクルの読み値').fill('2');
  await expect(page.getByText('500 m', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /計算方法/ }).click();
  await expect(page.getByText('NATO mil', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /読み違えたときの距離/ }).click();
  await expect(page.getByText('対象の実寸が 10 % ずれていた場合', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Estimated distance', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Distance', exact: true })).toBeChecked();
  await expect(page.getByLabel('Target size', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The page is in English by now, and so is the only name this link has.
  await page.getByRole('link', { name: 'Back to the list of tools' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Labs' })).toBeVisible();
});

test('keeps the answer on a phone screen while the reading is typed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('レティクルの読み値').fill('4');
  await expect(page.getByText('250 m', { exact: true })).toBeInViewport({ ratio: 1 });
  // The unit of the answer is chosen with it: the same distance, read in yards, and the typed values
  // are left as they were.
  await page.getByText('yd', { exact: true }).click();
  await expect(page.getByText('273.4 yd', { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByText('250 m', { exact: true })).toBeVisible();
  await expect(page.getByLabel('レティクルの読み値')).toHaveValue('4');
});
