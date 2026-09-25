import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/sight-adjustment');
});

test('turns the turret against the impact and keeps the inputs after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/照準調整のクリック数計算/);
  // 5 cm low at 100 m with 1/4 MOA clicks is 6.9 clicks, rounded to seven clicks UP.
  await expect(page.getByText('UP 7 クリック', { exact: true })).toBeVisible();
  await expect(page.getByText('LEFT 4 クリック', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /この距離での実寸/ })).toContainText('1 クリック = 7.27 mm');
  // The results themselves are not a live region; a settled summary is announced instead.
  await expect(page.getByText('UP 7 クリック、LEFT 4 クリック。')).toBeAttached();
  await page.getByText('上', { exact: true }).click();
  await expect(page.getByText('DOWN 7 クリック', { exact: true })).toBeVisible();
  await page.getByText('左', { exact: true }).click();
  await expect(page.getByText('RIGHT 4 クリック', { exact: true })).toBeVisible();
  await page.getByLabel('照準器の調整単位').selectOption('0.1-mil');
  await expect(page.getByText('DOWN 5 クリック', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: '上', exact: true })).toBeChecked();
  await expect(page.getByLabel('照準器の調整単位')).toHaveValue('0.1-mil');
  await expect(page.getByText('DOWN 5 クリック', { exact: true })).toBeVisible();
});

test('reports the rounding residual and accepts a custom click value', async ({ page }) => {
  await expect(page.getByText('計算値 6.88 クリック。丸めで約 0.91 mm 上に残ります。')).toBeVisible();
  await page.getByLabel('照準器の調整単位').selectOption('custom');
  await expect(page.getByLabel('100 m あたりの移動量')).toHaveValue('10');
  await expect(page.getByText('UP 5 クリック', { exact: true })).toBeVisible();
  await expect(page.getByText('計算値 5 クリック', { exact: true }).first()).toBeVisible();
});

test('converts yards and inches together', async ({ page }) => {
  await page.getByLabel('距離の単位').selectOption('yd');
  await page.getByRole('button', { name: /傾斜射撃の水平距離/ }).click();
  // The incline card shares this unit, so its distance keeps the same real length: 86.6 m is 94.71 yd.
  await expect(page.getByText('94.71 yd', { exact: true })).toBeVisible();
  await expect(page.getByLabel('斜距離')).toHaveValue('109.36');
  // One unit serves both errors, and it is offered in each of the two fields.
  await page.getByLabel('ズレの単位').first().selectOption('inch');
  await expect(page.getByLabel('ズレの単位').last()).toHaveValue('inch');
  await page.getByLabel('上下のズレ').fill('2');
  // 2 inch low at 100 yd is 7.6 clicks of 1/4 MOA.
  await expect(page.getByText('UP 8 クリック', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /この距離での実寸/ })).toContainText('1 クリック = 6.65 mm');
});

test('explains invalid input beside the field without losing the page', async ({ page }) => {
  await page.getByLabel('射距離').fill('');
  await expect(page.getByText('0 より大きい数値を入力してください。').first()).toBeVisible();
  await expect(page.getByText('射距離とクリック値を入力してください。')).toBeVisible();
  await page.getByLabel('射距離').fill('100');
  await expect(page.getByText('UP 7 クリック', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /傾斜射撃の水平距離/ }).click();
  await page.getByLabel('傾斜角').fill('120');
  await expect(page.getByText('-90 から 90 の範囲で入力してください。')).toBeVisible();
});

