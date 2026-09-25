import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__printCount', { value: 0, writable: true });
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
  await page.goto('/labs/trap-sign');
});

test('makes a sign with the details given and prints it without saving them', async ({ page }) => {
  await expect(page).toHaveTitle(/わな設置中の注意看板/);
  await page.getByText('くくりわな設置中').first().click();
  await page.getByLabel('連絡先（任意）').fill('000-0000-0000');
  const preview = page.getByRole('img', { name: '印刷する看板のプレビュー' });
  await expect(preview).toContainText('くくりわな設置中');
  await expect(preview).toContainText('連絡先：000-0000-0000');
  await page.getByRole('button', { name: '印刷する' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printCount: number }).__printCount)).toBe(1);
  const stored = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(stored).not.toContain('000-0000-0000');
});
