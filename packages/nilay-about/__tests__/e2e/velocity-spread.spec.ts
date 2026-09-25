import { Buffer } from 'node:buffer';

import { test, expect, type Page } from './fixtures';

const spreadTable = '距離ごとの縦の広がり';

/**
 * The summary as it stands on the page.
 *
 * The status region settles on the same sentence 700 ms later, so a bare text query matches one
 * element or two depending on how fast the page was reached.
 */
const summary = (page: Page, text: string) => page.locator('p:not(.sr-only)', { hasText: text });

// The load, the air and the method start closed, with their values in the heading.
const open = (page: Page, name: RegExp) => page.getByRole('button', { name }).click();

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/velocity-spread');
});

test('opens on a string of ten and keeps it after a reload', async ({ page }) => {
  await expect(page).toHaveTitle(/初速のばらつき/);
  await expect(page.getByText('4.4 m/s', { exact: true })).toBeVisible();
  // Ten shots leave the deviation known to about a factor of two, and the screen leads with it.
  await expect(page.getByText('95 % 区間 3 m/s 〜 8 m/s', { exact: true })).toBeVisible();
  await page.getByLabel('初速の記録', { exact: false }).fill('800\n801\n799\n800\n800');
  await expect(page.getByText('800 m/s', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('初速の記録', { exact: false })).toHaveValue('800\n801\n799\n800\n800');
});

test('parts the shots even where the rifle was zeroed, and widens with the range', async ({ page }) => {
  const table = page.getByRole('table', { name: spreadTable });
  await expect(table.getByRole('row', { name: /^100 m/ })).toContainText('0.2 cm');
  await expect(table.getByRole('row', { name: /^600 m/ })).toContainText('9.8 cm');
});

test('names an entry it could not read instead of leaving it out', async ({ page }) => {
  await page.getByLabel('初速の記録', { exact: false }).fill('800 805 fps 795');
  await expect(page.getByText('読み取れない値: fps')).toBeVisible();
  await expect(page.getByText('3 件を読み取りました（60 件まで）。', { exact: false })).toBeVisible();
});

test('refuses to describe the spread of a single shot', async ({ page }) => {
  await page.getByLabel('初速の記録', { exact: false }).fill('800');
  await expect(summary(page, '2 発以上の初速を入力してください。')).toBeVisible();
  await expect(page.getByRole('table', { name: spreadTable })).toBeHidden();
});

test('says how many shots the deviation itself would take, and when it is out of reach', async ({ page }) => {
  await expect(page.getByText('±20 % には 53 発必要です（現在 10 発）。')).toBeVisible();
  await page.getByLabel('標準偏差の目標精度', { exact: false }).fill('5');
  await expect(page.getByText(/200 発を超えるため、実射では決まりません。/)).toBeVisible();
});

test('never lets the spread be read as the size of a group', async ({ page }) => {
  await expect(page.getByText('実際の群はこれより大きくなります', { exact: false })).toBeVisible();
  await expect(page.getByText('発数の違う ES どうしは比べられません', { exact: false })).toBeVisible();
  await open(page, /^計算方法と出典/);
  await expect(page.getByText('計測器の誤差は含みません', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('A real group is larger', { exact: false })).toBeVisible();
});

test('keeps the unit with the readings, and the load behind a heading that states it', async ({ page }) => {
  const readings = page.getByLabel('初速の記録', { exact: false });
  await page.getByRole('group', { name: '初速の単位' }).getByText('fps').click();
  // A string of readings is reread in the new unit, never rewritten.
  await expect(readings).toHaveValue('800\n805\n795\n802\n798\n807\n793\n801\n799\n804');
  await expect(page.getByText('800.4 fps', { exact: true })).toBeVisible();
  const load = page.getByRole('button', { name: /^弾と照準/ });
  await expect(load).toContainText('ゼロイン 100 m');
  await open(page, /^弾と照準/);
  await page.getByRole('spinbutton', { name: /最大距離/ }).fill('300');
  await expect(load).toContainText('100 m 刻みで 300 m まで');
  await expect(page.getByRole('table', { name: spreadTable }).getByRole('row')).toHaveCount(4);
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});

test('loads the velocities from a ShotView CSV in the unit it was recorded in', async ({ page }) => {
  await page.goto('/labs/velocity-spread');
  const csv = [
    '"Load A"',
    '#,SPEED (FPS),Δ AVG (FPS),KE (FT-LB),POWER FACTOR (KGR⋅FT/S),TIME,CLEAN BORE,COLD BORE,SHOT NOTES',
    '1, 2808.2, 13.9, , , 1:41:26 PM, , , ""',
    '2, 2790.7, -3.6, , , 1:41:52 PM, , , ""',
    '-,,,,,,',
    'AVERAGE SPEED,2799.5,,,,,,,',
  ].join('\n');
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByLabel('弾速計の CSV を読み込む')
    .setInputFiles({ name: 'shotview.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('Garmin ShotView のファイル「Load A」から 2 発（fps）を読み込みました。')).toBeVisible();
  await expect(page.getByLabel('初速の記録', { exact: false })).toHaveValue('2808.2\n2790.7');
});
