import { expect, test } from '@playwright/test';

for (const { path, title } of [
  { path: '/articles/1378038316/', title: '猟銃・空気銃所持許可の新規取得手順' },
  { path: '/news/20220128/', title: '公道上で猟銃を発砲　男3人を逮捕　青森県' },
]) {
  test(`title reflows without altering searchable or copied text: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(path);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(title);
    await expect(heading).toHaveAccessibleName(title);
    await expect(heading.locator('wbr').first()).toBeAttached();
    const wideHeight = (await heading.boundingBox())!.height;

    await page.setViewportSize({ width: 320, height: 568 });
    await expect.poll(async () => (await heading.boundingBox())!.height).toBeGreaterThan(wideHeight);
    const titleText = heading.locator('span');
    await expect(titleText).toHaveCSS('word-break', 'keep-all');
    await expect(titleText).toHaveCSS('overflow-wrap', 'anywhere');
    const selection = await heading.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.toString();
    });
    expect(selection).toBe(title);

    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(
      await heading.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = element.getBoundingClientRect();
        return [...range.getClientRects()].every(
          (rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
        );
      }),
    ).toBe(true);
  });
}
