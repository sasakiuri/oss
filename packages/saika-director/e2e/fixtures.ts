// SPDX-License-Identifier: MIT
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type ElectronApplication, _electron as electron } from '@playwright/test';
import electronPath from 'electron';

const directory = path.dirname(fileURLToPath(import.meta.url));

export interface RunningDirector {
  app: ElectronApplication;
  userDataDirectory: string;
}

export async function launchDirector(): Promise<RunningDirector> {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'saika-director-e2e-'));
  const appPath = path.resolve(directory, '../dist/main/main.js');
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [appPath, `--user-data-dir=${userDataDirectory}`],
  });
  return { app, userDataDirectory };
}

export async function closeDirector(running: RunningDirector | undefined): Promise<void> {
  if (!running) return;
  const process = running.app.process();
  if (process.exitCode === null && process.signalCode === null) {
    await running.app.close();
  }
  await rm(running.userDataDirectory, { recursive: true, force: true });
}
