// SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const server = spawn(
  process.execPath,
  [require.resolve('serve/build/main.js'), 'storybook-static', '--listen', '6016'],
  { stdio: 'inherit' },
);
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Storybook server exited');
    try {
      ready = (await fetch('http://127.0.0.1:6016/index.json')).ok;
    } catch {
      /* Wait for the server. */
    }
    if (ready) break;
    await setTimeout(500);
  }
  if (!ready) throw new Error('Storybook server did not start');
  const runner = spawn(
    process.execPath,
    [
      require.resolve('@storybook/test-runner/dist/test-storybook.js'),
      '--url',
      'http://127.0.0.1:6016',
      '--maxWorkers',
      '2',
      '--junit',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, JEST_JUNIT_OUTPUT_DIR: 'reports/storybook', JEST_JUNIT_OUTPUT_NAME: 'storybook.xml' },
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    runner.on('error', reject);
    runner.on('exit', (code) => resolve(code ?? 1));
  });
} finally {
  server.kill();
}
