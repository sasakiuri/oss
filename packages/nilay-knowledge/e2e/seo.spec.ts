import { readdir, readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';
import sharp from 'sharp';

import { siteConfig } from '../lib/config';
import { getArticleCategoryPages } from '../lib/content/category-pages';
import { createContentRepository } from '../lib/content/repository';
import { createArticleDirectory } from '../lib/content/taxonomy';

test.use({ javaScriptEnabled: false });

// Live checks must not send analytics or any mutations, including from the one
// historical-document test that explicitly enables JavaScript.
test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await page.route('**/*', (route) => {
    const request = route.request();
    return new URL(request.url()).origin === origin && ['GET', 'HEAD'].includes(request.method())
      ? route.continue()
      : route.abort();
  });
});

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
  const sitemapXml = await sitemap.text();
  const urls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
  const modificationDates = new Map(
    [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((match) => [
      match[1]!,
      match[2]!,
    ]),
  );
  const repository = createContentRepository(`${process.cwd()}/content`);
  const articles = await repository.list('articles');
  const news = await repository.list('news');
  const categories = getArticleCategoryPages(createArticleDirectory(articles));
  const sources = [...articles, ...news];
  const paths = [
    '/',
    '/articles/',
    '/news/',
    '/about/',
    ...categories.map((category) => category.path),
    ...sources.map(({ type, slug }) => `/${type}/${slug}/`),
  ];
  expect(urls.toSorted()).toEqual(paths.map((path) => `${siteConfig.siteUrl}${path}`).toSorted());
  const descriptions = new Set<string>();
  const titles = new Set<string>();
  const linksByPage = new Map<string, Set<string>>();
  const resources = new Set<string>();
  const fragments: { page: string; destination: string; fragment: string }[] = [];
  const idsByPage = new Map<string, Set<string>>();

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
      expect(description).not.toMatch(/<\/?(?:style|script|table)|<!--|!\[/i);
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
        const source = sources.find((item) => `/${item.type}/${item.slug}/` === path)!;
        if (source.frontmatter.image) {
          expect(schema.image).toBe(await page.locator('meta[property="og:image"]').getAttribute('content'));
        } else {
          expect(schema.image).toBeUndefined();
        }
        expect(modificationDates.get(url)).toBe(source.frontmatter.updated ?? source.frontmatter.published);
        for (const field of ['published', 'updated'] as const) {
          const date = source.frontmatter[field];
          if (!date) continue;
          const label = field === 'published' ? '公開' : '更新';
          const visibleDate = new Intl.DateTimeFormat('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).format(new Date(date));
          await expect(page.locator(`article header time[datetime="${date}"]`).filter({ hasText: label })).toHaveText(
            `${visibleDate} ${label}`,
          );
        }
        await expect(page.locator('article a[rel="author"]')).toHaveAttribute('href', '/about/');
      }
      if (path === '/about/') {
        const about = schemas.find((entry) => entry['@type'] === 'AboutPage');
        expect(about).toMatchObject({
          url,
          name: await page.locator('h1').innerText(),
          description,
          mainEntity: {
            '@type': 'Organization',
            '@id': `${siteConfig.siteUrl}/#organization`,
            name: siteConfig.author.name,
            url,
          },
        });
        await expect(page.getByText(`運営・編集：${siteConfig.author.name}`, { exact: true })).toBeVisible();
        for (const profile of about.mainEntity.sameAs) {
          await expect(page.locator(`footer a[href="${profile}"]`)).toHaveCount(1);
        }
      }
      const category = categories.find((item) => item.path === path);
      if (category || path === '/articles/' || path === '/news/') {
        const collection = schemas.find((entry) => entry['@type'] === 'CollectionPage');
        const listedLinks = await page
          .locator('main section ul > li a[href]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute('href')!).filter((href) => /^\/(articles|news)\/[^/]+\/$/.test(href)),
          );
        const expectedItems = category?.articles ?? (path === '/articles/' ? articles : news);
        expect(collection).toMatchObject({
          url,
          name: await page.locator('h1').innerText(),
          description,
          mainEntity: { '@type': 'ItemList', numberOfItems: expectedItems.length },
        });
        const listedUrls = collection.mainEntity.itemListElement.map((item: { url: string }) => item.url);
        expect(listedUrls).toEqual(listedLinks.map((href) => `${siteConfig.siteUrl}${href}`));
        expect([...listedUrls].sort()).toEqual(
          expectedItems.map((item) => `${siteConfig.siteUrl}/${item.type}/${item.slug}/`).sort(),
        );
      }
      if (category) {
        const content = page.getByRole('region', { name: /この分野の記事/ });
        for (const article of category.articles) {
          await expect(content.locator(`a[href="/articles/${article.slug}/"]`)).toBeVisible();
          if (article.description) await expect(content.getByText(article.description, { exact: true })).toBeVisible();
        }
      }
      const links = await page
        .locator('a[href]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')!));
      idsByPage.set(url, new Set(await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id))));
      const destinations = new Set<string>();
      for (const href of links) {
        expect(href, `Concatenated URLs on ${url}`).not.toMatch(/^https?:\/\/[^/]*https?:\/\//i);
        const link = new URL(href, url);
        // Query values may legitimately contain quoted search terms or encoded HTML.
        expect(link.pathname, `HTML embedded in a link path on ${url}`).not.toMatch(
          /(?:%22|")(?:%3e|>)|(?:%3c|<)\/?a(?:%20|\s|%3e|>)/i,
        );
        if (link.origin !== siteConfig.siteUrl) continue;
        const destination = `${link.origin}${link.pathname}`;
        // Check the delivered href, not a normalized copy that could hide redirects.
        if (/^\/(articles|news|about)(\/|$)/.test(link.pathname)) {
          expect(urls, `Noncanonical or missing page linked from ${url}: ${href}`).toContain(destination);
        }
        destinations.add(destination);
        resources.add(`${link.pathname}${link.search}`);
        if (link.hash) fragments.push({ page: url, destination, fragment: link.hash.slice(1) });
      }
      linksByPage.set(url, destinations);
      for (const src of await page
        .locator('img')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')!))) {
        const image = new URL(src, url);
        if (image.origin === siteConfig.siteUrl) resources.add(`${image.pathname}${image.search}`);
      }
      await expect(page.locator('img:not([alt])')).toHaveCount(0);
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
  for (const { page: source, destination, fragment } of fragments) {
    const ids = idsByPage.get(destination);
    if (!ids) continue;
    // Browsers try literal IDs before percent-decoding, including GFM footnotes.
    expect(
      ids.has(fragment) || ids.has(decodeURIComponent(fragment)),
      `Missing anchor: ${source} → ${destination}#${fragment}`,
    ).toBe(true);
  }
  for (const resource of resources) {
    const response = await request.head(resource, { maxRedirects: 0 });
    expect(response.status(), `Broken or redirected internal resource: ${resource}`).toBe(200);
  }
});

