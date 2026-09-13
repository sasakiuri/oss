// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { JSDOM } from 'jsdom';

import { publicEnv, readServerEnv } from '../src/shared/config/env';
import { securityHeaders } from '../src/shared/config/security';

// @ts-expect-error Shared Node artifact helpers.
import { files, inventory, sha256 } from './lib/artifact.mjs';

const base = publicEnv.NEXT_PUBLIC_BASE_PATH;
const root = 'out';
await writeFile(
  `${root}/sw-register.js`,
  `if('serviceWorker' in navigator){const worker=new URL('sw.js',document.currentScript.src);window.addEventListener('load',()=>navigator.serviceWorker.register(worker.href,{scope:new URL('./',worker).pathname}));}\n`,
);
const headers = securityHeaders(publicEnv, readServerEnv());
const policy = headers.find(({ key }) => key.toLowerCase() === 'content-security-policy')!.value;
for (const file of ((await files(root)) as string[]).filter((name) => name.endsWith('.html'))) {
  const dom = new JSDOM(await readFile(`${root}/${file}`, 'utf8'));
  const document = dom.window.document;
  const registration = document.createElement('script');
  registration.src = `${base}/sw-register.js`;
  registration.defer = true;
  document.head.append(registration);
  const hashes = [...document.querySelectorAll('script:not([src])')].map(
    (script) =>
      `'sha256-${createHash('sha256')
        .update(script.textContent ?? '')
        .digest('base64')}'`,
  );
  const csp = policy
    .replace(
      /script-src ([^;]+)/,
      (_, sources: string) => `script-src ${sources.replaceAll("'unsafe-inline'", '')} ${hashes.join(' ')}`,
    )
    .replace(/frame-ancestors [^;]+;?\s*/g, '')
    .replace(/report-uri [^;]+;?\s*/g, '');
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = `${csp}; script-src-attr 'none'`;
  document.head.prepend(meta);
  await writeFile(`${root}/${file}`, dom.serialize());
  dom.window.close();
}
const entries = (await inventory(root)) as { file: string; bytes: number; sha256: string }[];
// Only public static documents/assets. No authenticated server routes or runtime responses are cached.
const assets = entries.filter(
  ({ file, bytes }) =>
    bytes < 2_000_000 && !/^(?:api|backend)\//.test(file) && /\.(?:html|js|css|woff2|png|svg|webp|ico)$/.test(file),
);
const urls = assets.map(({ file }) => `${base}/${file.replace(/index\.html$/, '')}`);
const version = sha256(JSON.stringify(assets));
await writeFile(
  `${root}/sw.js`,
  `// SPDX-License-Identifier: MIT\nconst CACHE='saika-docs-${version}',URLS=${JSON.stringify(urls)};\nself.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)).then(()=>self.skipWaiting())));\nself.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('saika-docs-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));\nself.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.search||!URLS.includes(u.pathname))return;e.respondWith(caches.open(CACHE).then(c=>c.match(u.pathname)).then(hit=>hit||fetch(e.request)));});\n`,
);
await writeFile(`${root}/security-policy.json`, JSON.stringify({ contentSecurityPolicy: policy }, null, 2) + '\n');
console.log(`Added per-page CSP hashes and a versioned offline cache (${assets.length} files).`);
