import { test, expect, type Page } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/click-verification');
});

// A figure is looked up by its label inside the result column.
const figure = (page: Page, label: string) =>
  page
    .getByRole('region', { name: '計算結果' })
    .getByText(label, { exact: true })
    .locator('xpath=following-sibling::p[1]');

test('works out the correction factor and keeps the inputs after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/スコープのクリック値検証/);
  // 30 MOA at 100 m is 872.7 mm; 860 mm measured gives 872.687 ÷ 860 = 1.0148.
  await expect(figure(page, '補正係数（期待 ÷ 実測）')).toHaveText('1.0148');
  // The same sentence is also read out by the live region once typing settles, so it is looked up
  // among the visible result rather than across the whole page.
  await expect(
    page
      .getByRole('region', { name: '計算結果' })
      .getByText('実測は公称より 1.45% 少なく動きました。', { exact: true }),
  ).toBeVisible();
  // The worked example of the tall target worksheet: 30 MOA at 102 yd, 29.8 inches measured.
  await page.getByLabel('距離の単位').selectOption('yd');
  await page.getByLabel('射距離').fill('102');
  await page.getByLabel('測定の単位（移動量・横ずれ共通）').first().selectOption('inch');
  await page.getByLabel('実測の移動量').fill('29.8');
  await expect(figure(page, '補正係数（期待 ÷ 実測）')).toHaveText('1.0753');
  await page.reload();
  await expect(page.getByLabel('射距離')).toHaveValue('102');
  await expect(figure(page, '補正係数（期待 ÷ 実測）')).toHaveText('1.0753');
});

test('switches the click value with the dial unit', async ({ page }) => {
  await page.getByLabel('ダイヤル量の単位').selectOption('mil');
  await expect(page.getByLabel('公称クリック値')).toHaveValue('0.1-mil');
  await page.getByRole('spinbutton', { name: 'ダイヤル量 (mil)' }).fill('10');
  await page.getByLabel('実測の移動量').fill('1000');
  // 10 mil at 100 m is 100 000 × tan(0.01) = 1000.03 mm.
  await expect(figure(page, '期待移動量')).toHaveText('1,000mm');
  await expect(figure(page, '補正係数（期待 ÷ 実測）')).toHaveText('1');
  await expect(page.getByText('公称 0.1 mil・追従率 1', { exact: true })).toBeVisible();
});

test('lays out the tall target over A4 sheets and prints only the sheets', async ({ page }) => {
  await page.getByRole('button', { name: /縦長標的の印刷/ }).click();
  await expect(page.getByRole('img', { name: /印刷する標的のプレビュー/ })).toHaveCount(5);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: '補正係数と実効クリック値' })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('spinbutton', { name: 'ダイヤル量 (MOA)' }).fill('300');
  // Next.js keeps an empty route announcer with role="alert" on every page, so the tool's own alert is
  // picked out by its text; it is the only alert this page renders.
  await expect(page.getByRole('alert').filter({ hasText: '印刷用の標的は作りません' })).toBeVisible();
});

test('explains invalid input beside the field', async ({ page }) => {
  await page.getByLabel('実測の移動量').fill('');
  await expect(page.getByText('0 より大きい数値を入力してください。')).toBeVisible();
  await expect(page.getByText('距離・ダイヤル量・実測の移動量を入力してください。').first()).toBeVisible();
});

test('prints the target before there is anything to measure', async ({ page }) => {
  await page.getByLabel('実測の移動量').fill('');
  await expect(figure(page, '補正係数（期待 ÷ 実測）')).toHaveText('—');
  await expect(figure(page, '期待移動量')).toHaveText('872.7mm');
  await page.getByRole('button', { name: /縦長標的の印刷/ }).click();
  await expect(page.getByRole('img', { name: /印刷する標的のプレビュー/ })).toHaveCount(5);
  await expect(page.getByRole('button', { name: '5 枚を印刷する' })).toBeVisible();
});

test('keeps the same lengths when a unit is switched', async ({ page }) => {
  // 860 mm is 86 cm and 33.8583 in; 100 m is 109.3613 yd. The factor stays 1.0148 throughout.
  await page.getByLabel('測定の単位（移動量・横ずれ共通）').first().selectOption('cm');
  await expect(page.getByLabel('実測の移動量')).toHaveValue('86');
  await expect(figure(page, '補正係数（期待 ÷ 実測）')).toHaveText('1.0148');
  await page.getByLabel('測定の単位（移動量・横ずれ共通）').first().selectOption('inch');
  await expect(page.getByLabel('実測の移動量')).toHaveValue('33.8583');
  await page.getByLabel('距離の単位').selectOption('yd');
  await expect(page.getByLabel('射距離')).toHaveValue('109.3613');
  await expect(figure(page, '補正係数（期待 ÷ 実測）')).toHaveText('1.0148');
});
