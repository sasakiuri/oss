// SPDX-License-Identifier: MIT
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { verifyArtifact } from './lib/artifact.mjs';

await verifyArtifact('out');
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};
http
  .createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (base && !pathname.startsWith(base + '/')) throw new Error('Outside base path');
      const relative = pathname.slice(base.length);
      if (relative.includes('..') || relative.includes('\\')) throw new Error('Invalid path');
      let file = path.join('out', relative);
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const data = await readFile(file);
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  })
  .listen(5184, '127.0.0.1');
