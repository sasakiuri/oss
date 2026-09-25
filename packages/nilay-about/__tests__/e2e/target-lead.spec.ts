import { test, expect, type Page } from './fixtures';

// Every figure is a block of its own under its label, and at a square crossing the lead and the part
// of it across the line of sight are the same number, so each is read by its own label.
const figure = (page: Page, term: string) => page.getByText(term, { exact: true }).locator('..');

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/target-lead');
});

// The closed-form cases below take the shot at a steady average speed, as the tool did before the
// drag model; the section is left closed again as the page opens it.
async function useAverageSpeed(page: Page) {
  const section = page.getByRole('button', { name: /^弾速と発砲の遅れ/ });
  await section.click();
  await page.getByText('平均速度を入力', { exact: true }).click();
  await page.getByLabel('平均弾速 (m/s)').fill('350');
  await section.click();
}

test('solves where the shot meets a crossing target and keeps it after reload', async ({ page }) => {
  await useAverageSpeed(page);
  await expect(page).toHaveTitle(/リード（見越し）の計算/);
  // 30 m against a projectile averaging 350 m/s and a target crossing square at 60 km/h. The target
  // opens the range as it crosses, so the meeting is 0.086 s out, not the 30 / 350 = 0.0857 s that
  // dividing the range by the speed would have given.
  await expect(figure(page, '弾の飛行時間')).toContainText('0.086');
  await expect(figure(page, '弾の飛行時間')).toContainText('86 ms');
  await expect(figure(page, 'リード（的の前方）')).toContainText('1.43 m');
  await expect(figure(page, 'リード（的の前方）')).toContainText('4.69 ft / 56.3 in');
  // At a square crossing the whole lead is across the line of sight, so that figure is left out.
  await expect(page.getByText('視線を横切る分', { exact: true })).toHaveCount(0);
  await expect(figure(page, '銃口を振る角度')).toContainText('2.73°');
  await expect(figure(page, '銃口を振る角度')).toContainText('163.8 MOA / 47.64 mil');
  await expect(figure(page, '会合点までの距離')).toContainText('30.03 m');
  await expect(figure(page, '会合点までの距離')).toContainText('射距離より 0.03 m 遠い');
  // The results themselves are not a live region; a settled summary is announced instead.
  await expect(page.getByText('リードは 1.43 m、弾の飛行時間は 0.086 秒です。')).toBeAttached();

  // Head-on the target still covers ground, but none of it crosses the line of sight, so there is
  // nothing to swing through and the shot meets it inside the range that was measured.
  await page.getByLabel('交差角').fill('0');
  await expect(figure(page, 'リード（的の前方）')).toContainText('1.36 m');
  await expect(figure(page, '視線を横切る分')).toContainText('0 m');
  await expect(figure(page, '銃口を振る角度')).toContainText('0°');
  await expect(figure(page, '弾の飛行時間')).toContainText('0.082');
  await expect(figure(page, '会合点までの距離')).toContainText('射距離より 1.36 m 近い');
  await page.reload();
  await expect(page.getByLabel('交差角')).toHaveValue('0');
  await expect(figure(page, 'リード（的の前方）')).toContainText('1.36 m');
});

