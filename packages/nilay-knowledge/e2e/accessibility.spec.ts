// cspell:words menuitemradio
import { readdirSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('the visible search shortcut is included in its accessible name', async ({ page }) => {
  await page.goto('/articles/');
  const results = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
  expect(results.violations).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });
    for (const route of [
      '/',
      '/articles/',
      '/news/',
      '/about/',
      ...readdirSync('content/articles', { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `/articles/${entry.name}/`),
      '/news/20220128/',
      '/missing-page/',
    ]) {
      test(`accessible page ${route}`, async ({ page }) => {
        await page.goto(route);
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expectNoPageOverflow(page);
        await audit(page);
      });
    }

    test('search traps focus, announces results, supports Escape and restores the opener', async ({ page }) => {
      await page.goto('/');
      const opener = page.getByRole('main').getByRole('button', { name: '記事・ニュースを検索' });
      await opener.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: '記事・ニュースを検索' });
      const input = dialog.getByRole('combobox', { name: '検索キーワード' });
      await expect(input).toBeFocused();
      await input.fill('申請');
      await expect(dialog.getByRole('status')).toContainText('件の検索結果');
      const last = dialog.getByRole('listbox').getByRole('option').last();
      await last.focus();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: '検索を閉じる' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(last).toBeFocused();
      await audit(page);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(opener).toBeFocused();
    });

    test('image enlargement is keyboard operable and keeps focus inside the dialog', async ({ page }) => {
      await page.goto('/articles/1378038316/');
      const opener = page.getByRole('button', { name: '猟銃等取扱読本を拡大' });
      await opener.focus();
      await page.keyboard.press('Space');
      const dialog = page.getByRole('dialog', { name: '画像を拡大' });
      const close = dialog.getByRole('button', { name: '拡大画像を閉じる' });
      await expect(close).toBeFocused();
      const zoom = dialog.getByRole('button', { name: '画像を拡大・縮小' });
      await expect(zoom).toBeEnabled();
      await page.keyboard.press('Tab');
      await expect(zoom).toBeFocused();
      const image = dialog.getByRole('img');
      const initialWidth = (await image.boundingBox())!.width;
      await page.keyboard.press('Enter');
      await expect(zoom).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(initialWidth * 1.5);
      await page.keyboard.press('Tab');
      await expect(dialog.locator('p[tabindex]')).toBeFocused();
      await page.keyboard.press('Tab');
      const canvas = dialog.getByRole('region', { name: '画像（拡大後は矢印キーで移動できます）' });
      await expect(canvas).toBeFocused();
      const initialPosition = (await image.boundingBox())!.y;
      await page.keyboard.press('ArrowDown');
      await expect.poll(async () => (await image.boundingBox())!.y).not.toBe(initialPosition);
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(canvas).toBeFocused();
      await audit(page);
      await page.keyboard.press('Escape');
      await expect(opener).toBeFocused();
      await page.keyboard.press('Enter');
      await close.click();
      await expect(opener).toBeFocused();
    });
  });
}

test('skip link transfers keyboard focus and the next Tab enters the content', async ({ page }) => {
  await page.goto('/articles/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'メインコンテンツへスキップ' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await expect(skip).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.getByRole('main').evaluate((main) => main.contains(document.activeElement))).toBe(true);
});

test.describe('touch image zoom', () => {
  test.use({ hasTouch: true });
  test('tapping an image zooms it without closing the dialog', async ({ page }) => {
    await page.goto('/articles/1403693668/');
    await page.locator('.prose img.content-illustration').first().tap();
    const dialog = page.getByRole('dialog', { name: '画像を拡大' });
    const zoom = dialog.getByRole('button', { name: '画像を拡大・縮小' });
    await expect(zoom).toBeEnabled();
    await dialog.getByRole('img').tap();
    await expect(zoom).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog).toBeVisible();
  });
});

test('share popover removes closed links from tab order and restores focus with Escape', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'SNSで共有' });
  await expect(page.getByRole('link', { name: /Twitterで共有/ })).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Twitterで共有/ })).toBeFocused();
  await expectNoPageOverflow(page);
  for (const link of await page.getByRole('dialog', { name: '共有先' }).getByRole('link').all()) {
    await expect(link).toBeInViewport();
  }
  await audit(page);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('share popover dismisses when another control is clicked without stealing its focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'SNSで共有' });
  await trigger.click();
  const popover = page.getByRole('dialog', { name: '共有先' });
  await popover.getByRole('link').first().focus();
  const theme = page.getByRole('button', { name: '表示テーマを選ぶ' });
  await theme.click();
  await expect(popover).not.toBeVisible();
  await expect(page.getByRole('menu')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(theme).toBeFocused();
  await trigger.click();
  await expect(popover).toBeVisible();
  await trigger.click();
  await expect(popover).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

for (const shortcut of ['Control+k', 'Meta+k']) {
  test(`search opens from a share link with ${shortcut} and restores a connected control`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'SNSで共有' }).click();
    const popover = page.getByRole('dialog', { name: '共有先' });
    await popover.getByRole('link').first().focus();
    await page.keyboard.press(shortcut);
    const search = page.getByRole('dialog', { name: '記事・ニュースを検索' });
    await expect(search.getByRole('combobox', { name: '検索キーワード' })).toBeFocused();
    await expect(popover).not.toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: '記事・ニュースを検索 Ctrl / ⌘ K', exact: true }).first(),
    ).toBeFocused();
  });
}

