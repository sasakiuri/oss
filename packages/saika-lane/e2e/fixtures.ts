// SPDX-License-Identifier: MIT
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type ElectronApplication, _electron as electron } from '@playwright/test';
import electronPath from 'electron';

const directory = path.dirname(fileURLToPath(import.meta.url));

export interface RunningLane {
  app: ElectronApplication;
  userDataDirectory: string;
}

export async function launchLane(): Promise<RunningLane> {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'saika-lane-e2e-'));
  const appPath = path.resolve(directory, '../dist/main/main.js');
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [appPath, `--user-data-dir=${userDataDirectory}`],
  });
  return { app, userDataDirectory };
}

export async function closeLane(running: RunningLane | undefined): Promise<void> {
  if (!running) return;

  const process = running.app.process();
  if (process.exitCode === null && process.signalCode === null) {
    const applicationExited = new Promise<void>((resolve) => {
      process.once('exit', () => resolve());
    });

    try {
      await running.app.evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      });
    } catch (error) {
      if (process.exitCode === null && process.signalCode === null) throw error;
    }

    await applicationExited;
  }

  await rm(running.userDataDirectory, { recursive: true, force: true });
}
