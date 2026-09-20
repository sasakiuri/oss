// SPDX-License-Identifier: MIT
import { ChildProcess, spawn } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { launchAppImage } from '../src/installAppImage';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));

function setupChild() {
  const child = new ChildProcess();
  vi.spyOn(child, 'unref').mockImplementation(() => undefined);
  vi.mocked(spawn).mockReturnValue(child);
  return child;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('launchAppImage', () => {
  it('waits for process creation before detaching the replacement application', async () => {
    const child = setupChild();
    const file = '/applications/Saika-0.4.0.AppImage';

    const launch = launchAppImage(file);

    expect(spawn).toHaveBeenCalledWith(file, [], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, APPIMAGE_SILENT_INSTALL: 'true' },
    });
    expect(child.unref).not.toHaveBeenCalled();

    child.emit('spawn');

    await expect(launch).resolves.toBeUndefined();
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it('rejects process creation errors so installation can restore the previous application', async () => {
    const child = setupChild();
    const failure = new Error('The replacement executable could not be started.');
    const launch = launchAppImage('/applications/Saika-0.4.0.AppImage');

    child.emit('error', failure);

    await expect(launch).rejects.toBe(failure);
    expect(child.unref).not.toHaveBeenCalled();
  });
});
