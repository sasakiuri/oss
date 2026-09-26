import { readFile } from 'node:fs/promises';

import { test, expect, type Page } from './fixtures';

/** A small picture drawn in the page, so no fixture file is needed. */
async function drawnPhoto(page: Page): Promise<Buffer> {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#6b8e23';
    context.fillRect(0, 0, 64, 48);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(png, 'base64');
}

/** Forgets everything Labs saved in this browser, as a new device would have nothing. */
async function clearEverything(page: Page) {
  await page.evaluate(async () => {
    window.localStorage.clear();
    for (const name of ['nilay-labs-photos-v1', 'nilay-labs-hunter-map-v1'])
      await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
      });
  });
}

test('exports settings, named settings and photos, and restores them into an empty browser', async ({ page }) => {
  // A changed tool, and a bullet kept by name.
  await page.goto('/labs/twist-stability');
  await page.getByRole('spinbutton', { name: /ツイスト/ }).fill('9');
  await page.getByLabel('名前', { exact: true }).fill('.308 168gr');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('保存しました。')).toBeVisible();

  // An outing with a photo.
  await page.goto('/labs/hunting-log');
  await page.getByLabel('出猟日').fill('2025-11-20');
  await page.getByLabel('都道府県（狩猟者登録を受けたところ）').selectOption('長野県');
  await page.getByLabel('メッシュ番号等').fill('12');
  await page.getByLabel('猟法（免許の種類）').selectOption('trap');
  await page.getByRole('button', { name: '鳥獣を追加' }).click();
  await page.getByLabel('鳥獣の種類 1').selectOption('ニホンジカ');
  await page.getByLabel('数', { exact: true }).fill('1');
  await page.getByRole('button', { name: '記録を追加' }).click();
  await expect(page.getByText('出猟の記録（1 件）')).toBeVisible();
  await page.getByLabel(/の記録に写真を追加$/).setInputFiles({
    name: 'catch.png',
    mimeType: 'image/png',
    buffer: await drawnPhoto(page),
  });
  await expect(page.getByText('写真を 1 枚追加しました。')).toBeVisible();

  await page.goto('/labs/data');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ファイルに書き出す' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^nilay-labs-backup-\d{4}-\d{2}-\d{2}\.jsonl$/);
  const text = await readFile((await download.path())!, 'utf8');
  // One header line, then one line per photo.
  const lines = text.trim().split('\n');
  const file = JSON.parse(lines[0]!) as {
    localStorage: Record<string, unknown>;
    hunterMap: { status: string };
    photos: Record<string, number>;
  };
  expect(Object.keys(file.localStorage)).toEqual(
    expect.arrayContaining([
      'nilay-labs-twist-stability-v1',
      'nilay-labs-twist-stability-profiles-v1',
      'nilay-labs-hunting-log-v1',
    ]),
  );
  expect(file.photos['hunting-log']).toBe(1);
  expect(lines).toHaveLength(2);
  expect(file.hunterMap).toEqual({ status: 'empty' });
  await expect(page.getByText('写真 1 枚を含みます。')).toBeVisible();

  await clearEverything(page);
  await page.goto('/labs/data');
  await page.getByLabel('書き出したバックアップファイル').setInputFiles({
    name: 'backup.jsonl',
    mimeType: 'application/x-ndjson',
    buffer: Buffer.from(text),
  });
  await expect(page.getByText('次のデータを読み込みます。')).toBeVisible();
  await expect(page.getByText('出猟・捕獲の記録の写真')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '読み込む', exact: true }).click();
  await expect(page.getByText(/件のデータを読み込みました。/)).toBeVisible();

  await page.goto('/labs/twist-stability');
  await expect(page.getByRole('spinbutton', { name: /ツイスト/ })).toHaveValue('9');
  await expect(page.getByRole('button', { name: '.308 168gr', exact: true })).toBeVisible();
  await page.goto('/labs/hunting-log');
  await expect(page.getByText('出猟の記録（1 件）')).toBeVisible();
  await expect(page.getByRole('button', { name: '写真 1 を拡大' })).toBeVisible();
});

