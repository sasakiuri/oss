import { test, expect, type Page } from './fixtures';

const residuals = '距離ごとの残差';

// The method and the notes start closed, with their key caution in the heading.
const open = (page: Page, name: RegExp) => page.getByRole('button', { name }).click();

/** The fitted value: the line under the lead figure's label. */
const fitted = (page: Page) => page.getByText(/^実測に合う弾道係数/).locator('xpath=following-sibling::p[1]');
/** The band of values that hold every group, printed under the fitted value. */
const band = (page: Page) => page.getByText('0.296 〜 0.304 ならどの群も 1 cm 以内', { exact: false });

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/trajectory-truing');
});

test('opens on an example one coefficient explains, and keeps it after a reload', async ({ page }) => {
  await expect(page).toHaveTitle(/弾道の合わせ込み/);
  // The two drops are what a 0.30 load makes from a 100 m zero, so the solve lands back on 0.300.
  await expect(fitted(page)).toHaveText('0.300');
  await expect(band(page)).toBeVisible();
  const row = page.getByRole('table', { name: residuals }).getByRole('row', { name: /300 m/ });
  await expect(row).toContainText('-8.2 cm');
  await expect(row).toContainText('-0.1 cm');
  await page.getByLabel('1 行目の落差').fill('60');
  await expect(band(page)).toBeHidden();
  await expect(fitted(page)).not.toHaveText('0.300');
  await page.reload();
  await expect(page.getByLabel('1 行目の落差')).toHaveValue('60');
});

test('writes the fitted value back into the load when asked', async ({ page }) => {
  await page.getByRole('button', { name: 'この値を使う' }).click();
  // By role: the radio that chooses what to fit carries the same name as the field itself.
  // The field takes the value the screen printed, not the float the search came to rest on.
  await expect(page.getByRole('spinbutton', { name: '弾道係数' })).toHaveValue('0.3');
  // Once the load carries it there is nothing left to apply, and the button says so.
  await expect(page.getByRole('button', { name: 'この値を使っています' })).toBeDisabled();
  const row = page.getByRole('table', { name: residuals }).getByRole('row', { name: /400 m/ });
  await expect(row).toContainText('134.5 cm');
});

test('adds a group, reads it as an angle, and drops the row again', async ({ page }) => {
  await page.getByRole('button', { name: '行を追加' }).click();
  // A blank row is not a shot that was fired, so the answer stays where it was.
  await expect(fitted(page)).toHaveText('0.300');
  await expect(band(page)).toBeVisible();
  await page.getByLabel('3 行目の射距離').fill('500');
  await page.getByLabel('3 行目の落差').fill('300');
  await expect(band(page)).toBeHidden();
  await expect(fitted(page)).not.toHaveText('0.300');
  await page.getByRole('button', { name: '3 行目を削除' }).click();
  await expect(fitted(page)).toHaveText('0.300');
  await expect(band(page)).toBeVisible();
  await page.getByText('mil', { exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '落差 (mil)' })).toBeVisible();
});

test('says when the other figure alone cannot explain the same shots', async ({ page }) => {
  await page.getByText('初速', { exact: true }).click();
  // The drops came from one coefficient; a velocity alone leaves a couple of centimetres behind.
  await expect(page.getByText('初速だけでは、入力した精度まで合わせられません。', { exact: false })).toBeVisible();
  // What decides it is the closest any velocity comes, not the least squares value.
  await expect(page.getByText('最も近い 742 m/s でも残差は最大 1.8 cm です。', { exact: false })).toBeVisible();
});

test('never lets the fitted figure be read as a measurement of the bullet', async ({ page }) => {
  // Said in the closed heading as well, so it is read without opening anything.
  await expect(page.getByRole('button', { name: /^計算方法/ })).toContainText(
    'この銃・装弾・その日の条件で実測を再現する値',
  );
  await open(page, /^計算方法/);
  await expect(page.getByText('初速やクロノグラフの誤差もそこに吸収されます', { exact: false })).toBeVisible();
  await expect(page.getByText('近い距離だけで合わせても値は決まりません', { exact: false })).toBeVisible();
  await expect(page.getByText('測った範囲より遠くで使う場合は', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('reproduces these shots with this rifle', { exact: false })).toBeVisible();
});

test('asks for the load first, then folds it to the line that states it', async ({ page }) => {
  const load = page.getByRole('button', { name: /^計算に使っている弾/ });
  // Still the example: someone else's load has to be replaced before the groups mean anything.
  await expect(load).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('spinbutton', { name: '初速 (m/s)', exact: true }).fill('812');
  await expect(load).toContainText('812 m/s・BC 0.450 G1・スコープ高 45 mm・ゼロイン 100 m');
  await page.reload();
  await expect(load).toHaveAttribute('aria-expanded', 'false');
  await expect(load).toContainText('812 m/s');
  await expect(page.getByRole('spinbutton', { name: '初速 (m/s)', exact: true })).toBeHidden();
  // The groups and the answer are what a return visit is for, and they are open.
  await expect(page.getByLabel('1 行目の落差')).toBeVisible();
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});
