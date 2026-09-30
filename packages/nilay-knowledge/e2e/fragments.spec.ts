import { expect, test } from '@playwright/test';

import { renderContent } from '../lib/content/render';
import { focusContent } from '../lib/focus-content';

const source = {
  type: 'articles' as const,
  slug: 'fragments',
  frontmatter: { title: 'Fragments', published: '2026-09-30', tags: [] },
  content:
    '<span id="old-heading" data-fragment-alias-for="new-heading"></span>\n\n<details><summary>Supplement</summary>\n\n## New heading\n\nSection destination.\n\n</details>',
};

test('alias navigation reveals collapsed content and focuses its canonical heading', async ({ page }) => {
  const { html } = await renderContent(source);
  await page.setContent(
    `<main id="main-content"><h1>Fragments</h1><div style="height:1200px"></div>${html}<div style="height:1200px"></div></main>`,
  );
  await page.evaluate(focusContent, '#old-heading');
  await expect(page.locator('details')).toHaveAttribute('open', '');
  await expect(page.locator('#new-heading')).toBeFocused();
  expect(await page.locator('#new-heading').evaluate((node) => node.getBoundingClientRect().top)).toBeLessThan(100);
});

test('stable authored headings preserve native fragment navigation without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const { html } = await renderContent({
    ...source,
    content: '<h2 id="old-heading">Renamed section</h2>\n\nRetained destination.',
  });
  await page.goto(
    `data:text/html,${encodeURIComponent(`<main><h1>Fragments</h1><div style="height:1200px"></div>${html}</main>`)}#old-heading`,
  );
  await expect(page.locator('#old-heading')).toBeInViewport();
  await context.close();
});

test('native alias fragments reach their canonical section without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const { html } = await renderContent(source);
  await page.goto(
    `data:text/html,${encodeURIComponent(`<main><h1>Fragments</h1><div style="height:1200px"></div>${html}<div style="height:1200px"></div></main>`)}#old-heading`,
  );
  await expect(page.locator('details')).toHaveAttribute('open', '');
  await expect(page.locator('#new-heading')).toBeInViewport();
  await context.close();
});