test('mobile menu, TOC and short-viewport search remain keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/articles/1378038316/');
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  await menu.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'ナビゲーションメニュー' });
  await expect(dialog.getByRole('button', { name: 'メニューを閉じる' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: '通信販売' })).toBeFocused();
  await audit(page);
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  const toc = page.getByRole('navigation', { name: '目次', exact: true });
  await toc.getByRole('button').click();
  const link = toc.getByRole('link').first();
  const href = await link.getAttribute('href');
  await link.focus();
  await page.keyboard.press('Enter');
  const heading = page.locator(`[id=${JSON.stringify(decodeURIComponent(href!.slice(1)))}]`);
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(56);
  await page.setViewportSize({ width: 320, height: 256 });
  await page.getByRole('button', { name: '記事・ニュースを検索' }).click();
  await page.getByRole('combobox', { name: '検索キーワード' }).fill('申請');
  const results = page.getByRole('dialog').getByRole('listbox').getByRole('option');
  await expect(results.first()).toBeVisible();
  await results.last().focus();
  await expect(results.last()).toBeInViewport();
  await expectNoPageOverflow(page);
  await page.keyboard.press('Escape');
});

test('reduced motion, forced colors and print retain usable controls and article images', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.goto('/articles/1378038316/');
  const image = page.getByRole('button', { name: '猟銃等取扱読本を拡大' });
  await image.focus();
  await expect(image).toHaveCSS('outline-style', 'solid');
  expect(
    await image.getByRole('img').evaluate((img) => parseFloat(getComputedStyle(img).transitionDuration)),
  ).toBeLessThanOrEqual(0.00001);
  await page.getByRole('button', { name: 'トップへ戻る' }).click();
  await expect(page.locator('#site-header')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: '表示テーマを選ぶ' }).click();
  await page.getByRole('menuitemradio', { name: 'ダーク', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.emulateMedia({ media: 'print', forcedColors: 'none' });
  await expect(page.locator('article header').getByRole('link', { name: 'イントロダクション' })).toHaveCSS(
    'color',
    'rgb(0, 0, 0)',
  );
  await expect(image.getByRole('img')).toBeVisible();
  await expect(page.getByRole('button', { name: '共有・印刷' })).not.toBeVisible();
});

test('selecting a search section transfers focus to the destination heading', async ({ page }) => {
  await page.goto('/articles/1378038316/');
  await page.getByRole('button', { name: '記事・ニュースを検索' }).click();
  await page.getByRole('combobox', { name: '検索キーワード' }).fill('申請書');
  const result = page
    .getByRole('dialog')
    .getByRole('listbox')
    .getByRole('option')
    .filter({ hasText: '申請・申込別' })
    .first();
  await result.focus();
  const href = await result.getAttribute('href');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(encodeURIComponent('申請申込別')));
  const id = decodeURIComponent(href!.split('#')[1]!);
  await expect(page.locator(`[id=${JSON.stringify(id)}]`)).toBeFocused();
  await page.getByRole('button', { name: '記事・ニュースを検索' }).click();
  await page
    .getByRole('dialog')
    .getByRole('listbox')
    .getByRole('option')
    .filter({ hasText: '申請・申込別' })
    .first()
    .click();
  await expect(page.locator(`[id=${JSON.stringify(id)}]`)).toBeFocused();
});

