// SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';

const require = createRequire(import.meta.url);
export async function startServer(port, kind = 'next', directory = 'out') {
  const command =
    kind === 'next'
      ? [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)]
      : [
          require.resolve('serve').replace(/build\/main\.js$/, 'build/main.js'),
          directory,
          '--listen',
          `tcp://127.0.0.1:${port}`,
        ];
  const child = spawn(process.execPath, command, { stdio: 'inherit' });
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const url = `http://127.0.0.1:${port}${basePath}`;
  const httpCredentials =
    process.env.DOCS_PREVIEW_AUTH === '1'
      ? { username: process.env.PREVIEW_AUTH_USER ?? '', password: process.env.PREVIEW_AUTH_PASSWORD ?? '' }
      : undefined;
  const headers = httpCredentials
    ? {
        Authorization: `Basic ${Buffer.from(`${httpCredentials.username}:${httpCredentials.password}`).toString('base64')}`,
      }
    : {};

  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited with ${child.exitCode}`);
    try {
      if ((await fetch(url, { headers, signal: AbortSignal.timeout(1000) })).ok)
        return { url, headers, httpCredentials, close: () => child.kill() };
    } catch {
      /* Startup is bounded by the loop. */
    }
    await setTimeout(250);
  }
  child.kill();
  throw new Error('Server startup timed out');
}
