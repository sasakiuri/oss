import { test, expect, type Page } from './fixtures';

const conditionA = '条件 A の入力';
const conditionB = '条件 B の入力';

// The pellet count of one load, read from its figure in the results.
const count = (page: Page, label: '条件 A' | '条件 B') =>
  page
    .getByRole('region', { name: '計算結果' })
    .locator('p', { hasText: new RegExp(`^${label}$`) })
    .locator('..');

// Every field carries its unit picker, whose name starts with the field's own ("初速の単位"), so a
// field is found by its role: the number box is a spinbutton and the picker a combobox.
// On a phone the condition not shown is still on the page, so its values can be read; it is shown
// before anything is typed into it.
const field = (page: Page, condition: string, name: string) =>
  page
    .getByRole('group', { name: condition, includeHidden: true })
    .getByRole('spinbutton', { name: new RegExp(`^${name}`), includeHidden: true });
const unitPicker = (page: Page, condition: string, name: string) =>
  page
    .getByRole('group', { name: condition, includeHidden: true })
    .getByRole('combobox', { name, includeHidden: true });
const results = (page: Page) => page.getByRole('region', { name: '計算結果' });

// A phone shows one condition at a time, behind a switch; a wide screen shows both.
const show = async (page: Page, label: '条件 A' | '条件 B') => {
  // The form is there once the saved settings are read; only then can the switch be looked for.
  await expect(page.getByRole('region', { name: '計算結果' })).toBeVisible();
  const toggle = page.getByRole('group', { name: '表示する条件' });
  if (await toggle.isVisible()) await toggle.getByText(label, { exact: true }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/shot-pellets');
});

test('counts the pellets of both loads and keeps a changed load after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/散弾の粒数とエネルギー/);
  // 2.41 mm lead against the same charge of the same size in steel.
  await expect(count(page, '条件 A')).toContainText('338粒');
  await expect(count(page, '条件 B')).toContainText('485粒');
  await expect(
    results(page).getByText(/条件 A 比で、条件 B は粒数 \+43\.6%、.*35 m での 1 粒のエネルギー -/),
  ).toBeVisible();
  await show(page, '条件 B');
  await field(page, conditionB, '初速').fill('380');
  await page.reload();
  await expect(field(page, conditionB, '初速')).toHaveValue('380');
  await expect(count(page, '条件 A')).toContainText('338粒');
});

test('rewrites every field when a unit changes, without changing the load', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '単位', exact: true })).toHaveCount(0);
  await unitPicker(page, conditionA, '粒の直径の単位').selectOption('inch');
  await expect(field(page, conditionA, '粒の直径')).toHaveValue('0.0949');
  await expect(field(page, conditionB, '粒の直径')).toHaveValue('0.0949');
  // One setting for both loads, so it can be changed from B as well.
  await show(page, '条件 B');
  await unitPicker(page, conditionB, '装弾量の単位').selectOption('oz');
  await expect(field(page, conditionA, '装弾量')).toHaveValue('0.9877');
  await show(page, '条件 A');
  await unitPicker(page, conditionA, '初速の単位').selectOption('fps');
  await expect(field(page, conditionA, '初速')).toHaveValue('1312');
  await expect(unitPicker(page, conditionB, '初速の単位')).toHaveValue('fps');
  // The same load read in another unit: the count moves only by the rounding of the fields.
  await expect(count(page, '条件 A')).toContainText('338粒');
});

test('fills the diameter from a shot number and the density from a material', async ({ page }) => {
  const conditionAGroup = page.getByRole('group', { name: conditionA });
  await conditionAGroup.getByLabel('号数', { exact: true }).selectOption('6');
  // (17 - 6)/100 inch is 0.11 inch, which is 2.794 mm.
  await expect(conditionAGroup.getByRole('spinbutton', { name: /^粒の直径/ })).toHaveValue('2.794');
  await conditionAGroup.getByLabel('材質', { exact: true }).selectOption('bismuth');
  await expect(conditionAGroup.getByRole('spinbutton', { name: /^材質の密度/ })).toHaveValue('9.79');
  // A number and a material only write into the fields, which stay editable afterwards.
  await conditionAGroup.getByRole('spinbutton', { name: /^粒の直径/ }).fill('2.5');
  await expect(conditionAGroup.getByRole('spinbutton', { name: /^粒の直径/ })).toHaveValue('2.5');
});

test('names its sources, warns about impossible input and switches to English', async ({ page }) => {
  await field(page, conditionA, '粒の直径').fill('');
  await expect(page.getByText('0 より大きい数値を入力してください。').first()).toBeVisible();
  await expect(page.getByText('粒の直径・材質の密度・装弾量・初速を入力してください。')).toBeVisible();
  await field(page, conditionA, '粒の直径').fill('2.41');
  await field(page, conditionA, '初速').fill('2000');
  await expect(page.getByText('実在の装弾の範囲外の入力があります', { exact: false })).toBeVisible();
  // The method and its notes are closed until asked for.
  await expect(page.getByText('SHOT SIZE', { exact: false })).toBeHidden();
  await page.getByRole('button', { name: /計算方法と出典/ }).click();
  await expect(page.getByText('SHOT SIZE', { exact: false })).toBeVisible();
  await expect(page.getByText('号数がこの式に従うかは未確認です', { exact: false })).toBeVisible();
  await expect(page.getByText('獲物への効果は判定しません', { exact: false })).toBeVisible();
  // The related-tools list at the foot of the page links there too; this is the one in the notes.
  await page.locator('#method-and-source').getByRole('link', { name: '散弾パターンの測定' }).click();
  await expect(page).toHaveURL(/\/labs\/shot-pattern/);
  await page.goBack();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Pellet count and energy', { exact: true }).first()).toBeVisible();
});

test('answers at the distance the reader shoots, beside the inputs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(count(page, '条件 B')).toContainText('35 m で 1 粒');
  await page.getByRole('spinbutton', { name: /^エネルギーを見る距離/ }).fill('20');
  await expect(count(page, '条件 B')).toContainText('20 m で 1 粒');
  await expect(results(page).getByRole('row', { name: /^20 m での速度/ })).not.toContainText('—');
  // The answer stays in view while the last load field is being edited.
  await field(page, conditionB, '初速').focus();
  await expect(count(page, '条件 B')).toBeInViewport();
  // The table and the air are closed, and say what they cover.
  await expect(page.getByRole('button', { name: /距離ごとの 1 粒/ })).toContainText('5 m 刻みで 50 m まで');
  await expect(page.getByRole('button', { name: /大気/ })).toContainText('15 °C・1,013.25 hPa・現地の気圧');
  await page.getByRole('button', { name: /距離ごとの 1 粒/ }).click();
  await expect(page.getByRole('table', { name: '距離ごとの残存速度と 1 粒のエネルギー' }).getByRole('row')).toHaveCount(
    11,
  );
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});
