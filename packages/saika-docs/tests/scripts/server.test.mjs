// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { startServer } from '../../scripts/server.mjs';

test('the static server launches its installed CLI and serves the selected directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'saika-static-server-'));
  const previousBase = process.env.NEXT_PUBLIC_BASE_PATH;
  const previousPreview = process.env.DOCS_PREVIEW_AUTH;
  let running;
  try {
    process.env.NEXT_PUBLIC_BASE_PATH = '';
    process.env.DOCS_PREVIEW_AUTH = '0';
    await writeFile(path.join(root, 'index.html'), '<!doctype html><title>Saika static fixture</title>');
    const reservation = createServer();
    await new Promise((resolve, reject) => {
      reservation.once('error', reject);
      reservation.listen(0, '127.0.0.1', resolve);
    });
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    running = await startServer(port, 'static', root);
    const response = await fetch(running.url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Saika static fixture/);
  } finally {
    running?.close();
    if (previousBase === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
    else process.env.NEXT_PUBLIC_BASE_PATH = previousBase;
    if (previousPreview === undefined) delete process.env.DOCS_PREVIEW_AUTH;
    else process.env.DOCS_PREVIEW_AUTH = previousPreview;
    await rm(root, { recursive: true, force: true });
  }
});
