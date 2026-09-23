import { test, expect } from './fixtures';

const english = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'English' });

test('carries one language across the whole site', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ようこそ！！' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');

  await english(page).click();
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  // The document says what it is written in, which is what a screen reader pronounces it as.
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Other Services' })).toBeVisible();

  // The same choice, on a page that was never told about it.
  await page.getByRole('link', { name: '[Contact]' }).click();
  await expect(page.getByRole('heading', { name: 'Contact', exact: true })).toBeVisible();
  await expect(page.getByLabel('Title *')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Contact', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('reaches the tools in the language the site is in', async ({ page }) => {
  await page.goto('/');
  await english(page).click();
  await page.getByRole('link', { name: '[Labs]' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hunting and shooting tools (Labs)' })).toBeVisible();

  await page.getByRole('link', { name: 'Maximum Range' }).click();
  // A tool used to keep its own copy of the setting and would have opened in Japanese here.
  await expect(page.getByRole('heading', { name: 'Maximum Range' })).toBeVisible();
  await expect(page.getByLabel('Muzzle velocity', { exact: false })).toBeVisible();

  // And the other way: what a tool is set to is what the site is set to.
  await page.getByRole('button', { name: 'Select language' }).click();
  await page.getByRole('menuitem', { name: '日本語' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '最大到達距離' })).toBeVisible();
  await page.getByRole('link', { name: 'Labs 一覧に戻る' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '狩猟・射撃のツール (Labs)' })).toBeVisible();
});

test('lists the tools inside the site rather than on a screen of its own', async ({ page }) => {
  await page.goto('/labs');
  // The site's own chrome, the same as the front page and the news.
  await expect(page.getByRole('link', { name: '[Home]' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ほかのサービス (Other Services)' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '狩猟・射撃のツール (Labs)' })).toBeVisible();

  // One term per tool, inside the page rather than the whole document.
  const tools = page.getByRole('main').getByRole('term');
  await expect(tools).toHaveCount(29);
  await page.getByRole('link', { name: '弾道の合わせ込み（トゥルーイング）' }).click();
  await expect(page).toHaveURL(/\/labs\/trajectory-truing$/);
});

test('keeps the language a Labs tool was last left in', async ({ page }) => {
  // What a reader chose before the setting belonged to the site is not thrown away.
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'nilay-labs-recoil-v1',
      JSON.stringify({ state: { language: 'en', settings: null }, version: 0 }),
    ),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
