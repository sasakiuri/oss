import { test, expect } from './fixtures';

// Written out rather than imported: this spec checks what the browser actually holds.
const STORAGE_KEY = 'nilay-labs-snare-gauge-v1';

test.beforeEach(async ({ page }) => {
  // window.print() has no dialog to close in a headless browser.
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto('/labs/snare-gauge');
});

test('shows the national rule, then a prefecture’s relaxation with its source', async ({ page }) => {
  await expect(page).toHaveTitle(/くくりわなの規格ゲージ/);
  const prefecture = page.getByLabel('狩猟をする都道府県');
  await expect(prefecture).toHaveValue('national');
  await expect(page.getByText('4 mm 以上')).toBeVisible();
  await prefecture.selectOption('chiba');
  await expect(page.getByText('条件つきの緩和', { exact: true })).toBeVisible();
  await expect(page.getByText('足くくりわなに限る')).toBeVisible();
  await expect(
    page.getByRole('link', { name: /千葉県「イノシシ及びニホンジカの狩猟規制緩和のお知らせ」/ }),
  ).toBeVisible();
  await expect(page.getByText('出典（確認日 2026-09-23）')).toBeVisible();
  // The gauge starts at the statute's size; the relaxed size is offered beside it.
  await expect(page.getByRole('radio', { name: '12 cm' })).toBeChecked();
  await expect(page.getByRole('radio', { name: '15 cm' })).not.toBeChecked();
  await expect(page.getByRole('img', { name: '12 cm のゲージの印刷プレビュー' })).toBeVisible();
});

test('prints the gauge at its real size', async ({ page }) => {
  await page.getByLabel('狩猟をする都道府県').selectOption('yamanashi');
  // The radio is visually hidden inside its segment, so the reader's target is the segment itself.
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: '20 cm' }) })
    .click();
  await expect(page.getByRole('radio', { name: '20 cm' })).toBeChecked();
  await page.getByRole('button', { name: '印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  // The print sheet is sized in millimetres, so a 100% print keeps the circle at the limit.
  const sheet = page.locator('svg[width="210mm"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('circle')).toHaveAttribute('r', '100');
});

test('keeps the choice for the next visit and resets it on request', async ({ page }) => {
  await page.getByLabel('狩猟をする都道府県').selectOption('okayama');
  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY))
    .toContain('"prefecture":"okayama"');
  await page.reload();
  await expect(page.getByLabel('狩猟をする都道府県')).toHaveValue('okayama');
  await page.getByRole('button', { name: '入力を初期値に戻す' }).click();
  await page.getByRole('button', { name: '初期値に戻す' }).click();
  await expect(page.getByLabel('狩猟をする都道府県')).toHaveValue('national');
});

test('opens on the defaults and says so when the saved choice cannot be read', async ({ page }) => {
  await page.evaluate((key) => window.localStorage.setItem(key, '{not json'), STORAGE_KEY);
  await page.reload();
  await expect(page.getByLabel('狩猟をする都道府県')).toHaveValue('national');
  await expect(
    page.getByText('保存されていた設定を読み取れなかったため、初期値で開いています。').first(),
  ).toBeVisible();
});
