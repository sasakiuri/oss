import { expect, test } from '@playwright/test';

// Assert loading boundaries, not machine-dependent timings. The benchmark reports timings separately.
test('search creates its worker only on demand and reuses it across dialog openings', async ({ page }) => {
  const indexes: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/search-index.json') indexes.push(request.url());
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(page.workers()).toHaveLength(0);
  expect(indexes).toHaveLength(0);
  await page.getByRole('main').getByRole('button', { name: '記事・ニュースを検索' }).click();
  await page.getByRole('searchbox').fill('申請');
  await expect(page.getByRole('dialog').getByRole('link').first()).toBeVisible();
  expect(page.workers()).toHaveLength(1);
  const worker = page.workers()[0];
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog').getByRole('link').first()).toBeVisible();
  expect(page.workers()).toEqual([worker]);
  expect(indexes).toHaveLength(1);
});

test('the species guide reserves image space and defers offscreen full-size photos', async ({ page }) => {
  const images: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'image') images.push(request.url());
  });
  await page.goto('/articles/1403693668/');
  await page.waitForLoadState('networkidle');
  const articleImages = page.locator('.article-content img');
  await expect(articleImages).toHaveCount(94);
  await expect(page.locator('.article-content img[loading="lazy"]')).toHaveCount(93);
  expect(
    await articleImages.evaluateAll((elements) =>
      elements.every(
        (element) => Number(element.getAttribute('width')) > 0 && Number(element.getAttribute('height')) > 0,
      ),
    ),
  ).toBe(true);
  // Browser lazy-loading margins differ; leave room for thumbnails near the viewport.
  expect(images.length).toBeLessThan(65);
  const last = articleImages.last();
  await last.scrollIntoViewIfNeeded();
  await expect
    .poll(() => last.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
    .toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.article-content img[loading="lazy"]')).toHaveCount(0);
  await expect
    .poll(() =>
      articleImages.evaluateAll((elements) => elements.every((image) => (image as HTMLImageElement).complete)),
    )
    .toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('.article-content img[loading="lazy"]')).toHaveCount(93);
});

test('home images use responsive optimization and text needs no downloaded fonts', async ({ page }) => {
  const fonts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fonts.push(request.url());
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(fonts).toHaveLength(0);
  const hero = page.locator('main img').first();
  await expect(hero).toHaveAttribute('sizes', '100vw');
  expect(await hero.evaluate((image: HTMLImageElement) => new URL(image.currentSrc).pathname)).toMatch(
    /^\/_next\/image\/?$/,
  );
  expect(await hero.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  for (const image of await page.locator('main img').all()) {
    await expect(image).toHaveAttribute('srcset', /\/_next\/image/);
    await expect(image).toHaveAttribute('sizes');
  }
});

test('article printing waits for offscreen images before opening the print dialog', async ({ page }) => {
  await page.goto('/articles/1403693668/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printImagesReady = String(
        [...document.querySelectorAll<HTMLImageElement>('.article-content img')].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      );
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/content/articles/1403693668/**', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    const button = page.getByRole('button', { name: 'ページを印刷' });
    await button.click();
    await expect(button).toBeDisabled();
    await expect(page.locator('body')).not.toHaveAttribute('data-print-images-ready');
    release();
    await expect(page.locator('body')).toHaveAttribute('data-print-images-ready', 'true');
    await expect(page.locator('.article-content img[loading="lazy"]')).toHaveCount(93);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('printing retries a failed image download before starting the print dialog', async ({ page }) => {
  await page.goto('/articles/1403693668/');
  await page.waitForLoadState('networkidle');
  const image = page.locator('.article-content img').last();
  const src = await image.getAttribute('src');
  let attempts = 0;
  await page.route(`**${src}`, async (route) => {
    attempts += 1;
    if (attempts === 1) await route.abort();
    else await route.continue();
  });
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printImagesReady = String(
        [...document.querySelectorAll<HTMLImageElement>('.article-content img')].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      );
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  // Use the shortcut so scrolling to the button cannot start the failed request first.
  await page.keyboard.press('Control+p');
  await expect(page.getByRole('status')).toContainText('画像を読み込めませんでした');
  await expect(page.locator('body')).not.toHaveAttribute('data-print-images-ready');
  await page.keyboard.press('Control+p');
  await expect(page.locator('body')).toHaveAttribute('data-print-images-ready', 'true');
  expect(attempts).toBe(2);
});