test('page navigation focuses the new title from desktop links, the mobile menu and article navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '案内所' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'メニューを開く' }).click();
  await page.getByRole('dialog').getByRole('link', { name: '記事一覧' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  // Selecting the current page still hands reading focus back to its title.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'メニューを開く' }).click();
  await page.getByRole('dialog').getByRole('link', { name: '記事一覧' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  await page.goto('/articles/1378038316/');
  await page
    .getByRole('navigation', { name: '記事の移動' })
    .getByRole('link', { name: /次の記事/ })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('text enlargement and spacing keep navigation, breadcrumbs and theme choices within the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const route of ['/', '/articles/1378038316/', '/about/']) {
    await page.goto(route);
    await page.addStyleTag({
      content: `
      html { font-size: 200% !important; }
      * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }
      p { margin-bottom: 2em !important; }
    `,
    });
    await expectNoPageOverflow(page);
    if (route === '/') {
      const card = page
        .getByRole('region', { name: '手続き・資料を探す' })
        .getByRole('link', { name: /^狩猟鳥獣図鑑/ });
      expect(
        await card.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const text = range.getBoundingClientRect();
          const bounds = element.getBoundingClientRect();
          return text.top >= bounds.top && text.bottom <= bounds.bottom;
        }),
      ).toBe(true);
    }
    const theme = page.getByRole('button', { name: '表示テーマを選ぶ' });
    await expect(theme).toBeInViewport();
    await theme.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: '表示テーマ' });
    await expect(menu).toBeVisible();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitemradio', { name: 'システム既定' })).toBeFocused();
    await expect(menu.getByRole('menuitemradio', { name: 'システム既定' })).toBeInViewport();
    await expectNoPageOverflow(page);
    await audit(page);
    await page.keyboard.press('Escape');
    await expect(theme).toBeFocused();
    if (route.startsWith('/articles/')) {
      const toc = page.getByRole('navigation', { name: '目次', exact: true });
      await toc.getByRole('button').click();
      const link = toc.getByRole('link').first();
      await link.focus();
      await expect(link).toBeInViewport();
      await page.keyboard.press('Enter');
      const heading = page.locator('.article-content :focus');
      await expect(heading).toBeVisible();
      expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(
        (await page.locator('#site-header').boundingBox())!.height,
      );
    }
  }
});

test('retrying search keeps focus on the input after the retry button disappears', async ({ page }) => {
  let requests = 0;
  await page.route('**/search-index.json', async (route) => {
    if (++requests === 1) await route.fulfill({ status: 503, body: '' });
    else await route.continue();
  });
  await page.goto('/');
  await page.getByRole('main').getByRole('button', { name: '記事・ニュースを検索' }).click();
  const dialog = page.getByRole('dialog');
  const retry = dialog.getByRole('button', { name: '再試行' });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('combobox', { name: '検索キーワード' })).toBeFocused();
  await expect(dialog.getByRole('status')).toContainText('キーワードを入力');
  await page.keyboard.type('test');
  await expect(dialog.getByRole('combobox', { name: '検索キーワード' })).toHaveValue('test');
});

test('transparent comparison illustrations retain their canvas in dark mode and the image viewer', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' });
  await page.goto('/articles/1403693668/');
  const illustration = page.locator('.prose img.content-illustration').first();
  await expect(illustration).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await illustration.click();
  const enlarged = page.getByRole('dialog').getByRole('img');
  await expect(enlarged).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await audit(page);
});

test('browser history restores scroll without moving focus to an offscreen title', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/articles/1378038316/');
  await page.evaluate(() => document.fonts.ready);
  await page
    .getByRole('navigation', { name: '記事の移動' })
    .getByRole('link', { name: /次の記事/ })
    .focus();
  const scrollPosition = await page.evaluate(() => window.scrollY);
  expect(scrollPosition).toBeGreaterThan(1000);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const nextUrl = page.url();
  const nextScrollPosition = await page.evaluate(() => window.scrollY);
  await page.goBack();
  // Allow a one-line difference from browser scroll anchoring on history restoration.
  await expect
    .poll(() => page.evaluate((position) => Math.abs(window.scrollY - position), scrollPosition))
    .toBeLessThan(24);
  await expect(
    page.getByRole('navigation', { name: '記事の移動' }).getByRole('link', { name: /次の記事/ }),
  ).toBeInViewport();
  await expect(page.getByRole('heading', { level: 1 })).not.toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(nextUrl);
  await expect
    .poll(() => page.evaluate((position) => Math.abs(window.scrollY - position), nextScrollPosition))
    .toBeLessThan(24);
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '案内所' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
});

test('the mobile menu reflows with enlarged and widely spaced text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.addStyleTag({
    content: `
      html { font-size: 200% !important; }
      * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }
    `,
  });
  const opener = page.getByRole('button', { name: 'メニューを開く' });
  await opener.click();
  const menu = page.getByRole('dialog', { name: 'ナビゲーションメニュー' });
  await expect(menu.getByRole('button', { name: 'メニューを閉じる' })).toBeFocused();
  expect(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await menu.getByRole('link', { name: '通信販売' }).focus();
  await expect(menu.getByRole('link', { name: '通信販売' })).toBeInViewport();
  await audit(page);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});
