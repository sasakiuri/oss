import { Buffer } from 'node:buffer';

import { test, expect } from './fixtures';

/** A JPEG holding only an Exif DateTimeOriginal, which is all the tool reads. */
function jpegTakenAt(time: string): Buffer {
  const value = Buffer.from(`${time}\0`, 'latin1');
  const tiff = Buffer.alloc(8 + 18 + 18 + value.length);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x9003, 28);
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(value.length, 32);
  tiff.writeUInt32LE(44, 36);
  value.copy(tiff, 44);
  const header = Buffer.from('Exif\0\0', 'latin1');
  const segment = Buffer.alloc(4);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(2 + header.length + tiff.length, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), segment, header, tiff, Buffer.from([0xff, 0xd9])]);
}

test('counts photos by hour and against sunrise, and keeps the settings', async ({ page }) => {
  await page.goto('/labs/trail-camera');
  await expect(page).toHaveTitle(/トレイルカメラの出没時刻/);
  await page.getByLabel('緯度（日の出入り用）').fill('35.6581');
  await page.getByLabel('経度').fill('139.7414');
  await page.getByLabel('写真・ZIP を選ぶ').setInputFiles([
    { name: 'IMG_0001.JPG', mimeType: 'image/jpeg', buffer: jpegTakenAt('2026:10:15 06:20:00') },
    { name: 'IMG_0002.JPG', mimeType: 'image/jpeg', buffer: jpegTakenAt('2026:10:15 06:40:00') },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') },
  ]);
  await expect(page.getByText('撮影時刻を読めた写真 2 枚、読めなかったファイル 1 件。')).toBeVisible();
  await expect(page.getByText('6:00–', { exact: true })).toBeVisible();
  await expect(page.getByText('日の出後 0〜1 時間')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('緯度（日の出入り用）')).toHaveValue('35.6581');
});

test('counts by the species chosen for each photo, and asks before fetching the AI', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/labs/trail-camera');
  await page.getByLabel('写真・ZIP を選ぶ').setInputFiles([
    { name: 'IMG_0001.JPG', mimeType: 'image/jpeg', buffer: jpegTakenAt('2026:10:15 06:20:00') },
    { name: 'IMG_0002.JPG', mimeType: 'image/jpeg', buffer: jpegTakenAt('2026:10:15 21:40:00') },
  ]);
  await page.getByLabel('IMG_0001.JPG に写っているもの').selectOption({ label: 'ニホンジカ' });
  await page.getByLabel('IMG_0002.JPG に写っているもの').selectOption({ label: 'イノシシ' });
  await page.getByLabel('集計する写真').selectOption({ label: 'イノシシ（1）' });
  await expect(page.getByText('21:00–', { exact: true })).toBeVisible();
  // The boar was the only one of its kind; marked as a deer instead, the counts go back to all and stay there.
  await page.getByLabel('IMG_0002.JPG に写っているもの').selectOption({ label: 'ニホンジカ' });
  await expect(page.getByLabel('集計する写真')).toHaveValue('all');
  await page.getByLabel('IMG_0002.JPG に写っているもの').selectOption({ label: 'イノシシ' });
  await expect(page.getByLabel('集計する写真')).toHaveValue('all');
  await expect(page.getByRole('button', { name: /^AI で判別する（\d+\.\d MB）$/ })).toBeVisible();
  // Nothing is fetched from Hugging Face until the reader presses the button.
  expect(requests.filter((url) => url.includes('huggingface.co'))).toEqual([]);
});
