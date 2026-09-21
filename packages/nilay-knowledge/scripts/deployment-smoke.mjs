import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export async function checkDeployment({ baseUrl, bypassSecret, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  assert.equal(base.pathname, '/', 'Use a deployment origin without a path');
  assert.ok(!base.username && !base.password && !base.search && !base.hash, 'Use a plain deployment URL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  assert.ok(base.protocol === 'https:' || (local && base.protocol === 'http:'), 'HTTPS is required');
  if (bypassSecret) {
    assert.ok(
      base.hostname.startsWith('nilay-knowledge-website-') && base.hostname.endsWith('.vercel.app'),
      'The automation secret may only be sent to a Knowledge deployment',
    );
  }

  const results = [];
  const headers = bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {};
  async function get(path, contentType) {
    let url = new URL(path, base);
    assert.equal(url.origin, base.origin, 'Checks must remain on the deployment origin');
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetchImpl(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        assert.ok(location, `Missing redirect destination: ${path}`);
        url = new URL(location, url);
        assert.equal(url.origin, base.origin, `Unexpected redirect away from the deployment: ${path}`);
        continue;
      }
      assert.equal(response.status, 200, `${path}: expected HTTP 200, received ${response.status}`);
      assert.match(response.headers.get('content-type') ?? '', contentType, `${path}: unexpected content type`);
      const body = Buffer.from(await response.arrayBuffer());
      assert.ok(body.length > 0, `${path}: empty response`);
      results.push({ path, status: response.status, bytes: body.length });
      return body;
    }
    throw new Error(`Too many redirects: ${path}`);
  }

  const homepage = (await get('/', /text\/html/i)).toString();
  assert.match(homepage, /<main\b/, 'Homepage is missing its main content');
  assert.match(homepage, /application\/rss\+xml/, 'Homepage is missing the RSS link');
  const script = homepage.match(/<script\b[^>]*\bsrc="([^\"]*\/_next\/static\/[^\"]+)"/i)?.[1];
  assert.ok(script, 'Homepage is missing its JavaScript bundle');
  await get(script.replaceAll('&amp;', '&'), /(?:javascript|ecmascript)/i);

  const sitemap = (await get('/sitemap.xml', /(?:application|text)\/xml/i)).toString();
  assert.match(sitemap, /<urlset\b/, 'Invalid sitemap');
  const articlePath = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1]).pathname)
    .find((path) => /^\/articles\/[^/]+\/$/.test(path));
  assert.ok(articlePath, 'Sitemap contains no article');
  const article = (await get(articlePath, /text\/html/i)).toString();
  assert.match(article, /<h1\b/, 'Article is missing its title');
  assert.match(article, /<article\b/, 'Article is missing its content');

  const feed = (await get('/feed.xml', /(?:application|text)\/(?:rss\+)?xml/i)).toString();
  assert.match(feed, /<rss\b/, 'Invalid RSS feed');
  assert.match(feed, /<item>/, 'RSS feed contains no entries');
  const image = await get('/ogp.png', /image\/png/i);
  const generatedImage = await get('/api/og?title=Deployment%20check', /image\/png/i);
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(image.subarray(0, 8).equals(pngSignature), 'Static image is not a PNG');
  assert.ok(generatedImage.subarray(0, 8).equals(pngSignature), 'Generated image is not a PNG');
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = await checkDeployment({
      baseUrl: process.env.SMOKE_BASE_URL,
      bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    });
    for (const result of results) console.log(`PASS ${result.path}: HTTP ${result.status}, ${result.bytes} bytes`);
  } catch (error) {
    console.error(`Deployment smoke check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
