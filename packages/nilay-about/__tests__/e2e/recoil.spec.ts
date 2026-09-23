import { test, expect, type Page } from './fixtures';

const conditionA = '条件 A の入力';
const conditionB = '条件 B の入力';

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
const results = (page: Page) => page.getByRole('region', { name: '自由反動' });
const energy = (page: Page, condition: 'A' | 'B') =>
  results(page).getByText(`条件 ${condition} の反動エネルギー`).locator('..');

// A phone shows one condition at a time, behind a switch; a wide screen shows both.
const show = async (page: Page, label: '条件 A' | '条件 B') => {
  // The form is there once the saved settings are read; only then can the switch be looked for.
  await expect(results(page)).toBeVisible();
  const toggle = page.getByRole('group', { name: '表示する条件' });
  if (await toggle.isVisible()) await toggle.getByText(label, { exact: true }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/recoil');
});

test('compares two conditions and keeps the copied load after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/反動の計算/);
  // The 12 番 shotshell of the SAAMI worked example against a .308 Win load.
  await expect(energy(page, 'A')).toContainText('40.9 J');
  await expect(energy(page, 'A')).toContainText('30.16 ft-lb');
  await expect(energy(page, 'B')).toContainText('21.42 J');
  await expect(results(page).getByText('-47.6%', { exact: true })).toBeVisible();
  await expect(results(page).getByText('反動速度 -30.1%', { exact: true })).toBeVisible();
  const spoken = page.locator('p.sr-only[role="status"]').last();
  await expect(spoken).toContainText('条件 B の自由反動エネルギーは、条件 A より 47.6% 小さくなります。');
  await page.getByRole('button', { name: '条件 A を条件 B にコピー' }).click();
  await expect(spoken).toContainText('条件 A と条件 B の自由反動エネルギーは、ほぼ同じです。');
  await expect(results(page).getByText('0%', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(field(page, conditionB, '初速')).toHaveValue('388.6');
  await expect(energy(page, 'B')).toContainText('40.9 J');
});

test('keeps the answer beside the inputs on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('group', { name: conditionB }).getByLabel('銃種').focus();
  await expect(results(page).getByText('-47.6%', { exact: true })).toBeInViewport();
});

test('rewrites every field when a unit changes in either condition, without changing the load', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '単位', exact: true })).toHaveCount(0);
  await unitPicker(page, conditionA, '銃の重量の単位').selectOption('lb');
  await expect(field(page, conditionA, '銃の重量')).toHaveValue('7');
  await expect(field(page, conditionB, '銃の重量')).toHaveValue('7.5');
  await expect(unitPicker(page, conditionB, '銃の重量の単位')).toHaveValue('lb');
  // The load weights share one unit, so changing it on the powder of B rewrites the shot of A too.
  await show(page, '条件 B');
  await page
    .getByRole('group', { name: conditionB })
    .getByRole('combobox', { name: '装弾の重量の単位' })
    .last()
    .selectOption('grain');
  await expect(field(page, conditionA, '発射物の重量')).toHaveValue('546.92');
  await expect(field(page, conditionB, '発射物の重量')).toHaveValue('150');
  await show(page, '条件 A');
  await unitPicker(page, conditionA, '初速の単位').selectOption('fps');
  await expect(field(page, conditionA, '初速')).toHaveValue('1274.9');
  // The same load read in another unit: the energy moves only by the rounding of the fields.
  await expect(energy(page, 'A')).toContainText('30.16 ft-lb');
  await expect(results(page).getByText('-47.6%', { exact: true })).toBeVisible();
});

test('warns about impossible input and names the source of the gas factor', async ({ page }) => {
  await field(page, conditionA, '銃の重量').fill('');
  await expect(page.getByText('0 より大きい数値を入力してください。').first()).toBeVisible();
  await expect(page.getByText('銃の重量、発射物の重量、初速を入力してください。')).toBeVisible();
  await field(page, conditionA, '銃の重量').fill('3.175');
  await field(page, conditionA, '初速').fill('5000');
  await expect(page.getByText('実在の銃器の範囲から外れた入力があります', { exact: false })).toBeVisible();
  // The figures are still shown, because the arithmetic holds; only the input is unreal.
  await expect(energy(page, 'A')).not.toContainText('—');
  // The method is closed until asked for, and says in its heading what it holds.
  await expect(page.getByText('British Text Book of Small Arms', { exact: false })).toBeHidden();
  await page.getByRole('button', { name: /計算方法と出典/ }).click();
  await expect(page.getByText('Gun Recoil - Technical: Free Recoil Energy', { exact: false })).toBeVisible();
  await expect(page.getByText('British Text Book of Small Arms', { exact: false })).toBeVisible();
  await expect(results(page).getByText('肩で感じる反動は', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /計算の内訳/ }).click();
  await expect(page.getByRole('row', { name: /反動運動量/ })).toContainText('12.07 kg·m/s');
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Condition A recoil energy', { exact: true })).toBeVisible();
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});

test('shows one condition at a time on a phone, with the answer straight after it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('group', { name: conditionB })).toBeHidden();
  await show(page, '条件 B');
  await expect(page.getByRole('group', { name: conditionA })).toBeHidden();
  await field(page, conditionB, '初速').fill('900');
  await expect(results(page).getByText('-47.6%', { exact: true })).toHaveCount(0);
  // A jump link to the other condition brings it forward.
  await page.getByRole('navigation').getByRole('link', { name: '条件 A' }).click();
  await expect(page.getByRole('group', { name: conditionA })).toBeVisible();
});
