import { expect, test } from '@playwright/test';

import { siteConfig } from '../lib/config';
import { createContentRepository } from '../lib/content/repository';

test.use({ javaScriptEnabled: false });

test('every sitemap page exposes unique metadata and consistent structured data without JavaScript', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'HTTP and server-rendered metadata are browser-independent.');
  test.slow();
  // Parse the delivered HTML without loading its resources or hydrating it.
  await page.route('**/*', (route) => route.abort());
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
  const repository = createContentRepository(`${process.cwd()}/content`);
  const paths = [
    '/',
    '/articles/',
    '/news/',
    '/about/',
    ...(await repository.listSlugs('articles')).map((slug) => `/articles/${slug}/`),
    ...(await repository.listSlugs('news')).map((slug) => `/news/${slug}/`),
  ];
  expect(urls.toSorted()).toEqual(paths.map((path) => `${siteConfig.siteUrl}${path}`).toSorted());
  const descriptions = new Set<string>();
  const titles = new Set<string>();
  const linksByPage = new Map<string, Set<string>>();

  for (const url of urls) {
    const path = new URL(url).pathname;
    await test.step(path, async () => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(response.headers()['x-robots-tag'] ?? '').not.toContain('noindex');
      await page.setContent(await response.text(), { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
      await expect(page.locator('h1')).toHaveCount(1);
      const canonical = page.locator('head link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
      await expect(canonical).toHaveAttribute('href', url);
      const title = await page.title();
      expect(title).toContain(siteConfig.title);
      expect(titles.has(title), `Duplicate title: ${url}`).toBe(false);
      titles.add(title);
      const descriptionTags = page.locator('head meta[name="description"]');
      await expect(descriptionTags).toHaveCount(1);
      const description = (await descriptionTags.getAttribute('content'))!;
      expect(description.length).toBeGreaterThan(10);
      expect(description).not.toMatch(/<\/?(?:style|script|table)|<!--|!\[/);
      expect(descriptions.has(description), `Duplicate description: ${url}`).toBe(false);
      descriptions.add(description);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url);
      for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]']) {
        await expect(page.locator(selector)).toHaveAttribute('content', description);
      }
      await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'ja_JP');
      const robots = await page
        .locator('meta[name="robots"]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('content')).join(', '));
      expect(robots).not.toMatch(/noindex|nofollow/);
      expect(robots).toContain('max-image-preview:large');
      const schemas = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent!)));
      const breadcrumb = schemas.find((schema) => schema['@type'] === 'BreadcrumbList');
      if (path === '/') {
        expect(breadcrumb).toBeUndefined();
        expect(schemas.find((schema) => schema['@type'] === 'WebSite')?.url).toBe(url);
      } else {
        expect(breadcrumb.itemListElement.length).toBeGreaterThanOrEqual(2);
        expect(breadcrumb.itemListElement.at(-1).item).toBe(url);
        for (const item of breadcrumb.itemListElement) expect(urls).toContain(item.item);
      }
      if (/^\/(articles|news)\/[^/]+\/$/.test(path)) {
        const schema = schemas.find((entry) => ['Article', 'NewsArticle'].includes(entry['@type']));
        expect(schema).toMatchObject({
          '@type': path.startsWith('/news/') ? 'NewsArticle' : 'Article',
          url,
          description,
          mainEntityOfPage: { '@id': url },
          headline: await page.locator('h1').innerText(),
        });
        expect(schema.datePublished).toBe(
          await page.locator('meta[property="article:published_time"]').getAttribute('content'),
        );
        expect(schema.dateModified).toBe(
          await page.locator('meta[property="article:modified_time"]').getAttribute('content'),
        );
        expect(schema.image).toBe(await page.locator('meta[property="og:image"]').getAttribute('content'));
        await expect(page.locator('article a[rel="author"]')).toHaveAttribute('href', '/about/');
      }
      const links = await page
        .locator('a[href]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')!));
      const destinations = new Set<string>();
      for (const href of links) {
        const link = new URL(href, url);
        if (link.origin === siteConfig.siteUrl) destinations.add(`${link.origin}${link.pathname.replace(/\/?$/, '/')}`);
      }
      linksByPage.set(url, destinations);
    });
  }
  // Traverse from home: self-links and disconnected groups must not hide orphan pages.
  const reachable = new Set<string>();
  const pending = [`${siteConfig.siteUrl}/`];
  while (pending.length) {
    const url = pending.pop()!;
    if (reachable.has(url)) continue;
    reachable.add(url);
    pending.push(...(linksByPage.get(url) ?? []));
  }
  for (const url of urls) expect(reachable, `Orphan page: ${url}`).toContain(url);
});

test('crawler directives permit published pages and images while excluding source and search data', async ({
  request,
}) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('User-Agent: *');
  expect(await robots.text()).toContain('Allow: /');
  expect(await robots.text()).toContain(`Sitemap: ${siteConfig.siteUrl}/sitemap.xml`);
  expect(await robots.text()).not.toContain('Disallow: /');
  for (const path of [
    '/content/articles/1378038316/index.md',
    '/content/news/20220128/index.md',
    '/search-index.json',
    '/pdf-search-index.json',
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['x-robots-tag']).toBe('noindex');
  }
  const image = await request.get('/content/articles/1378038316/6878fe18-66b0-4f94-8d46-b57acec979a1.png');
  expect(image.status()).toBe(200);
  expect(image.headers()['x-robots-tag']).toBeUndefined();
});

test('filtered directories keep the directory canonical and missing content returns 404 with noindex', async ({
  page,
}) => {
  await page.goto('/articles/?category=shooting&tag=クレー射撃');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${siteConfig.siteUrl}/articles/`);
  for (const path of ['/articles/does-not-exist/', '/news/does-not-exist/']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"][content="noindex"]')).toHaveCount(1);
  }
});
