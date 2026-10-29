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

export async function launchLane(savedUserDataDirectory?: string): Promise<RunningLane> {
  const userDataDirectory = savedUserDataDirectory ?? (await mkdtemp(path.join(tmpdir(), 'saika-lane-e2e-')));
  const appPath = path.resolve(directory, '../dist/main/main.js');
  const app = await electron.launch({
    executablePath: electronPath as unknown as string,
    args: [appPath, `--user-data-dir=${userDataDirectory}`],
  });
  const running = { app, userDataDirectory };
  try {
    const window = await app.firstWindow();
    // Window creation precedes application initialization and the end of the splash screen.
    await window.getByRole('main').waitFor({ state: 'visible', timeout: 30_000 });
    return running;
  } catch (error) {
    await closeLane(running);
    throw error;
  }
}

export async function closeLane(running: RunningLane | undefined, preserveUserData = false): Promise<void> {
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

  // On Windows, Chromium's child processes can hold user-data files briefly after the main process
  // exits; retry the removal the way Playwright removes its own browser profiles.
  if (preserveUserData) return;
  await rm(running.userDataDirectory, { recursive: true, force: true, maxRetries: 10 });
}

/** Restart the process with its durable store and SQLite database intact. */
export async function relaunchLane(running: RunningLane): Promise<RunningLane> {
  await closeLane(running, true);
  return launchLane(running.userDataDirectory);
}
