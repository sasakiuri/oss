// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/next-route-contract.mjs', import.meta.url));
function check(t, paths, routes) {
  const root = mkdtempSync(resolve(tmpdir(), 'route-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(resolve(root, 'contracts'));
  writeFileSync(resolve(root, 'contracts/openapi.json'), JSON.stringify({ paths }));
  for (const [file, source] of Object.entries(routes)) {
    mkdirSync(resolve(root, 'src/app/api', file, '..'), { recursive: true });
    writeFileSync(resolve(root, 'src/app/api', file), source);
  }
  return spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
}

test('route contracts include dynamic segments and server-only handlers', (t) => {
  const result = check(
    t,
    { '/api/items/{id}/': { get: {} }, '/api/vitals/': { post: {} } },
    {
      'items/[id]/route.ts': 'export async function GET() {}',
      'vitals/route.server.ts': 'export function POST() {}',
    },
  );
  assert.equal(result.status, 0, result.stderr);
});

test('undocumented methods, missing implementations and duplicate routes fail', (t) => {
  assert.match(
    check(
      t,
      { '/api/items/': { get: {} } },
      {
        'items/route.ts': 'export function POST() {}',
      },
    ).stderr,
    /Missing OpenAPI operation: POST/,
  );
  assert.match(
    check(
      t,
      { '/api/items/': { get: {}, post: {} } },
      {
        'items/route.ts': 'export function GET() {}',
      },
    ).stderr,
    /OpenAPI operation has no route: POST/,
  );
  assert.match(
    check(
      t,
      { '/api/items/': { get: {} } },
      {
        'items/route.ts': 'export function GET() {}',
        'items/route.server.ts': 'export function GET() {}',
      },
    ).stderr,
    /Duplicate route: GET/,
  );
});
