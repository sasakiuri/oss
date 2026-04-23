// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { updaterContract } from '@/shared/ipc/contracts/updater.contract';

describe('updaterContract', () => {
  it('has 2 commands and 1 query', () => {
    const procs = updaterContract.procedures;
    const commands = Object.values(procs).filter((p) => p.kind === 'command');
    const queries = Object.values(procs).filter((p) => p.kind === 'query');

    expect(commands).toHaveLength(2);
    expect(queries).toHaveLength(1);
  });

  it('has the expected channel names configured', () => {
    expect(updaterContract.channels.getUpdateState).toBe('updater:get-update-state');
    expect(updaterContract.channels.checkForUpdates).toBe('updater:check-for-updates');
    expect(updaterContract.channels.quitAndInstall).toBe('updater:quit-and-install');
  });

  it('update state schema accepts a valid payload', () => {
    const schema = updaterContract.procedures.getUpdateState.output;
    const result = schema.safeParse({
      success: true,
      data: {
        status: 'downloading',
        currentVersion: '0.2.1',
        targetVersion: '0.2.2',
        releaseName: 'Saika Lane 0.2.2',
        releaseDate: '2026-04-23T00:00:00.000Z',
        releaseNotes: 'Bug fixes',
        downloadPercent: 42.5,
        transferredBytes: 1024,
        totalBytes: 4096,
        bytesPerSecond: 512,
        lastCheckedAt: '2026-04-23T00:00:00.000Z',
        errorMessage: null,
        canCheckForUpdates: false,
        canInstallUpdate: false,
      },
    });

    expect(result.success).toBe(true);
  });
});
