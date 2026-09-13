// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const enhance = fileURLToPath(new URL('../../scripts/static-enhancements.ts', import.meta.url));

test('static pages register the worker under their deployment path after the load event', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'saika-static-enhancements-'));
  const inline = 'window.inlineRuns = 1;';
  let sharedRegistration;
  try {
    await mkdir(path.join(root, 'out'));
    for (const base of ['', '/saika/manual']) {
      await writeFile(
        path.join(root, 'out/index.html'),
        `<!doctype html><html><head><title>Fixture</title><script>${inline}</script></head><body></body></html>`,
      );
      execFileSync(process.execPath, [require.resolve('tsx/cli'), enhance], {
        cwd: root,
        env: {
          PATH: process.env.PATH,
          NEXT_PUBLIC_SITE_URL: `https://example.test${base}`,
          NEXT_PUBLIC_BASE_PATH: base,
          DOCS_OUTPUT: 'export',
        },
      });
      const page = new JSDOM(await readFile(path.join(root, 'out/index.html'), 'utf8'));
      try {
        const document = page.window.document;
        const script = document.querySelector('script[src]');
        assert.equal(script.getAttribute('src'), `${base}/sw-register.js`);
        assert.equal(script.defer, true);
        const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
        assert.ok(csp.includes(`'sha256-${createHash('sha256').update(inline).digest('base64')}'`));
        const scripts = csp.split(';').find((directive) => directive.trim().startsWith('script-src '));
        assert.ok(!scripts.includes("'unsafe-inline'"));
        assert.ok(csp.includes("script-src-attr 'none'"));
      } finally {
        page.window.close();
      }
      const registration = await readFile(path.join(root, 'out/sw-register.js'), 'utf8');
      if (sharedRegistration !== undefined) assert.equal(registration, sharedRegistration);
      sharedRegistration = registration;
      const document = { currentScript: { src: `https://example.test${base}/sw-register.js` } };
      const calls = [];
      let load;
      runInNewContext(registration, {
        document,
        URL,
        navigator: { serviceWorker: { register: (url, { scope }) => calls.push({ url, scope }) } },
        window: {
          addEventListener(event, listener) {
            assert.equal(event, 'load');
            load = listener;
          },
        },
      });
      assert.deepEqual(calls, []);
      document.currentScript = null;
      load();
      assert.deepEqual(calls, [{ url: `https://example.test${base}/sw.js`, scope: `${base}/` }]);
      runInNewContext(registration, { navigator: {} });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