test('noncanonical page paths permanently redirect once while preserving query parameters', async ({ request }) => {
  for (const path of ['/articles', '/news/20220128', '/articles/category/getting-started', '/about']) {
    const query = '?utm_source=seo-check';
    const response = await request.get(`${path}${query}`, { maxRedirects: 0 });
    expect([301, 308]).toContain(response.status());
    const destination = new URL(response.headers().location!, response.url());
    expect(destination.pathname).toBe(`${path}/`);
    expect(destination.search).toBe(query);
    expect((await request.get(`${destination.pathname}${destination.search}`, { maxRedirects: 0 })).status()).toBe(200);
  }
});

test.describe('directory structured data with JavaScript', () => {
  test.use({ javaScriptEnabled: true });

  test('only describes the full directory while all articles are visible, including history navigation', async ({
    page,
  }) => {
    const collections = () =>
      page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => JSON.parse(node.textContent!)).filter((schema) => schema['@type'] === 'CollectionPage'),
        );
    await page.goto('/articles/?category=shooting&tag=クレー射撃');
    await expect(page.getByRole('status')).toContainText('中 1件の記事');
    await expect.poll(collections).toHaveLength(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${siteConfig.siteUrl}/articles/`);
    await page.getByRole('button', { name: '絞り込みを解除' }).click();
    await expect(page).toHaveURL(/\/articles\/$/);
    await expect.poll(collections).toHaveLength(1);
    const [collection] = await collections();
    const articles = await createContentRepository(`${process.cwd()}/content`).list('articles');
    expect(collection.mainEntity.numberOfItems).toBe(articles.length);
    await page.goBack();
    await expect(page.getByRole('status')).toContainText('中 1件の記事');
    await expect.poll(collections).toHaveLength(0);
  });
});

test('historical law documents have distinct search metadata and serve the authored source', async ({
  page,
  request,
}) => {
  await page.route('**/*', (route) => route.abort());
  const directory = 'content/articles/1379067191/olds';
  const files = (await readdir(directory)).filter((file) => file.endsWith('.html'));
  expect(files).toHaveLength(4);
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const file of files) {
    const path = `/${directory}/${file}`;
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()['x-robots-tag'] ?? '').not.toContain('noindex');
    const html = await response.text();
    expect(html).toBe(await readFile(`${directory}/${file}`, 'utf8'));
    await page.setContent(html);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    const title = await page.title();
    expect(title).toContain(await page.locator('h1').innerText());
    expect(title).toContain('歴史資料');
    expect(titles.has(title)).toBe(false);
    titles.add(title);
    const description = await page.locator('head meta[name="description"]').getAttribute('content');
    expect(description).toContain('現行法令ではありません');
    expect(descriptions.has(description!)).toBe(false);
    descriptions.add(description!);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', `${siteConfig.siteUrl}${path}`);
    await expect(page.getByRole('link', { name: '法令・通達一覧へ戻る' })).toHaveAttribute(
      'href',
      '/articles/1379067191/',
    );
    await expect(page.getByText('歴史資料（現行法令ではありません）', { exact: true })).toBeVisible();
  }
});

test.describe('historical documents with JavaScript', () => {
  test.use({ javaScriptEnabled: true });

  test('keeps the historical title after the load event', async ({ page }) => {
    const directory = 'content/articles/1379067191/olds';
    for (const file of (await readdir(directory)).filter((file) => file.endsWith('.html'))) {
      await page.goto(`/${directory}/${file}`, { waitUntil: 'load' });
      await expect(page).toHaveTitle(/歴史資料.*Nilay\/Knowledge/);
      await page.getByRole('link', { name: '法令・通達一覧へ戻る' }).click();
      await expect(page).toHaveURL(/\/articles\/1379067191\/$/);
    }
  });
});

test('social images return decodable images at their advertised dimensions', async ({ request }) => {
  for (const [path, width, height] of [
    ['/ogp.png', 1280, 670],
    [`/api/og/?title=${encodeURIComponent('銃を手に入れる & 狩猟の基礎')}`, 1200, 630],
  ] as const) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^image\//);
    expect(response.headers()['x-robots-tag'] ?? '').not.toContain('noindex');
    const image = sharp(await response.body());
    expect(await image.metadata()).toMatchObject({ width, height });
    expect((await image.raw().toBuffer()).length).toBeGreaterThan(0);
  }
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
  for (const path of [
    '/articles/does-not-exist/',
    '/news/does-not-exist/',
    '/articles/category/does-not-exist/',
    '/articles/category/shooting/',
    '/articles/category/uncategorized/',
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  }
});