test('tells a closing target from one going away, and waits out the delay first', async ({ page }) => {
  await useAverageSpeed(page);
  // 30 and 150 degrees share a crossing component, so the swing is the same angle either way, but
  // the closing target is met sooner and asks for less lead than the one opening the range.
  await page.getByLabel('交差角').fill('30');
  await expect(figure(page, '視線を横切る分')).toContainText('0.69 m');
  await expect(figure(page, 'リード（的の前方）')).toContainText('1.37 m');
  await expect(figure(page, '銃口を振る角度')).toContainText('1.36°');
  await page.getByLabel('交差角').fill('150');
  await expect(figure(page, '視線を横切る分')).toContainText('0.75 m');
  await expect(figure(page, 'リード（的の前方）')).toContainText('1.49 m');
  await expect(figure(page, '銃口を振る角度')).toContainText('1.36°');

  await page.getByLabel('交差角').fill('90');
  // The projectile speed and the delay are set once, so they wait closed with their values stated.
  await expect(page.getByRole('button', { name: /^弾速と発砲の遅れ/ })).toContainText('平均 350 m/s・遅れなし');
  await page.getByRole('button', { name: /^弾速と発砲の遅れ/ }).click();
  await page.getByLabel('遅れ時間').fill('0.02');
  await expect(figure(page, '弾の飛行時間')).toContainText('86 ms・遅れ込みで 0.106 秒');
  await expect(figure(page, 'リード（的の前方）')).toContainText('1.76 m');
  await expect(figure(page, '銃口を振る角度')).toContainText('3.37°');
  await page.getByLabel('遅れ時間').fill('0');
  await page.getByLabel('的の速度').fill('0');
  await expect(figure(page, 'リード（的の前方）')).toContainText('0 m');
  await expect(figure(page, '会合点までの距離')).toContainText('30 m');
});

test('shows the table, says what it cannot answer and stays translated', async ({ page }) => {
  await useAverageSpeed(page);
  const table = page.getByRole('table');
  // Half and half again of 30 m, at 30, 60 and 90 degrees, across the line of sight.
  await expect(table).toContainText('15');
  await expect(table).toContainText('45');
  await expect(table).toContainText('0.34');
  await expect(table).toContainText('2.15');
  await expect(page.getByText('遠い距離ほどリードは小さく出ます', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: /^弾速と発砲の遅れ/ }).click();
  await page.getByLabel('平均弾速 (m/s)').fill('');
  await expect(page.getByText('0 より大きい数値を入力してください。').first()).toBeVisible();
  await expect(page.getByText('エラーのある欄を直してください。')).toBeVisible();
  await page.getByLabel('平均弾速 (m/s)').fill('350');
  await expect(figure(page, 'リード（的の前方）')).toContainText('1.43 m');
  await page.getByLabel('交差角').fill('200');
  await expect(page.getByText('0 から 180 の範囲で入力してください。')).toBeVisible();
  await page.getByLabel('交差角').fill('90');

  // A target crossing faster than the shot flies is never caught, which is an answer of its own.
  await page.getByLabel('的の速度').fill('2000');
  await expect(page.getByText('この弾速では的に追いつきません。', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByLabel('的の速度').fill('60');
  await expect(page.getByRole('table')).toHaveCount(1);

  await page.getByRole('button', { name: /計算方法/ }).click();
  await expect(page.getByText('リード = 的の速度', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(figure(page, 'Lead ahead of the target')).toContainText('1.43 m');
  await page.reload();
  await expect(figure(page, 'Range at impact')).toContainText('30.03 m');
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await expect(page.getByLabel('射距離')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});

test('keeps the lead on a phone screen while the target speed is typed', async ({ page }) => {
  await useAverageSpeed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('的の速度').fill('60');
  await expect(figure(page, 'リード（的の前方）')).toContainText('1.43 m');
  await expect(page.getByText('1.43 m', { exact: true }).first()).toBeInViewport({ ratio: 1 });
});

test('splits the lead of a climbing target and slows the pellet from its muzzle velocity', async ({ page }) => {
  // New settings fly No. 7.5 lead from 400 m/s, so the pellet slows and falls over the 30 m.
  await expect(page.getByRole('button', { name: /^弾速と発砲の遅れ/ })).toContainText(
    '抗力で計算・2.41 mm・初速 400 m/s',
  );
  await expect(figure(page, '上下方向')).toContainText('上');
  await expect(figure(page, '上下方向')).toContainText('落下');
  await expect(figure(page, '到達時の速度')).toContainText('m/s');
  await page.getByLabel('的の上昇角').fill('-30');
  await expect(figure(page, '上下方向')).toContainText('下');
  await expect(page.getByRole('img', { name: /射手から見た図/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /真上から見た図/ })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('的の上昇角')).toHaveValue('-30');
});
