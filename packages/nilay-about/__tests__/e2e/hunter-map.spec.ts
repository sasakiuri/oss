import { Buffer } from 'node:buffer';

import { test, expect } from './fixtures';

type Page = import('@playwright/test').Page;

// Inside the map drawn below, which covers about 35.47–35.52° N and 138.48–138.56° E.
test.use({ permissions: ['geolocation'], geolocation: { latitude: 35.49, longitude: 138.52, accuracy: 15 } });

/** A blank 800 × 600 map, drawn in the page so no fixture file is needed. */
async function blankMap(page: Page): Promise<Buffer> {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f4f1e8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  if (!png) throw new Error('Failed to encode the canvas as PNG.');
  return Buffer.from(png, 'base64');
}

/** Taps the map at a spot given in the picture's own pixels. */
async function tapMap(page: Page, x: number, y: number) {
  const map = page.getByRole('img', { name: '位置図' });
  const box = await map.boundingBox();
  if (!box) throw new Error('The map is not on screen.');
  await map.click({ position: { x: (x / 800) * box.width, y: (y / 600) * box.height } });
}

/** The longitude of the saved reference point at `index`, as IndexedDB holds it now. */
function savedLongitude(page: Page, index: number) {
  return page.evaluate(
    (at) =>
      new Promise<string | null>((resolve) => {
        const open = indexedDB.open('nilay-labs-hunter-map-v1');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const read = open.result.transaction('map').objectStore('map').get('setup');
          read.onerror = () => resolve(null);
          read.onsuccess = () => {
            open.result.close();
            resolve((read.result as { points?: { longitude: string }[] } | undefined)?.points?.[at]?.longitude ?? null);
          };
        };
      }),
    index,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/hunter-map');
});

test('aligns a map by three points, keeps it after reload and shows the position on it', async ({ page }) => {
  await expect(page).toHaveTitle(/狩猟マップ/);
  await expect(page.getByText('位置図は読み込まれていません。')).toBeVisible();
  await page
    .getByLabel('位置図の画像を選ぶ')
    .setInputFiles({ name: 'area.png', mimeType: 'image/png', buffer: await blankMap(page) });
  await expect(page.getByText('「area.png」（800 × 600 ピクセル）')).toBeVisible();

  // About 10 m per pixel: 600 px across is 0.0662° of longitude and 400 px down 0.036° of latitude.
  const points = [
    { x: 100, y: 100, latitude: '35.51', longitude: '138.49' },
    { x: 700, y: 500, latitude: '35.474', longitude: '138.5562' },
    { x: 700, y: 100, latitude: '35.51', longitude: '138.5562' },
  ];
  for (const [index, point] of points.entries()) {
    await page.getByRole('button', { name: '基準点を追加' }).click();
    await expect(page.getByText(`図の上で基準点 ${index + 1} の位置をタップしてください。`)).toBeVisible();
    await tapMap(page, point.x, point.y);
    const item = page.getByRole('listitem', { name: `基準点 ${index + 1}` });
    await item.getByLabel('緯度（北緯）').fill(point.latitude);
    await item.getByLabel('経度（東経）').fill(point.longitude);
  }
  const result = page.getByRole('region', { name: '位置合わせと現在地' });
  await expect(result.getByText('アフィン変換')).toBeVisible();
  await expect(result.getByText(/残差は必ず 0 です/)).toBeVisible();

  // The points are written to IndexedDB as they are typed; reload only once the last one is there.
  await expect.poll(() => savedLongitude(page, 2)).toBe('138.5562');
  await page.reload();
  await expect(page.getByText('「area.png」（800 × 600 ピクセル）')).toBeVisible();
  await expect(page.getByRole('listitem', { name: '基準点 3' }).getByLabel('経度（東経）')).toHaveValue('138.5562');

  await page.getByRole('button', { name: '現在地を表示' }).click();
  await expect(page.getByText('現在地を図の上に表示しています。')).toBeVisible();
  await expect(result.getByText('35.49000, 138.52000')).toBeVisible();
  await expect(page.getByRole('button', { name: '現在地へ移動' })).toBeVisible();
  await page.getByRole('button', { name: '現在地の表示を止める' }).click();
  // A position that is no longer followed leaves the map.
  await expect(page.getByText('現在地は表示していません。')).toBeVisible();
  await expect(result.getByText('35.49000, 138.52000')).toHaveCount(0);
});

test('places reference points with the keyboard alone', async ({ page }) => {
  await page
    .getByLabel('位置図の画像を選ぶ')
    .setInputFiles({ name: 'area.png', mimeType: 'image/png', buffer: await blankMap(page) });
  await expect(page.getByText('「area.png」（800 × 600 ピクセル）')).toBeVisible();
  const points = [
    { x: '100', y: '100', latitude: '35.51', longitude: '138.49' },
    { x: '700', y: '500', latitude: '35.474', longitude: '138.5562' },
  ];
  for (const [index, point] of points.entries()) {
    await page.getByRole('button', { name: '基準点を追加' }).focus();
    await page.keyboard.press('Enter');
    const item = page.getByRole('listitem', { name: `基準点 ${index + 1}` });
    await item.getByLabel('緯度（北緯）').focus();
    await page.keyboard.type(point.latitude);
    await page.keyboard.press('Tab');
    await page.keyboard.type(point.longitude);
    await page.keyboard.press('Tab');
    await page.keyboard.type(point.x);
    await page.keyboard.press('Tab');
    await page.keyboard.type(point.y);
    await expect(item.getByText(`図の (${point.x}, ${point.y})`)).toBeVisible();
  }
  await expect(page.getByRole('region', { name: '位置合わせと現在地' }).getByText('相似変換')).toBeVisible();
});

test('turns a PDF away and reads degrees, minutes and seconds', async ({ page }) => {
  await page
    .getByLabel('位置図の画像を選ぶ')
    .setInputFiles({ name: 'map.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(page.getByText(/PDF は読み込めません/)).toBeVisible();

  await page.getByRole('button', { name: '基準点を追加' }).click();
  const item = page.getByRole('listitem', { name: '基準点 1' });
  await item.getByLabel('緯度（北緯）').fill('35°30′15″');
  await expect(item.getByText('-90 から 90 の角度で入力してください。')).toHaveCount(0);
  await item.getByLabel('緯度（北緯）').fill('35 61');
  await expect(item.getByText('-90 から 90 の角度で入力してください。')).toBeVisible();
});

test('fills a point from the device position', async ({ page }) => {
  await page.getByRole('button', { name: '基準点を追加' }).click();
  await page.getByRole('button', { name: 'いまいる場所を基準点にする' }).click();
  const item = page.getByRole('listitem', { name: '基準点 1' });
  await expect(item.getByLabel('緯度（北緯）')).toHaveValue('35.490000');
  await expect(item.getByLabel('経度（東経）')).toHaveValue('138.520000');
});

test('lists the prefectural map pages and stays translated after reload', async ({ page }) => {
  await page.getByRole('button', { name: /都道府県の位置図の入手先/ }).click();
  await expect(page.getByRole('link', { name: '北海道' })).toHaveAttribute('href', /pref\.hokkaido\.lg\.jp/);
  await page.getByRole('button', { name: /測地系と計算方法/ }).click();
  await expect(page.getByText(/北西へ約 450 m ずれます/)).toBeVisible();
  await page.evaluate(() =>
    window.localStorage.setItem('nilay-language-v1', JSON.stringify({ state: { language: 'en' }, version: 0 })),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Show my position' })).toBeVisible();
});
