// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { startServer } from './server.mjs';

process.env.DOCS_PREVIEW_AUTH = '1';
process.env.PREVIEW_AUTH_USER = 'preview-test';
process.env.PREVIEW_AUTH_PASSWORD = randomUUID();
const server = await startServer(5186);
try {
  for (const [method, pathname] of [
    ['GET', '/'],
    ['GET', '/api/health/'],
    ['GET', '/api/catalog/'],
    ['GET', '/rss.xml/'],
    ['GET', '/icon-192.png'],
    ['POST', '/api/vitals/'],
  ]) {
    const response = await fetch(server.url + pathname, { method });
    assert.equal(response.status, 401, `${method} ${pathname}`);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  const wrong = await fetch(server.url + '/', { headers: { Authorization: 'Basic invalid' } });
  assert.equal(wrong.status, 401);
  const health = await fetch(server.url + '/api/health/', { headers: server.headers });
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.match(health.headers.get('cache-control'), /no-store/);
  const html = await fetch(server.url + '/', { headers: server.headers });
  assert.equal(html.status, 200);
  const source = await html.text();
  const asset = source.match(/src="([^"]*\/_next\/static\/[^" ]+\.js)"/)?.[1];
  assert.ok(asset, 'The page references a generated JavaScript asset');
  const origin = new URL(server.url).origin;
  assert.equal((await fetch(origin + asset)).status, 401);
  assert.equal((await fetch(origin + asset, { headers: server.headers })).status, 200);
  console.log('Preview authentication protects pages, API methods and generated assets.');
} finally {
  server.close();
}
