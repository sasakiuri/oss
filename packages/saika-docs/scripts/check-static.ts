// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { JSDOM } from 'jsdom';

import { publicEnv } from '../src/shared/config/env';

async function files(directory: string): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((entry) =>
        entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)],
      ),
    )
  ).flat();
}
const html = (await files('out')).filter(
  (file) => file.endsWith('.html') && !file.includes('/404') && !file.includes('/_not-found'),
);
assert(html.length >= 22, 'All Markdown documents must be exported');
let links = 0;
for (const file of html) {
  const document = new JSDOM(await readFile(file, 'utf8')).window.document;
  assert(document.querySelector('h1'), `${file}: missing h1`);
  for (const node of document.querySelectorAll('a[href],script[src],img[src],link[rel=stylesheet]')) {
    const href = node.getAttribute('href') ?? node.getAttribute('src') ?? '';
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const clean = decodeURIComponent(href.split(/[?#]/)[0] ?? '').replace(
      new RegExp(`^${publicEnv.NEXT_PUBLIC_BASE_PATH}(?=/|$)`),
      '',
    );
    const target = path.join('out', clean);
    assert(!path.relative('out', target).startsWith('..'), `${file}: escaped export root`);
    try {
      const info = await stat(target);
      if (info.isDirectory()) await stat(path.join(target, 'index.html'));
    } catch {
      throw new Error(`${file}: broken exported link ${href}`);
    }
    links++;
  }
}
assert((await readFile('out/_headers', 'utf8')).includes('Content-Security-Policy'));
assert(!(await files('out')).some((file) => /api\/vitals/.test(file)), 'Server-only integrations must not be exported');
console.log(`Validated ${html.length} HTML pages and ${links} local links/assets.`);
