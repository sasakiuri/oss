import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto('/labs/capture-check');
});

test('prints the board with the manual’s three items', async ({ page }) => {
  await expect(page).toHaveTitle(/捕獲確認の写真と報償金/);
  await page.getByLabel('個体番号').fill('○－１');
  await expect(page.getByRole('img', { name: '印刷する標示板のプレビュー' })).toContainText('○－１');
  await page.getByRole('button', { name: '標示板を印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
});

test('says when a photo carries no date or position', async ({ page }) => {
  // A JPEG with no Exif: start of image, start of scan, end of image.
  await page.getByLabel('写真を選ぶ（JPEG）').setInputFiles({
    name: 'plain.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]),
  });
  await expect(page.getByText('記録なし', { exact: true })).toBeVisible();
  await expect(page.getByText(/記録なし（カメラの位置情報がオフか/)).toBeVisible();
});

test('estimates the payment and keeps it across a reload', async ({ page }) => {
  await page.getByRole('button', { name: /報償金の試算/ }).click();
  await page.getByRole('button', { name: '行を追加' }).click();
  await page.getByLabel('1 行目の区分').selectOption('deerBoarGibier');
  await page.getByLabel('1 行目の頭数').fill('3');
  await expect(page.getByText('合計 27,000 円').first()).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /報償金の試算/ }).click();
  await expect(page.getByText('合計 27,000 円').first()).toBeVisible();
});
