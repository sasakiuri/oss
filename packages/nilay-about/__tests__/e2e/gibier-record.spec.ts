import { test, expect, type Page } from './fixtures';

// Written out rather than imported: this spec checks what the browser actually holds.
const STORAGE_KEY = 'nilay-labs-gibier-record-v1';

const savedSession = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);

// The radio is visually hidden inside its segment, so the reader's target is the segment itself.
const choose = (page: Page, group: string | RegExp, option: string) =>
  page
    .getByRole('group', { name: group })
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: option, exact: true }) })
    .click();

const checks = (page: Page) => page.getByRole('region', { name: '確認と印刷' });

test.beforeEach(async ({ page }) => {
  // window.print() has no dialog to close in a headless browser.
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto('/labs/gibier-record');
});

test('quotes the guideline once an abnormality is recorded', async ({ page }) => {
  await expect(page).toHaveTitle(/ジビエの捕獲時記録票/);
  await expect(checks(page).getByRole('alert')).toHaveCount(0);
  await choose(page, /^ニ\sダニ類など外部寄生虫/, 'はい');
  await expect(checks(page).getByRole('alert')).toContainText('食用に供してはならない');
});

test('shows the time from the start of bleeding and the handbook temperature figure', async ({ page }) => {
  await choose(page, /^放血$/, '有');
  await page.getByLabel('放血の開始日時').fill('2026-09-23T06:30');
  await page.getByLabel('施設（または移動式解体処理車）への搬入日時').fill('2026-09-23T08:35');
  await expect(checks(page)).toContainText('2 時間 5 分');
  await choose(page, '捕獲獣種', 'シカ');
  await page.getByLabel(/温度計測定/).fill('40');
  await expect(checks(page)).toContainText('（シカ 40℃）以上です');
});

test('keeps the records on this device and lists each animal', async ({ page }) => {
  await page.getByLabel('捕獲者名').fill('山田太郎');
  await page.getByLabel('捕獲日時', { exact: true }).fill('2026-09-23T06:10');
  expect(await savedSession(page)).toContain('山田太郎');
  await page.getByRole('button', { name: '次の 1 頭を記録する' }).click();
  await expect(page.getByRole('heading', { name: '記録の一覧（2 頭）' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '記録の一覧（2 頭）' })).toBeVisible();
  await expect(page.getByLabel('捕獲者名')).toHaveValue('山田太郎');
  await page.getByRole('button', { name: /^この端末への保存/ }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'すべての記録を削除' }).click();
  await expect(page.getByRole('heading', { name: '記録の一覧（1 頭）' })).toBeVisible();
  expect((await savedSession(page)) ?? '').not.toContain('山田太郎');
});

test('prints the record alone, without the page around it', async ({ page }) => {
  await page.getByLabel('捕獲者名').fill('山田太郎');
  await page.getByRole('button', { name: 'この 1 頭を印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('氏名：山田太郎')).toBeVisible();
  await expect(page.getByRole('heading', { name: '捕獲', exact: true })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.getByText('氏名：山田太郎')).toBeHidden();
  await expect(page.getByRole('heading', { name: '捕獲', exact: true })).toBeVisible();
});

test('says in English that the tool is Japanese only', async ({ page }) => {
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Japanese only. The fields follow', { exact: false })).toBeVisible();
  await expect(page.getByLabel('捕獲者名')).toBeVisible();
});

test('reflows at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(page.getByRole('button', { name: 'この 1 頭を印刷する' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

// A 1 × 1 PNG: enough for the browser to decode, shrink and store.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('prints the individual number as a QR code and the recorded position', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 35.681236, longitude: 139.767125, accuracy: 10 });
  await page.getByLabel('個体番号').fill('A-12');
  await page.getByRole('button', { name: '現在地を記録する' }).click();
  await expect(page.getByText('緯度・経度 35.681236, 139.767125（誤差 約 10 m）')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('img', { name: '個体番号 A-12 の QR コード' })).toBeVisible();
  await expect(page.getByText('（緯度・経度 35.681236, 139.767125、誤差 約 10 m）')).toBeVisible();
});

test('keeps a photo in the browser across a reload and removes it with the record', async ({ page }) => {
  await page
    .getByLabel('この個体に写真を追加')
    .setInputFiles({ name: 'wound.png', mimeType: 'image/png', buffer: PIXEL_PNG });
  await expect(page.getByText('写真を 1 枚追加しました。')).toBeVisible();
  const photos = page.getByRole('list', { name: 'この個体の写真' });
  await expect(photos.getByRole('button', { name: '写真 1 を拡大' })).toBeVisible();
  await page.reload();
  await expect(photos.getByRole('button', { name: '写真 1 を拡大' })).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await photos.getByRole('button', { name: '写真 1 を削除' }).click();
  await expect(page.getByRole('button', { name: '写真 1 を拡大' })).toHaveCount(0);
});

test('downloads the records as CSV', async ({ page }) => {
  await page.getByLabel('捕獲者名').fill('山田太郎');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'すべての記録を CSV で書き出す' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^gibier-records-\d{8}\.csv$/);
  const text = await (await file.createReadStream()).toArray();
  expect(Buffer.concat(text).toString('utf8')).toContain('山田太郎');
});

test('shows the colour atlas findings for the stage chosen', async ({ page }) => {
  await page.getByRole('button', { name: /^異常の見分け方/ }).click();
  await choose(page, '段階', '胸・腹を開けたとき');
  await expect(page.getByText('血液以外の液体（腹水や胸水）が溜まっている')).toBeVisible();
  await expect(page.getByRole('link', { name: /別紙 カラーアトラス/ })).toBeVisible();
});

/** The photos the browser's photo database holds for the capture records. */
const storedPhotoIds = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('nilay-labs-photos-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const request = database.transaction('photos').objectStore('photos').getAll();
          request.onsuccess = () => {
            database.close();
            resolve(
              (request.result as { id: string; tool: string }[])
                .filter((photo) => photo.tool === 'gibier-record')
                .map((photo) => photo.id),
            );
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );

test('keeps the photos saved before the photo database gained its record of deletions', async ({ page }) => {
  // The database as the first version made it: the photos alone.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        indexedDB.deleteDatabase('nilay-labs-photos-v1');
        const open = indexedDB.open('nilay-labs-photos-v1', 1);
        open.onupgradeneeded = () => {
          const store = open.result.createObjectStore('photos', { keyPath: 'id' });
          store.createIndex('owner', ['tool', 'ownerId']);
          store.createIndex('tool', 'tool');
          store.add({
            id: 'kept-from-v1',
            tool: 'gibier-record',
            ownerId: 'an-older-record',
            type: 'image/jpeg',
            data: new ArrayBuffer(4),
            width: 1,
            height: 1,
            addedAt: '2026-09-01T00:00:00.000Z',
          });
        };
        open.onsuccess = () => {
          open.result.close();
          resolve();
        };
        open.onerror = () => reject(open.error);
      }),
  );
  await page.reload();
  await page
    .getByLabel('この個体に写真を追加')
    .setInputFiles({ name: 'wound.png', mimeType: 'image/png', buffer: PIXEL_PNG });
  await expect(page.getByText('写真を 1 枚追加しました。')).toBeVisible();
  const ids = await storedPhotoIds(page);
  expect(ids).toContain('kept-from-v1');
  expect(ids).toHaveLength(2);
});