test('lists and leaves out what a tool would not accept', async ({ page }) => {
  await page.goto('/labs/data');
  const file = {
    format: 'nilay-labs-backup',
    version: 3,
    exportedAt: '2026-09-24T00:00:00.000Z',
    localStorage: {
      'nilay-labs-recoil-v1': { state: { settings: { gunMassUnit: 'stone' } }, version: 0 },
      'somebody-elses-key': { state: {}, version: 0 },
    },
    hunterMap: { status: 'not-included' },
    photos: {},
  };
  await page.getByLabel('書き出したバックアップファイル').setInputFiles({
    name: 'backup.jsonl',
    mimeType: 'application/x-ndjson',
    buffer: Buffer.from(`${JSON.stringify(file)}\n`),
  });
  await expect(page.getByText('読み込めるデータがありません。')).toBeVisible();
  await expect(page.getByText(/反動の計算.*ツールの保存形式に合わない/)).toBeVisible();
  await expect(page.getByText(/somebody-elses-key.*Labs のどのツールのデータでもありません/)).toBeVisible();
  await expect(page.getByRole('button', { name: '読み込む', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.localStorage.getItem('nilay-labs-recoil-v1'))).toBeNull();
});

test('carries the average velocity into twist rate and stability', async ({ page }) => {
  await page.goto('/labs/velocity-spread');
  await page.getByRole('link', { name: 'この平均初速でライフリングの安定を計算' }).click();
  await expect(page).toHaveURL(/\/labs\/twist-stability$/);
  await expect(page.getByText(/初速のばらつきの平均 .* を初速に入れました。/).first()).toBeVisible();
});

test('restores only once the other Labs tabs are closed, and restores for real in a real browser', async ({
  page,
  context,
}) => {
  // A tool open in another tab holds its place among the open Labs pages.
  const tool = await context.newPage();
  await tool.goto('/labs/recoil');
  await page.goto('/labs/data');
  const file = {
    format: 'nilay-labs-backup',
    version: 3,
    exportedAt: '2026-09-24T00:00:00.000Z',
    localStorage: {},
    hunterMap: { status: 'empty' },
    photos: {},
  };
  const choose = () =>
    page.getByLabel('書き出したバックアップファイル').setInputFiles({
      name: 'backup.jsonl',
      mimeType: 'application/x-ndjson',
      buffer: Buffer.from(`${JSON.stringify(file)}\n`),
    });
  await choose();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '読み込む', exact: true }).click();
  await expect(page.getByText(/ほかの Labs のタブを閉じてから/)).toBeVisible();

  // With the tool closed, the same file restores. (This page's own lock never stands in its way.)
  await tool.close();
  await choose();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '読み込む', exact: true }).click();
  await expect(page.getByText(/件のデータを読み込みました。/)).toBeVisible();
});

test('a data page in another tab waits for a restore before it exports', async ({ page, context }) => {
  await page.goto('/labs/data');
  // Stand in for a long restore on this data page: hold the lock it takes while it restores.
  await page.evaluate(() => {
    void navigator.locks.request('nilay-labs-open', { mode: 'exclusive' }, () => {
      return new Promise<void>((done) => ((window as unknown as { finish: () => void }).finish = done));
    });
  });
  const other = await context.newPage();
  await other.goto('/labs/data');
  await other.getByRole('button', { name: 'ファイルに書き出す' }).click();
  await expect(other.getByRole('button', { name: '書き出しています…' })).toBeVisible();
  await other.waitForTimeout(500);
  await expect(other.getByRole('button', { name: '書き出しています…' })).toBeVisible();
  const downloading = other.waitForEvent('download');
  await page.evaluate(() => (window as unknown as { finish: () => void }).finish());
  await downloading;
});

