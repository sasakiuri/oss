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
  await page.getByRole('combobox', { name: '検索キーワード' }).fill('申請');
  await expect(page.getByRole('dialog').getByRole('listbox').getByRole('option').first()).toBeVisible();
  expect(page.workers()).toHaveLength(1);
  const worker = page.workers()[0];
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog').getByRole('listbox').getByRole('option').first()).toBeVisible();
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
  const featuredImage = page.locator('main img').first();
  await expect(featuredImage).toHaveAttribute('sizes', '(min-width: 640px) 200px, 104px');
  const imagePreload = page.locator('link[rel="preload"][as="image"]');
  await expect(imagePreload).toHaveAttribute('imagesizes', '(min-width: 640px) 200px, 104px');
  expect(await imagePreload.getAttribute('imagesrcset')).toBe(await featuredImage.getAttribute('srcset'));
  expect(await featuredImage.evaluate((image: HTMLImageElement) => new URL(image.currentSrc).pathname)).toMatch(
    /^\/_next\/image\/?$/,
  );
  expect(await featuredImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(
    true,
  );
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
    await page.getByRole('button', { name: '共有・印刷' }).click();
    const button = page.getByRole('button', { name: 'ページを印刷' });
    await button.click();
    await expect(button).toBeDisabled();
    await expect(page.locator('body')).not.toHaveAttribute('data-print-images-ready');
    release();
    // Printing allows 15 seconds for native image loading/decoding, then reports failure.
    await expect(page.locator('body')).toHaveAttribute('data-print-images-ready', 'true', { timeout: 20_000 });
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
  // Allow the application's 15-second image preparation deadline plus assertion scheduling.
  await expect(page.locator('body')).toHaveAttribute('data-print-images-ready', 'true', { timeout: 20_000 });
  expect(attempts).toBe(2);
});

test('responsive article images keep originals for zoom and print', async ({ page }) => {
  await page.goto('/articles/1378038316/');
  const image = page.locator('.article-content img').first();
  await expect(image).toHaveAttribute('srcset', /\/_next\/image/);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.currentSrc)).toContain('/_next/image');
  const original = await image.getAttribute('data-original-src');
  const sourceSet = await image.getAttribute('srcset');
  await page.getByRole('button', { name: '猟銃・空気銃を所持するまでの流れを拡大' }).click();
  const dialog = page.getByRole('dialog', { name: '画像を拡大' });
  await expect(dialog.getByRole('button', { name: '画像を拡大・縮小' })).toBeEnabled();
  await expect(dialog.getByRole('img').first()).toHaveAttribute('src', original!);
  expect(await dialog.locator('.pswp').evaluate((element) => getComputedStyle(element).position)).toBe('absolute');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(image).not.toHaveAttribute('srcset');
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => new URL(element.currentSrc).pathname))
    .toBe(original);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(image).toHaveAttribute('srcset', sourceSet!);
});

test('image links work before hydration and support keyboard zoom after hydration', async ({ browser, page }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: 'http://127.0.0.1:3275' });
  try {
    const staticPage = await context.newPage();
    await staticPage.goto('/articles/1378038316/');
    const imageLink = staticPage.getByRole('link', { name: '猟銃・空気銃を所持するまでの流れを拡大' });
    await expect(imageLink).toBeVisible();
    const original = await imageLink.getAttribute('href');
    await imageLink.click();
    await expect(staticPage).toHaveURL(new RegExp(`${original!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  } finally {
    await context.close();
  }

  await page.goto('/articles/1378038316/');
  const trigger = page.getByRole('button', { name: '猟銃・空気銃を所持するまでの流れを拡大' });
  for (const key of ['Enter', 'Space']) {
    await trigger.focus();
    await page.keyboard.press(key);
    await expect(page.getByRole('dialog', { name: '画像を拡大' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});

test('offscreen field-guide entries remain reachable by fragment and fully rendered for print', async ({ page }) => {
  await page.goto('/articles/1403693668/');
  const entries = page.locator('.prose > .flex.border-t');
  expect(await entries.count()).toBeGreaterThan(40);
  const last = entries.last();
  expect(await last.evaluate((element) => getComputedStyle(element).contentVisibility)).toBe('visible');
  const target = last.locator('[id]').first();
  const id = await target.getAttribute('id');
  await page.evaluate((id) => {
    window.location.hash = encodeURIComponent(id!);
  }, id);
  await expect(target).toBeInViewport();
  await expect(last.locator('img')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  expect(
    await entries.evaluateAll((elements) =>
      elements.every((element) => getComputedStyle(element).contentVisibility === 'visible'),
    ),
  ).toBe(true);
});

test('browser text search can reveal an offscreen field-guide entry', async ({ page }) => {
  await page.goto('/articles/1403693668/');
  expect(
    await page.evaluate(() =>
      (window as unknown as { find(text: string): boolean }).find('人畜共通感染症である野兎病の菌'),
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const selection = window.getSelection();
        if (!selection?.rangeCount) return false;
        const bounds = selection.getRangeAt(0).getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
      }),
    )
    .toBe(true);
});

test('article code keeps its spacing when styles arrive after the site stylesheet', async ({ page }) => {
  await page.goto('/articles/1378038316/');
  await page.addStyleTag({ url: '/content-styles/github-dark.css' });
  const padding = await page.locator('.prose').evaluate((article) => {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'hljs';
    code.textContent = 'const example = true;';
    pre.append(code);
    article.append(pre);
    return getComputedStyle(code).padding;
  });
  expect(padding).toBe('0px');
});

test('browser history restores the reading position after a full navigation', async ({ page }) => {
  await page.goto('/articles/1403693668/');
  const target = page.locator('.prose > .flex.border-t').nth(23).locator('[id]').first();
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  // A full navigation leaves focus unchanged; clicking the sticky header can itself scroll the page.
  await page.goto('/articles/');
  await expect(page).toHaveURL(/\/articles\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/articles\/1403693668\/$/);
  await expect(target).toBeInViewport();
});
