import { test, expect } from './fixtures';

/** A blank 400 × 300 PNG drawn in the page, so the spec needs no fixture file. */
const blankPng = async (page: import('@playwright/test').Page) =>
  Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ddd';
      context.fillRect(0, 0, 400, 300);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }),
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/antler-measure');
});

test('sets the scale from a reference and measures a traced line', async ({ page }) => {
  await expect(page).toHaveTitle(/角の写真計測/);
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'antler.png', mimeType: 'image/png', buffer: await blankPng(page) });
  const photo = page.getByRole('img', { name: '計測する写真' });
  await expect(photo).toBeVisible();
  // The photo is shown at its width on screen; points are picked in screen space and scaled back.
  // Its box is read at each tap, once it is in view: pressing a button can scroll the page and move
  // the photo, and on a phone the photo can start below the fold.
  const at = async (x: number, y: number) => {
    await photo.scrollIntoViewIfNeeded();
    const box = (await photo.boundingBox())!;
    await page.mouse.click(box.x + (x / 400) * box.width, box.y + (y / 300) * box.height);
  };
  await page.getByLabel(/^基準物の長さ/).fill('20');
  await at(50, 50);
  await at(250, 50);
  await expect(page.getByText(/縮尺：1 cm = 10 画素/)).toBeVisible();
  await page.getByRole('button', { name: '計測を追加' }).click();
  await at(50, 100);
  await at(50, 250);
  await expect(page.getByRole('region', { name: '計測結果' })).toContainText('15 cm');
});