test('a tool opens read-only while a restore cut short could not be undone', async ({ page }) => {
  await page.goto('/labs');
  await page.evaluate(() => {
    window.localStorage.setItem(
      'nilay-labs-restore-journal-v1',
      JSON.stringify({
        token: '11111111-1111-4111-8111-111111111111',
        phase: 'committing',
        local: [],
        photoTools: [],
        maps: false,
        failed: true,
      }),
    );
  });
  await page.goto('/labs/recoil');
  await expect(page.getByText(/保存を止めています/)).toBeVisible();
  const before = await page.evaluate(() => window.localStorage.getItem('nilay-labs-recoil-v1'));
  await page.getByRole('spinbutton').first().fill('9');
  expect(await page.evaluate(() => window.localStorage.getItem('nilay-labs-recoil-v1'))).toBe(before);
  await page.getByRole('link', { name: 'データの書き出し・読み込みで解決する' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '控えを削除して今のデータを使う' }).click();
  await expect(page.getByRole('button', { name: '控えを削除して今のデータを使う' })).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('nilay-labs-restore-journal-v1'))).toBeNull();
});

test('a tool opened while a restore runs waits for it before reading', async ({ page: tool, context }) => {
  const data = await context.newPage();
  await data.goto('/labs/data');
  // Acknowledge the exclusive restore lock before opening the tool.
  await data.evaluate(
    () =>
      new Promise<void>((locked) => {
        void navigator.locks.request('nilay-labs-open', { mode: 'exclusive' }, () => {
          window.localStorage.setItem(
            'nilay-labs-recoil-v1',
            JSON.stringify({ state: { settings: null }, version: 0 }),
          );
          const restoring = new Promise<void>((done) => ((window as unknown as { finish: () => void }).finish = done));
          locked();
          return restoring;
        });
      }),
  );
  let finished = false;
  // Handle rejection immediately so the old five-second fixture can be tested without an unhandled promise.
  const opening = tool.goto('/labs/recoil', { waitUntil: 'domcontentloaded' }).then(
    (response) => {
      finished = true;
      return { response, error: null };
    },
    (error: unknown) => {
      finished = true;
      return { response: null, error };
    },
  );
  try {
    await expect(tool.locator('[aria-busy="true"]')).toHaveCount(1);
    await tool.waitForLoadState('domcontentloaded');
    // Deliberately hold restoration beyond the ordinary five-second assertion deadline.
    await tool.waitForTimeout(6000);
    await expect(tool.locator('[aria-busy="true"]')).toHaveCount(1);
    expect(finished).toBe(false);
  } finally {
    await data.evaluate(() => (window as unknown as { finish: () => void }).finish());
  }
  const result = await opening;
  expect(result.error).toBeNull();
  expect(result.response?.ok()).toBe(true);
  await expect(tool.locator('[aria-busy="true"]')).toHaveCount(0);
});

test('undoes a restore cut short the next time any Labs tool opens, before it reads', async ({ page }) => {
  await page.goto('/labs');
  await page.evaluate(() => {
    const before = JSON.stringify({ state: { settings: null }, version: 0 });
    window.localStorage.setItem('nilay-labs-recoil-v1', '{"state":{"half":"restored"},"version":0}');
    window.localStorage.setItem(
      'nilay-labs-restore-journal-v1',
      JSON.stringify({
        token: '11111111-1111-4111-8111-111111111111',
        phase: 'committing',
        local: [{ key: 'nilay-labs-recoil-v1', before, written: '{"state":{"half":"restored"},"version":0}' }],
        photoTools: [],
        maps: false,
      }),
    );
  });
  await page.goto('/labs/recoil');
  expect(await page.evaluate(() => window.localStorage.getItem('nilay-labs-restore-journal-v1'))).toBeNull();
  // Whatever the tool saved on opening, it started from the value before the restore, not the half-restored one.
  expect(await page.evaluate(() => window.localStorage.getItem('nilay-labs-recoil-v1'))).not.toContain('half');
});
