import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkDeployment } from './deployment-smoke.mjs';

const origin = 'https://nilay-knowledge-website-test.vercel.app';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const fixtures = new Map([
  ['/', ['text/html', '<main><link type="application/rss+xml"><script src="/_next/static/app.js"></script></main>']],
  ['/_next/static/app.js', ['application/javascript', 'console.log("loaded")']],
  [
    '/sitemap.xml',
    ['application/xml', '<urlset><url><loc>https://knowledge.nilay.jp/articles/example/</loc></url></urlset>'],
  ],
  ['/articles/example/', ['text/html', '<main><article><h1>Article</h1></article></main>']],
  ['/feed.xml', ['application/rss+xml', '<rss><channel><item>Entry</item></channel></rss>']],
  ['/ogp.png', ['image/png', png]],
  ['/api/og', ['image/png', png]],
]);

function serve(url) {
  const [type, body] = fixtures.get(url.pathname) ?? ['text/plain', 'missing'];
  return new Response(body, { status: fixtures.has(url.pathname) ? 200 : 404, headers: { 'content-type': type } });
}

test('checks the deployment origin even when sitemap URLs point to production', async () => {
  const results = await checkDeployment({
    baseUrl: origin,
    bypassSecret: 'test-secret',
    fetchImpl: async (url, options) => {
      assert.equal(url.origin, origin);
      assert.equal(options.headers['x-vercel-protection-bypass'], 'test-secret');
      return serve(url);
    },
  });
  assert.equal(results.length, 7);
  assert.ok(results.some(({ path }) => path === '/articles/example/'));
});

test('fails when a deployed JavaScript bundle is missing', async () => {
  await assert.rejects(
    checkDeployment({
      baseUrl: origin,
      fetchImpl: async (url) =>
        url.pathname.includes('/_next/') ? new Response('missing', { status: 404 }) : serve(url),
    }),
    /expected HTTP 200, received 404/,
  );
});

test('does not accept a login page in place of the article', async () => {
  await assert.rejects(
    checkDeployment({
      baseUrl: origin,
      fetchImpl: async (url) =>
        url.pathname === '/articles/example/'
          ? new Response('<h1>Log in</h1>', { headers: { 'content-type': 'text/html' } })
          : serve(url),
    }),
    /missing its content/,
  );
});

test('never forwards the automation secret through a cross-origin redirect', async () => {
  let calls = 0;
  await assert.rejects(
    checkDeployment({
      baseUrl: origin,
      bypassSecret: 'test-secret',
      fetchImpl: async () => {
        calls++;
        return new Response(null, { status: 307, headers: { location: 'https://example.com/' } });
      },
    }),
    /Unexpected redirect/,
  );
  assert.equal(calls, 1);
});

test('rejects non-Knowledge origins before sending the automation secret', async () => {
  await assert.rejects(
    checkDeployment({ baseUrl: 'https://example.com/', bypassSecret: 'test-secret' }),
    /only be sent/,
  );
});

test('does not accept an HTML error as a generated image', async () => {
  await assert.rejects(
    checkDeployment({
      baseUrl: origin,
      fetchImpl: async (url) =>
        url.pathname === '/api/og'
          ? new Response('<html>Error</html>', { headers: { 'content-type': 'image/png' } })
          : serve(url),
    }),
    /Generated image is not a PNG/,
  );
});
