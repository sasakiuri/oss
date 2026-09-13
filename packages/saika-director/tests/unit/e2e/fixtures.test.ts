// SPDX-License-Identifier: MIT
// @vitest-environment node
import { access } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDirector, launchDirector, type RunningDirector } from '../../../e2e/fixtures';

const desktop = vi.hoisted(() => ({
  childProcess: { exitCode: null as number | null, signalCode: null as NodeJS.Signals | null },
  process: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@playwright/test', () => ({
  _electron: {
    launch: vi.fn(async () => ({ process: desktop.process, close: desktop.close })),
  },
}));
vi.mock('electron', () => ({ default: 'electron' }));

describe('Director E2E process cleanup', () => {
  let running: RunningDirector | undefined;

  beforeEach(() => {
    desktop.childProcess.exitCode = null;
    desktop.childProcess.signalCode = null;
    desktop.process.mockReset().mockReturnValue(desktop.childProcess);
    desktop.close.mockReset().mockImplementation(async () => {
      desktop.childProcess.exitCode = 0;
    });
  });

  afterEach(async () => {
    await closeDirector(running);
    running = undefined;
  });

  it('cleans up an exited application after Playwright disposes its process accessor', async () => {
    running = await launchDirector();
    expect(running.childProcess).toBe(desktop.childProcess);
    await expect(access(running.userDataDirectory)).resolves.toBeUndefined();
    desktop.childProcess.exitCode = 0;
    desktop.process.mockImplementation(() => {
      throw new TypeError('Disposed Playwright process handle');
    });

    await closeDirector(running);

    expect(desktop.process).toHaveBeenCalledTimes(1);
    expect(desktop.close).not.toHaveBeenCalled();
    await expect(access(running.userDataDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('closes a live application before removing its user data', async () => {
    running = await launchDirector();
    desktop.close.mockImplementation(async () => {
      await expect(access(running!.userDataDirectory)).resolves.toBeUndefined();
      desktop.childProcess.exitCode = 0;
    });

    await closeDirector(running);

    expect(desktop.close).toHaveBeenCalledOnce();
    await expect(access(running.userDataDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not contact Playwright again when the application exited through a signal', async () => {
    running = await launchDirector();
    desktop.childProcess.signalCode = 'SIGTERM';

    await closeDirector(running);

    expect(desktop.process).toHaveBeenCalledTimes(1);
    expect(desktop.close).not.toHaveBeenCalled();
    await expect(access(running.userDataDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
