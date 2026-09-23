import { test, expect } from './fixtures';

// Written out rather than imported: this spec checks what the browser actually holds.
const STORAGE_KEY = 'nilay-labs-trap-check-log-v1';

// The log reads wall-clock times on the device, so the browser's zone is fixed with the clock.
test.use({ timezoneId: 'Asia/Tokyo' });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-22T12:00:00+09:00') });
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto('/labs/trap-check-log');
});

test('registers a trap, warns once the interval passes, and clears the warning with a round', async ({ page }) => {
  await expect(page).toHaveTitle(/わな見回りの記録/);
  await page.getByLabel('識別名').fill('沢 1 号');
  await page.getByLabel('設置日時').fill('2026-09-21T06:00');
  await page.getByLabel('場所メモ（任意）').fill('林道の分岐から 50 m');
  await page.getByRole('button', { name: '登録する' }).click();

  const card = page.getByRole('group', { name: '沢 1 号' });
  // 30 hours since setting, against the default 24.
  await expect(card.getByText('【間隔超過】')).toBeVisible();
  await expect(card.getByText(/設置から（見回り記録なし） 1 日 6 時間/)).toBeVisible();

  await card.getByRole('button', { name: '見回りを記録' }).click();
  await expect(card.getByLabel('見回り日時')).toHaveValue('2026-09-22T12:00');
  await card.getByRole('button', { name: '記録する' }).click();
  await expect(card.getByText('【間隔超過】')).toHaveCount(0);
  await expect(card.getByText(/次の見回りまで あと 1 日 0 時間/)).toBeVisible();

  const saved = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  expect(JSON.parse(saved ?? 'null').state.traps[0]).toMatchObject({
    name: '沢 1 号',
    checks: [{ at: '2026-09-22T12:00' }],
  });

  await page.reload();
  await expect(page.getByRole('group', { name: '沢 1 号' })).toBeVisible();
});

test('registers with the time of saving when the page stays open', async ({ page }) => {
  await expect(page.getByLabel('設置日時')).toHaveValue('2026-09-22T12:00');
  // Six hours with the page open and the setting time untouched.
  await page.clock.fastForward('06:00:00');
  await page.getByLabel('識別名').fill('尾根');
  await page.getByRole('button', { name: '登録する' }).click();
  const card = page.getByRole('group', { name: '尾根' });
  await expect(card.getByText(/設置から（見回り記録なし） 0 分/)).toBeVisible();
  const saved = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  expect(JSON.parse(saved ?? 'null').state.traps[0]).toMatchObject({ installedAt: '2026-09-22T18:00' });
});

test('moves the warning with the interval the person sets', async ({ page }) => {
  await page.getByLabel('識別名').fill('尾根');
  await page.getByLabel('設置日時').fill('2026-09-22T06:00');
  await page.getByRole('button', { name: '登録する' }).click();
  const card = page.getByRole('group', { name: '尾根' });
  await expect(card.getByText('【間隔超過】')).toHaveCount(0);
  await page.getByLabel(/見回り間隔/).fill('5');
  await expect(card.getByText('【間隔超過】')).toBeVisible();
  await expect(card.getByText(/間隔を 1 時間 0 分 超えています/)).toBeVisible();
});

test('exports the log as CSV and prints it', async ({ page }) => {
  await page.getByLabel('識別名').fill('沢 1 号');
  await page.getByRole('button', { name: '登録する' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV に書き出す' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('trap-check-log-2026-09-22.csv');
  await page.getByRole('button', { name: '印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
});

test('shows the public sources behind the interval', async ({ page }) => {
  await page.getByRole('button', { name: /見回り頻度の根拠/ }).click();
  await expect(page.getByText('頻繁にわなを見回ること', { exact: false })).toBeVisible();
  await expect(page.getByText('１日１回以上の見回りを実施する', { exact: false })).toBeVisible();
  await expect(page.getByText('原則として毎日', { exact: false }).first()).toBeVisible();
});
