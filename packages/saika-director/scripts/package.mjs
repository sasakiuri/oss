#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;
const rebuildCli = join(dirname(require.resolve('@electron/rebuild')), 'cli.js');
const builderCli = require.resolve('electron-builder/out/cli/cli.js');

const platformName = process.argv[2];
const directoryOnly = process.argv.includes('--dir');
const targets = {
  win: { builderFlag: '--win', rebuildPlatform: 'win32', arches: ['x64'] },
  mac: { builderFlag: '--mac', rebuildPlatform: 'darwin', arches: ['x64', 'arm64'] },
  linux: { builderFlag: '--linux', rebuildPlatform: 'linux', arches: ['x64'] },
};
const target = targets[platformName];

if (!target) {
  console.error('Usage: node scripts/package.mjs <win|mac|linux> [--dir]');
  process.exitCode = 2;
} else {
  await packageApplication(target);
}

async function packageApplication({ builderFlag, rebuildPlatform, arches }) {
  let buildError;
  try {
    for (const arch of arches) {
      await run(
        `Rebuilding better-sqlite3 for Electron ${electronVersion} (${rebuildPlatform}/${arch})`,
        process.execPath,
        [
          rebuildCli,
          '--force',
          '--which-module=better-sqlite3',
          `--module-dir=${repositoryRoot}`,
          `--version=${electronVersion}`,
          `--platform=${rebuildPlatform}`,
          `--arch=${arch}`,
        ],
        repositoryRoot,
      );

      const builderArgs = [builderCli, builderFlag, `--${arch}`, '--publish', 'never', '--config.npmRebuild=false'];
      if (directoryOnly) builderArgs.push('--dir');
      await run(`Packaging Saika Director (${platformName}/${arch})`, process.execPath, builderArgs, packageRoot);
    }
  } catch (error) {
    buildError = error;
  }

  try {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await run(
      'Restoring better-sqlite3 for the local Node.js runtime',
      npmCommand,
      ['rebuild', 'better-sqlite3'],
      repositoryRoot,
    );
  } catch (restoreError) {
    if (!buildError) throw restoreError;
    console.error(`Native module restore also failed: ${errorMessage(restoreError)}`);
  }

  if (buildError) throw buildError;
}

function run(label, command, args, cwd) {
  console.log(`\n${label}`);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: process.env });
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${label} failed (${signal ? `signal ${signal}` : `exit ${code}`})`));
    });
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
