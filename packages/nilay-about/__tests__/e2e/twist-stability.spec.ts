import { test, expect, type Page } from './fixtures';

// The number fields are addressed by role: the unit inside a field is a select of its own, and a
// label match alone could find both.

// The air, the method and the notes start closed, with their values or key caution in the heading.
const open = (page: Page, name: RegExp) => page.getByRole('button', { name }).click();

// The value line under the lead figure's label: the factor and its band.
const stabilityFigure = (page: Page) =>
  page.getByText('ジャイロ安定係数 Sg', { exact: true }).locator('xpath=following-sibling::p[1]');

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/twist-stability');
});

test('works the opening bullet through the rule and keeps it after a reload', async ({ page }) => {
  await expect(page).toHaveTitle(/ツイストと安定性の計算/);
  // The 168 gr Sierra International of the paper's case 1, from a 12 inch twist at 2800 ft/s.
  const stability = stabilityFigure(page);
  await expect(stability).toContainText('1.67');
  await expect(page.getByRole('row', { name: /基準条件の安定係数/ })).toContainText('1.69');
  // The reference atmosphere is thicker than the Army Standard Metro the rule was fitted at.
  await expect(page.getByRole('row', { name: /大気補正/ })).toContainText('×0.9868');
  // The recommended twist stands beside the factor, in the unit the barrel is quoted in.
  await expect(page.getByText('Sg 1.5 に必要なツイスト').locator('xpath=following-sibling::p[1]')).toHaveText(
    '1:12.67inch 以下',
  );
  await expect(page.getByText('同じ重量で安定する最大の弾長').locator('xpath=following-sibling::p[1]')).toContainText(
    '32.3',
  );
  await expect(page.getByText('（十分）', { exact: true })).toBeVisible();

  // A tighter barrel raises the factor, and the choice survives a reload.
  await page.getByRole('spinbutton', { name: /ツイスト/ }).fill('9');
  await expect(stability).toContainText('2.97');
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: /ツイスト/ })).toHaveValue('9');
  await expect(stability).toContainText('2.97');
});

test('rewrites every field when a unit changes, without changing the bullet', async ({ page }) => {
  await page.getByLabel('弾頭の寸法の単位').selectOption('inch');
  await expect(page.getByRole('spinbutton', { name: '弾頭の直径' })).toHaveValue('0.3079');
  await expect(page.getByRole('spinbutton', { name: '弾頭の長さ' })).toHaveValue('1.226');
  await page.getByLabel('弾頭の重量の単位').selectOption('grain');
  await expect(page.getByRole('spinbutton', { name: '弾頭の重量' })).toHaveValue('168.06');
  await page.getByLabel('ツイストの単位').selectOption('mm');
  await expect(page.getByRole('spinbutton', { name: /ツイスト/ })).toHaveValue('304.8');
  await page.getByLabel('初速の単位').selectOption('fps');
  await expect(page.getByRole('spinbutton', { name: '初速' })).toHaveValue('2799.9');
  // The same bullet read in other units: the answer moves only by the rounding of the fields.
  await expect(stabilityFigure(page)).toContainText('1.67');
});

test('shows the cold weather case, names its source and switches language', async ({ page }) => {
  // The paper's Dunham's Bay case: a 70 gr 6 mm bullet from a 14 inch twist that yawed at -10 °F,
  // entered here in the millimetres and grams the form opens in.
  await page.getByRole('spinbutton', { name: '弾頭の直径' }).fill('6.17');
  await page.getByRole('spinbutton', { name: '弾頭の長さ' }).fill('21.08');
  await page.getByRole('spinbutton', { name: '弾頭の重量' }).fill('4.54');
  await page.getByRole('spinbutton', { name: /ツイスト/ }).fill('14');
  await page.getByRole('spinbutton', { name: '初速' }).fill('1021');
  await expect(page.getByText('（限界）')).toBeVisible();
  // Cold air is denser, and the same barrel loses what margin it had.
  await expect(page.getByRole('button', { name: /^大気/ })).toContainText('15 °C');
  await open(page, /^大気/);
  await page.getByRole('spinbutton', { name: '気温' }).fill('-23');
  await expect(page.getByText('（不安定）')).toBeVisible();
  await expect(page.getByText('弾は安定して飛びません。', { exact: false })).toBeVisible();

  // Input that cannot be a bullet is still calculated, with a caution rather than a refusal.
  await page.getByRole('spinbutton', { name: '弾頭の長さ' }).fill('790');
  await expect(page.getByText('実在の弾と銃の範囲外の入力があります', { exact: false })).toBeVisible();
  await expect(stabilityFigure(page)).not.toContainText('—');

  await expect(page.getByRole('button', { name: /^大気/ })).toContainText('-23 °C');
  await open(page, /^計算方法と出典/);
  await open(page, /^弾の種類と弾痕での確認/);
  await expect(page.getByText('Precision Shooting', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Army Standard Metro', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('樹脂チップ付きの弾はこの式の前提外です', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Gyroscopic stability factor (Sg)', { exact: true })).toBeVisible();
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});
