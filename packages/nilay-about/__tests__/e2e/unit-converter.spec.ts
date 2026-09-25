import { test, expect, type Page } from './fixtures';

const row = (page: Page, name: string) => page.getByRole('row', { name: new RegExp(`^${name}`) });

test.beforeEach(async ({ page }) => {
  await page.goto('/labs/unit-converter');
});

test('converts a fill pressure and a torque, and keeps them after reload', async ({ page }) => {
  await expect(page).toHaveTitle(/射撃の単位換算/);
  // 200 bar is 20 MPa and 2900.75 psi (1 psi = 6894.757 Pa).
  await expect(row(page, 'MPa')).toContainText('20');
  await expect(row(page, 'psi')).toContainText('2,900.75');
  await page.getByLabel('量の種類').selectOption('torque');
  await page.getByRole('spinbutton', { name: '値' }).fill('3');
  // 3 N·m is 26.5522 in-lb.
  await expect(row(page, 'in-lb')).toContainText('26.5522');
  await page.reload();
  await expect(page.getByLabel('量の種類')).toHaveValue('torque');
  await expect(page.getByRole('spinbutton', { name: '値' })).toHaveValue('3');
});

test('reads MOA as inches at 100 yards and refuses an angle past a right angle', async ({ page }) => {
  await page.getByLabel('量の種類').selectOption('angle');
  await expect(row(page, 'inch（100 yd で、IPHY）')).toContainText('1.0472');
  await page.getByRole('spinbutton', { name: '値' }).fill('6000');
  await expect(page.getByText('90 度未満の角度を入力してください。')).toBeVisible();
});
