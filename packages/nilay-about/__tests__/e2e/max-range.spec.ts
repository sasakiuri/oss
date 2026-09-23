import { test, expect, type Page } from './fixtures';

const results = '指定した仰角と、最も遠くまで届く仰角での結果';

// The method and the notes start closed, with their key caution in the heading.
const open = (page: Page, name: RegExp) => page.getByRole('button', { name }).click();

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/max-range');
});

test('opens on a lead pellet and keeps the shot after a reload', async ({ page }) => {
  await expect(page).toHaveTitle(/最大到達距離の計算/);
  const carried = page.getByRole('table', { name: results }).getByRole('row', { name: /到達距離/ });
  // A 2.4 mm lead pellet at 380 m/s: about 194 m at the 30 degrees the form opens on, and
  // about 196 m at the angle that carries furthest.
  await expect(carried).toContainText('194 m');
  await expect(carried).toContainText('196 m');
  await expect(page.getByRole('columnheader', { name: '最大（仰角 24.2 度）' })).toBeVisible();
  await page.getByLabel('仰角 (度)', { exact: true }).fill('10');
  await expect(carried).toContainText('179 m');
  await page.reload();
  await expect(page.getByLabel('仰角 (度)', { exact: true })).toHaveValue('10');
  await expect(carried).toContainText('179 m');
});

test('asks a bullet the questions a bullet needs, and reads the answer in yards', async ({ page }) => {
  await page.getByText('単一弾（ライフル弾・スラッグ）', { exact: true }).click();
  await expect(page.getByLabel('弾道係数')).toBeVisible();
  await expect(page.getByLabel('材質の密度 (kg/m³)', { exact: true })).toBeHidden();
  await page.getByLabel('初速 (m/s)', { exact: true }).fill('800');
  const carried = page.getByRole('table', { name: results }).getByRole('row', { name: /到達距離/ });
  // A 9.7 g bullet of G7 0.200 at 800 m/s carries kilometres rather than hundreds of metres.
  await expect(carried).toContainText('4,057 m');
  await page.getByText('yd', { exact: true }).click();
  await expect(carried).toContainText('4,437 yd');
  // The rule of thumb belongs to lead spheres, so it goes away with the pellet.
  await expect(page.getByText('Journée の経験則では', { exact: false })).toBeHidden();
});

test('refuses to let the distance be read as a safe distance, and names its sources', async ({ page }) => {
  await expect(
    page.getByText(
      'ここまで届き得るという距離です。この先が安全という意味ではなく、安全距離の根拠にもなりません。矢先の確認、バックストップ、射線の管理の代わりにはなりません。',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^跳弾・地形と法令/ })).toContainText('跳弾・風・地形は含みません');
  await open(page, /^計算方法と出典/);
  await open(page, /^跳弾・地形と法令/);
  await expect(page.getByText('実際の到達距離は計算値より短くなりがちです', { exact: false })).toBeVisible();
  await expect(page.getByText('跳弾があり得る場所ではこの計算は上限になりません', { exact: false })).toBeVisible();
  await expect(page.getByText('NRA Range Services', { exact: false })).toBeVisible();
  await expect(page.getByText('DA PAM 385-63', { exact: false })).toBeVisible();
  await expect(page.getByText('封じ込めを設計するための資料ではありません', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '言語を選択' }).click();
  await page.getByRole('menuitem', { name: 'English' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('It does not make anything beyond it safe', { exact: false })).toBeVisible();
});

test('warns about impossible input without refusing to calculate it', async ({ page }) => {
  await page.getByLabel('初速 (m/s)', { exact: true }).fill('');
  await expect(page.getByText('エラーのある欄を直してください。')).toBeVisible();
  await page.getByLabel('初速 (m/s)', { exact: true }).fill('5000');
  await expect(page.getByText('実在の小火器の範囲外の入力があります', { exact: false })).toBeVisible();
  const carried = page.getByRole('table', { name: results }).getByRole('row', { name: /到達距離/ });
  await expect(carried).not.toContainText('—');
});

test('reflows at a narrow viewport and returns to the Labs list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { name: /Labs/ })).toBeVisible();
});
