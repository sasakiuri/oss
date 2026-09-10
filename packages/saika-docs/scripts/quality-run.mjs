// SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { sourceIdentity, sha256 } from './lib/artifact.mjs';

const [suite, command, ...args] = process.argv.slice(2);
const reports = {
  coverage: 'coverage/coverage-summary.json',
  playwright: 'test-results/playwright.xml',
  storybook: 'reports/storybook/storybook.xml',
  lighthouse: '.lighthouse.reports/summary.json',
};
if (!reports[suite] || !command) throw new Error('Unknown quality suite');
const before = await sourceIdentity();
const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const code = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});
if (code !== 0) process.exit(code ?? 1);
const after = await sourceIdentity();
if (before.sourceHash !== after.sourceHash) throw new Error('Source changed during quality verification; rerun');
const file = reports[suite];
await mkdir('reports/provenance', { recursive: true });
await writeFile(
  `reports/provenance/${suite}.json`,
  JSON.stringify({ ...before, file, sha256: sha256(await readFile(file)) }, null, 2) + '\n',
);
