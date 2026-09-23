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

test('quotes the guideline once an abnormality is recorded, and leaves the decision to the facility', async ({
  page,
}) => {
  await expect(page).toHaveTitle(/ジビエの捕獲時記録票/);
  await expect(checks(page).getByRole('alert')).toHaveCount(0);
  await choose(page, /^ニ\sダニ類など外部寄生虫/, 'はい');
  await expect(checks(page).getByRole('alert')).toContainText('食用に供してはならない');
  await expect(checks(page)).toContainText('受入の可否は、食肉処理業者が');
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
  await expect(page.getByText('This tool is in Japanese only', { exact: false })).toBeVisible();
  await expect(page.getByLabel('捕獲者名')).toBeVisible();
});

test('reflows at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(page.getByRole('button', { name: 'この 1 頭を印刷する' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
