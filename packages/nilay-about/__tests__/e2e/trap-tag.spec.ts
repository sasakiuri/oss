import { test, expect, type Page } from './fixtures';

const ADDRESS = '東京都千代田区霞が関1-2-2';
const NAME = '山田太郎';
// Written out rather than imported: this spec checks what the browser actually
// holds, so the key is part of what it verifies.
const STORAGE_KEY = 'nilay-labs-trap-tag-v1';

const fillHuntingItems = async (page: Page) => {
  await page.getByLabel('住所').fill(ADDRESS);
  await page.getByLabel('氏名', { exact: true }).fill(NAME);
  await page.getByLabel('狩猟者登録証に記載された都道府県知事名').fill('東京都知事');
  await page.getByLabel('登録年度').fill('令和7年度');
  await page.getByLabel('登録番号').fill('第12345号');
};

// Saving and the legal text wait in closed sections under the tag.
const openSection = (page: Page, name: RegExp) => page.getByRole('button', { name }).click();

const savedSession = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);

test.beforeEach(async ({ page }) => {
  // window.print() has no dialog to close in a headless browser.
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto('/labs/trap-tag');
});

test('asks for the items of the selected purpose and shows the provision behind them', async ({ page }) => {
  await expect(page).toHaveTitle(/わな・網の標識/);
  await expect(page.getByLabel('登録年度')).toBeVisible();
  await openSection(page, /^法令の定め/);
  await expect(page.getByText('網猟免許又はわな猟免許に係る狩猟者登録を受けた者は', { exact: false })).toBeVisible();
  // The radio is visually hidden inside its segment, so the reader's target is the segment itself.
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: /許可捕獲/ }) })
    .click();
  await expect(page.getByRole('radio', { name: /許可捕獲/ })).toBeChecked();
  await expect(page.getByLabel('許可の有効期間')).toBeVisible();
  await expect(page.getByLabel('登録年度')).toHaveCount(0);
  await expect(page.getByText('第一項の許可を受けた者又は従事者は', { exact: false })).toBeVisible();
  await expect(page.getByText('金属製又はプラスチック製の標識に', { exact: false }).first()).toBeVisible();
});

test('lists the missing items and prints once every item is filled', async ({ page }) => {
  await page.getByRole('button', { name: '印刷する' }).click();
  const summary = page.getByRole('main').getByRole('alert').first();
  await expect(summary).toContainText('次の項目を入力してください。');
  await expect(summary).toContainText('登録番号');
  await expect(page.getByLabel('住所')).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(0);
  await fillHuntingItems(page);
  await expect(page.getByRole('img', { name: '印刷する標識のプレビュー' })).toBeVisible();
  await page.getByRole('button', { name: '印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
});

test('sizes the tag from the character size and the number per sheet', async ({ page }) => {
  await fillHuntingItems(page);
  await expect(page.getByText('mm', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: '印刷する標識のプレビュー' }).locator('rect[stroke]')).toHaveCount(1);
  await page.getByLabel('A4 1 枚に並べる数').selectOption('4');
  await expect(page.getByRole('img', { name: '印刷する標識のプレビュー' }).locator('rect[stroke]')).toHaveCount(4);
  // Six of these five lines no longer fit, and tags drawn over one another would hide why.
  await page.getByLabel('A4 1 枚に並べる数').selectOption('6');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A4 に収まりません');
  await expect(page.getByRole('img', { name: '印刷する標識のプレビュー' })).toHaveCount(0);
  await page.getByLabel('一字の大きさ').selectOption('15');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A4 に収まりません');
  // The statutory minimum is the smallest size on offer.
  expect(await page.getByLabel('一字の大きさ').locator('option').allInnerTexts()).toEqual(['10 mm', '12 mm', '15 mm']);
  await page.getByLabel('A4 1 枚に並べる数').selectOption('1');
  await expect(page.getByText('A4 に収まりません', { exact: false })).toHaveCount(0);
});

test('keeps the address and the name off this device until asked', async ({ page }) => {
  await fillHuntingItems(page);
  expect(await savedSession(page)).not.toContain(NAME);
  // Closed, the section still says that nothing is being kept.
  await expect(page.getByRole('button', { name: /^この端末への保存/ })).toContainText('オフ');
  await openSection(page, /^この端末への保存/);
  await page.getByLabel('この端末に保存する').check();
  expect(await savedSession(page)).toContain(NAME);
  await page.reload();
  await expect(page.getByLabel('住所')).toHaveValue(ADDRESS);
  await expect(page.getByRole('button', { name: /^この端末への保存/ })).toContainText('オン');
  await openSection(page, /^この端末への保存/);
  await page.getByLabel('この端末に保存する').uncheck();
  expect(await savedSession(page)).not.toContain(NAME);
  await expect(page.getByLabel('住所')).toHaveValue(ADDRESS);
  await page.reload();
  await expect(page.getByLabel('住所')).toHaveValue('');
});

test('deletes the saved session and the form on request', async ({ page }) => {
  await fillHuntingItems(page);
  await openSection(page, /^この端末への保存/);
  await page.getByLabel('この端末に保存する').check();
  // The delete clears the form as well, so it asks first.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '保存した内容を削除' }).click();
  await expect(page.getByLabel('住所')).toHaveValue('');
  await expect(page.getByLabel('この端末に保存する')).not.toBeChecked();
  // The delete removes the entry outright, so there may be nothing left to read.
  expect((await savedSession(page)) ?? '').not.toContain(NAME);
});

test('prints the sheet alone, without the page around it', async ({ page }) => {
  await fillHuntingItems(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('svg[width="210mm"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '記載事項' })).toBeHidden();
  await expect(page.getByRole('button', { name: '印刷する' })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.getByRole('heading', { name: '記載事項' })).toBeVisible();
});

test('supports keyboard language selection and stays translated after reload', async ({ page }) => {
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Address')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Registration number')).toBeVisible();
  await openSection(page, /^What the law requires/);
  // The printed items stay Japanese even when the interface is in English.
  await expect(page.getByText('網猟免許又はわな猟免許に係る狩猟者登録を受けた者は', { exact: false })).toBeVisible();
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await fillHuntingItems(page);
  await expect(page.getByRole('button', { name: '印刷する' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('term').filter({ hasText: '狩猟鳥獣の判別練習' })).toBeVisible();
});

test('keeps the preview and the print button beside the fields on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fillHuntingItems(page);
  // The last field is the furthest down the form, and the answer to it is still in view.
  await page.getByLabel('登録番号').focus();
  await expect(page.getByRole('img', { name: '印刷する標識のプレビュー' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '印刷する' })).toBeInViewport();
});