test('converts a slant distance and lists the size of each unit', async ({ page }) => {
  // Both helpers state their answer while closed.
  await expect(page.getByRole('button', { name: /傾斜射撃の水平距離/ })).toContainText('水平距離 86.6 m');
  await expect(page.getByRole('button', { name: /この距離での実寸/ })).toContainText('1 クリック = 7.27 mm');
  await page.getByRole('button', { name: /傾斜射撃の水平距離/ }).click();
  await expect(page.getByText('86.6 m', { exact: true })).toBeVisible();
  await page.getByLabel('傾斜角').fill('0');
  await expect(page.getByText('100 m', { exact: true })).toBeVisible();
  await page.getByLabel('傾斜角').fill('-60');
  await expect(page.getByText('50 m', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /この距離での実寸/ }).click();
  const table = page.getByRole('table');
  await expect(table.getByRole('row', { name: /1 MOA/ })).toContainText('29.09');
  await expect(table.getByRole('row', { name: /1 mil/ })).toContainText('100');
  await expect(table.getByRole('row', { name: /1 クリック/ })).toContainText('7.27');
  await expect(page.getByText('NATO mil', { exact: false })).toBeVisible();
});

test('shows the measuring note and stays translated after reload', async ({ page }) => {
  await expect(page.getByText('数発の群の中心', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Elevation', { exact: true })).toBeVisible();
  await expect(page.getByText('UP 7 clicks', { exact: true })).toBeVisible();
  await expect(page.getByText('centre of a group of several shots', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Distance', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Windage', { exact: true })).toBeVisible();
});

test('says when saved settings could not be read', async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'nilay-labs-sight-adjustment-v1',
      JSON.stringify({ state: { settings: { distance: null } }, version: 0 }),
    ),
  );
  await page.reload();
  const notice = '保存されていた設定を読み取れなかったため、初期値で開いています。';
  const regions = page.locator('p.sr-only[role="status"]');
  await expect(page.locator('p:not(.sr-only)').filter({ hasText: notice })).toBeVisible();
  await expect(page.getByLabel('射距離')).toHaveValue('100');
  // The notice has a region of its own: a status region is atomic, so sharing one with the result
  // would read the notice again after every change.
  await expect(regions.filter({ hasText: notice })).toHaveText(notice);
  await expect(regions.filter({ hasText: 'クリック' })).toHaveText('UP 7 クリック、LEFT 4 クリック。');
  await page.getByLabel('上下のズレ').fill('10');
  await expect(page.getByText('UP 14 クリック', { exact: true })).toBeVisible();
  await expect(regions.filter({ hasText: 'クリック' })).toHaveText('UP 14 クリック、LEFT 4 クリック。');
  await expect(regions.filter({ hasText: notice })).toHaveText(notice);
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(page.getByLabel('射距離')).toBeVisible();
  await expect(page.getByText('UP 7 クリック', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});

test('keeps the clicks on a phone screen while the error is typed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // 6 cm at 100 m is 8.25 clicks of 1/4 MOA.
  await page.getByLabel('上下のズレ').fill('6');
  await expect(page.getByText('UP 8 クリック', { exact: true })).toBeInViewport({ ratio: 1 });
});

test('takes the offset of a measured group from the link and gives the clicks', async ({ page }) => {
  // 7.27 cm low and 1.45 cm right at 100 m, with the 1/4 MOA clicks the form opens with (7.27 mm each).
  await page.goto(
    '/labs/sight-adjustment?distance=100&distanceUnit=m&offsetUnit=cm&vertical=low&verticalValue=7.27&horizontal=right&horizontalValue=1.45',
  );
  await expect(page.getByText(/平均着弾点のズレを読み込みました/)).toBeVisible();
  await expect(page.getByText('UP 10 クリック', { exact: true })).toBeVisible();
  await expect(page.getByText('LEFT 2 クリック', { exact: true })).toBeVisible();
  // The link is read once: the address drops it, so a reload keeps what was typed afterwards.
  await expect(page).toHaveURL(/\/labs\/sight-adjustment$/);
  await page.getByLabel('上下のズレ').fill('3');
  await page.reload();
  await expect(page.getByLabel('上下のズレ')).toHaveValue('3');
  await expect(page.getByText(/平均着弾点のズレを読み込みました/)).toHaveCount(0);
});
