import { expect, test } from '@playwright/test';

test('the introductory shooting guide opens the shooting article', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^射撃を始める/ }).click();
  await expect(page).toHaveURL(/\/articles\/1404015637\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('クレー射撃について');
});

test('the directory filters by subject and the article links back to that subject', async ({ page }) => {
  await page.goto('/articles/');
  await page.getByRole('navigation', { name: '記事の分野' }).getByRole('link', { name: '標的射撃' }).click();
  await expect(page).toHaveURL(/\/articles\/\?category=shooting#shooting$/);
  await expect(page.getByRole('combobox', { name: 'カテゴリー' })).toHaveValue('shooting');
  const subject = page.getByRole('heading', { name: /^標的射撃 \d+件$/ });
  await expect(subject).toBeInViewport();
  const header = await page.locator('#site-header').boundingBox();
  expect((await subject.boundingBox())!.y).toBeGreaterThanOrEqual(header!.height);
  await page.getByRole('link', { name: 'クレー射撃について', exact: true }).click();
  await page.locator('article header').getByRole('link', { name: '標的射撃' }).click();
  await expect(page).toHaveURL(/\/articles\/\?category=shooting#shooting$/);
  await expect(subject).toBeInViewport();
});

test('directory category links reveal the filtered heading during slow rendering', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CPU throttling requires Chromium.');
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/articles/');
  for (const [name, category] of [
    ['標的射撃', 'shooting'],
    ['狩猟', 'hunting'],
  ] as const) {
    await page.getByRole('navigation', { name: '記事の分野' }).getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(`/articles/?category=${category}#${category}`);
    await expect(page.getByRole('combobox', { name: 'カテゴリー' })).toHaveValue(category);
    const heading = page.locator(`h2#${category}`);
    await expect(heading).toBeInViewport();
    await expect
      .poll(async () => (await heading.boundingBox())!.y)
      .toBeGreaterThanOrEqual((await page.locator('#site-header').boundingBox())!.height);
  }
});

test('returning from a category link restores the directory reading position', async ({ page }) => {
  await page.goto('/articles/?category=hunting#hunting');
  await expect(page.getByRole('combobox', { name: 'カテゴリー' })).toHaveValue('hunting');
  await expect(page.locator('h2#hunting')).toBeInViewport();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const link = page.getByRole('navigation', { name: '記事の分野' }).getByRole('link', { name: '標的射撃' });
  // Bringing the link into view can scroll a narrow viewport before navigation.
  await link.scrollIntoViewIfNeeded();
  const readingPosition = await page.evaluate(() => window.scrollY);
  await link.click();
  await expect(page.getByRole('combobox', { name: 'カテゴリー' })).toHaveValue('shooting');
  await expect(page.locator('h2#shooting')).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(/\/articles\/\?category=hunting#hunting$/);
  await expect(page.getByRole('combobox', { name: 'カテゴリー' })).toHaveValue('hunting');
  // Wait past the directory's animation-frame correction before checking restoration.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(readingPosition);
});

test('the floating action button contains sharing and printing, and publication is labelled accurately', async ({
  page,
}) => {
  await page.goto('/articles/1564639585/');
  await expect(page.locator('article header time')).toContainText('公開');
  const share = page.getByRole('button', { name: '共有・印刷' });
  await expect(page.getByRole('button', { name: 'ページを印刷' })).toHaveCount(0);
  await share.click();
  await expect(share).toBeInViewport();
  await expect(page.getByRole('button', { name: 'ページを印刷' })).toBeInViewport();
  const email = page.getByRole('link', { name: 'メールで送る' });
  await expect(email).toBeInViewport();
  await expect(email).toHaveAttribute('href', /^mailto:\?subject=/);
  const emailBox = (await email.boundingBox())!;
  const printBox = (await page.getByRole('button', { name: 'ページを印刷' }).boundingBox())!;
  expect(printBox.y).toBe(emailBox.y);
  expect(printBox.height).toBe(emailBox.height);
  expect(
    await share.evaluate((button) => {
      for (let element: Element | null = button; element; element = element.parentElement) {
        if (getComputedStyle(element).position === 'fixed') return true;
      }
      return false;
    }),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(share).toBeFocused();
  await expect(page.getByRole('button', { name: 'ページを印刷' })).toHaveCount(0);
});

test('article corrections open the matching GitHub source and prefilled issue', async ({ page }) => {
  for (const route of ['/articles/1378038316/', '/news/20150215/']) {
    await page.goto(route);
    const title = await page.getByRole('heading', { level: 1 }).innerText();
    const contribution = page.getByRole('complementary', { name: 'この記事の修正' });
    const issue = new URL((await contribution.getByRole('link', { name: /^修正を依頼/ }).getAttribute('href'))!);
    expect(issue.searchParams.get('title')).toBe(`[記事の修正] ${title}`);
    expect(issue.searchParams.get('body')).toContain(`https://knowledge.nilay.jp${route}`);
    await expect(contribution.getByRole('link', { name: /^編集して提案/ })).toHaveAttribute(
      'href',
      `https://github.com/sasakiuri/oss/edit/1.x/packages/nilay-knowledge/content${route}index.md`,
    );
  }
});

test('directory search restores focus to its opener', async ({ page }) => {
  await page.goto('/articles/');
  const opener = page.getByRole('main').getByRole('button', { name: '記事・ニュースを検索' });
  await opener.click();
  await expect(page.getByRole('combobox', { name: '検索キーワード' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});
