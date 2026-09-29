import { expect, test } from '@playwright/test';

import { renderContent } from '../lib/content/render';

for (const type of ['articles', 'news'] as const) {
  test(`decodes authored ${type} img and picture candidates from content URLs`, async ({ page }) => {
    const { html } = await renderContent({
      type,
      slug: 'srcset-regression',
      frontmatter: { title: 'Image fixture', published: '2024-01-01', tags: [] },
      content: [
        '<img alt="Density" src="fallback.svg" srcset="density.svg?size=1#image 1x" loading="eager">',
        '<picture><source type="image/svg+xml" media="(min-width: 1px)"',
        ' srcset="wide.svg?size=2#image 800w" sizes="100vw">',
        '<img alt="Picture" src="picture.svg" loading="eager"></picture>',
      ].join('\n'),
    });
    const assetPath = `/content/${type}/srcset-regression/`;
    await page.route(`**${assetPath}**`, (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60"/></svg>',
      }),
    );
    // Serve real renderer output at an article/news URL; do not depend on corpus edits.
    await page.route(`**/${type}/srcset-regression/`, (route) =>
      route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>${html}</body></html>` }),
    );
    await page.goto(`/${type}/srcset-regression/`);
    const images = page.locator('img');
    await expect(images).toHaveCount(2);
    const expected = [
      new URL(`${assetPath}density.svg?size=1#image`, page.url()).href,
      new URL(`${assetPath}wide.svg?size=2#image`, page.url()).href,
    ];
    const decoded = await images.evaluateAll(async (elements) =>
      Promise.all(
        elements.map(async (element) => {
          const image = element as HTMLImageElement;
          await image.decode();
          return { src: image.currentSrc, loaded: image.naturalWidth > 0 };
        }),
      ),
    );
    expect(decoded).toEqual(expected.map((src) => ({ src, loaded: true })));
    await expect(page.locator('[data-image-zoom]').first()).toHaveAttribute('href', `${assetPath}fallback.svg`);
    await page.emulateMedia({ media: 'print' });
    const printed = await images.evaluateAll(async (elements) =>
      Promise.all(
        elements.map(async (element) => {
          const image = element as HTMLImageElement;
          await image.decode();
          return image.currentSrc;
        }),
      ),
    );
    expect(printed).toEqual(expected);
  });
}
