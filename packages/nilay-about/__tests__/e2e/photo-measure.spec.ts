import { test, expect, type Page } from './fixtures';

/** A 200 × 200 px drawing of a wild boar that ships with the site. */
const photo = 'public/images/game-species/107_001.jpg';

/** Taps the photo at a point given in photo pixels. */
const tap = async (page: Page, x: number, y: number) => {
  const canvas = page.getByRole('img', { name: '計測する写真' });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: (x / 200) * box.width, y: (y / 200) * box.height } });
};

const results = (page: Page) => page.getByRole('region', { name: '計測結果' });

/**
 * Firefox and WebKit click on whole CSS pixels, and the 200 px photo is drawn about three times as
 * wide, so a tap can land a third of a photo pixel off and a length can be a few tenths of a
 * centimetre away from the exact value.
 */
const shownNumber = async (page: Page, unit: 'cm' | 'kg') => {
  const text = await results(page)
    .getByText(new RegExp(`^\\d+(\\.\\d)?\\s?${unit}$`))
    .innerText();
  return Number.parseFloat(text);
};

const measureBody = async (page: Page) => {
  await page.setInputFiles('#photo-file', photo);
  await expect(page.getByText('写真を読み込みました（200 × 200 ピクセル）。')).toBeVisible();
  // A 100 px reference worth 50 cm makes a pixel half a centimetre.
  await tap(page, 20, 180);
  await tap(page, 120, 180);
  await page.getByLabel('基準 A–B の実寸 (cm)').fill('50');
  await page.getByText('体長', { exact: true }).click();
  await tap(page, 10, 80);
  await tap(page, 190, 80);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/photo-measure');
});

test('measures a body length against the reference and gives the boar weight from the paper', async ({ page }) => {
  await expect(page).toHaveTitle(/写真で体長・角を測る/);
  await measureBody(page);
  // 180 px at 0.5 cm per pixel.
  await expect(results(page).getByText(/^\d+(\.\d)?\s?cm$/)).toBeVisible();
  const length = await shownNumber(page, 'cm');
  expect(Math.abs(length - 90)).toBeLessThanOrEqual(1);
  await expect(results(page).getByText(/^基準は写真上 100 px、1 px = [\d.]+ mm。$/)).toBeVisible();
  // Abe (1986), males: log W = 3.38 log L − 5.34 (18.4 kg at 90 cm), without the viscera.
  const weight = await shownNumber(page, 'kg');
  // The length is shown to a tenth, so the weight worked out from it may differ in the last digit.
  expect(Math.abs(weight - 10 ** (3.38 * Math.log10(length) - 5.34))).toBeLessThanOrEqual(0.1);
  await expect(results(page).getByText(/安部（1986）の回帰式/)).toBeVisible();
});

test('gives no weight outside the lengths the paper measured, nor for deer', async ({ page }) => {
  await measureBody(page);
  // At 0.3 cm per pixel the same 180 px is 54 cm, shorter than any boar in the paper.
  await page.getByLabel('基準 A–B の実寸 (cm)').fill('30');
  await expect(results(page).getByText(/^5[34](\.\d)?\s?cm$/)).toBeVisible();
  await expect(results(page).getByText(/範囲外のため、出しません/)).toBeVisible();
  await results(page).getByText('シカ', { exact: true }).click();
  await expect(results(page).getByText('体重はイノシシだけ出します。')).toBeVisible();
});

test('traces antlers as separate paths', async ({ page }) => {
  await page.setInputFiles('#photo-file', photo);
  await tap(page, 20, 180);
  await tap(page, 120, 180);
  await page.getByLabel('基準 A–B の実寸 (cm)').fill('10');
  await page.getByText('角', { exact: true }).click();
  await tap(page, 50, 50);
  await tap(page, 50, 100);
  await page.getByRole('button', { name: '次の角' }).click();
  await tap(page, 100, 50);
  await tap(page, 130, 90);
  // 50 px and 50 px at 1 mm per pixel.
  await expect(results(page).getByText('角 1')).toBeVisible();
  await expect(results(page).getByText('角 2')).toBeVisible();
  await expect(results(page).getByText(/^5\s?cm$/)).toHaveCount(2);
});

test('asks before downloading the outline model and states its size', async ({ page }) => {
  await page
    .getByRole('heading', { name: /^AI で輪郭を取る/ })
    .getByRole('button')
    .click();
  await expect(page.getByRole('button', { name: /^モデルをダウンロードして使う（\d+(\.\d)? MB）$/ })).toBeVisible();
  await expect(page.getByText(/写真は送りません/)).toBeVisible();
  // Nothing is fetched until the reader presses the button.
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.waitForTimeout(500);
  expect(requests.filter((url) => url.includes('huggingface.co'))).toEqual([]);
});
