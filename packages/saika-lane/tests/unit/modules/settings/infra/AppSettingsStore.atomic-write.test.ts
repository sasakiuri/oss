// SPDX-License-Identifier: MIT
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSettingsStore } from '@/main/modules/settings/infra/AppSettingsStore';

import { createMockStorage } from '../../../../helpers/mockDependencies';

const fsControl = vi.hoisted(() => ({ crashNextWrite: false, renameErrors: [] as string[], renameCalls: 0 }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (!fsControl.crashNextWrite) return actual.writeFileSync(...args);
      fsControl.crashNextWrite = false;
      // Leave a truncated file behind, as an interrupted write would.
      actual.writeFileSync(args[0], String(args[1]).slice(0, 12));
      throw new Error('Simulated crash during write');
    },
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      fsControl.renameCalls += 1;
      const code = fsControl.renameErrors.shift();
      if (code) throw Object.assign(new Error(`${code}: simulated rename failure`), { code });
      return actual.renameSync(...args);
    },
  };
});

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

function runAs(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform });
}

describe('AppSettingsStore atomic writes', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'saika-lane-settings-atomic-'));
    filePath = join(tempDir, 'settings.json');
  });

  afterEach(() => {
    fsControl.crashNextWrite = false;
    fsControl.renameErrors = [];
    fsControl.renameCalls = 0;
    Object.defineProperty(process, 'platform', originalPlatform);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps the previous settings.json when a write is interrupted', () => {
    const storage = createMockStorage();
    const store = new AppSettingsStore({ filePath, storage });
    store.saveUserPreferences({ laneNumber: 3 });
    const before = readFileSync(filePath, 'utf8');

    fsControl.crashNextWrite = true;
    expect(() => store.saveUserPreferences({ laneNumber: 7 })).toThrow(
      expect.objectContaining({ code: 'STORAGE_WRITE_ERROR' }),
    );

    expect(readFileSync(filePath, 'utf8')).toBe(before);
    expect(readdirSync(tempDir)).toEqual(['settings.json']);
    expect(new AppSettingsStore({ filePath, storage }).getAll().userPreferences.laneNumber).toBe(3);
  });

  it('leaves only settings.json after a successful write', () => {
    const store = new AppSettingsStore({ filePath, storage: createMockStorage() });

    store.saveUserPreferences({ laneNumber: 5 });

    expect(readdirSync(tempDir)).toEqual(['settings.json']);
    expect(JSON.parse(readFileSync(filePath, 'utf8')).userPreferences.laneNumber).toBe(5);
  });

  it.each(['EPERM', 'EBUSY', 'EACCES'])('retries a rename that Windows refuses briefly with %s', (code) => {
    const store = new AppSettingsStore({ filePath, storage: createMockStorage() });
    store.saveUserPreferences({ laneNumber: 3 });
    runAs('win32');
    fsControl.renameCalls = 0;
    fsControl.renameErrors = [code, code];

    store.saveUserPreferences({ laneNumber: 4 });

    expect(fsControl.renameCalls).toBe(3);
    expect(JSON.parse(readFileSync(filePath, 'utf8')).userPreferences.laneNumber).toBe(4);
    expect(readdirSync(tempDir)).toEqual(['settings.json']);
  });

  it('creates settings.json at startup when Windows holds the new file briefly', () => {
    runAs('win32');
    fsControl.renameErrors = ['EPERM'];

    expect(new AppSettingsStore({ filePath, storage: createMockStorage() }).getAll().userPreferences).toBeDefined();
    expect(readdirSync(tempDir)).toEqual(['settings.json']);
  });

  it('gives up after a bounded number of attempts and keeps the previous settings', () => {
    const store = new AppSettingsStore({ filePath, storage: createMockStorage() });
    store.saveUserPreferences({ laneNumber: 3 });
    const before = readFileSync(filePath, 'utf8');
    runAs('win32');
    fsControl.renameCalls = 0;
    fsControl.renameErrors = Array.from({ length: 10 }, () => 'EBUSY');

    expect(() => store.saveUserPreferences({ laneNumber: 4 })).toThrow(
      expect.objectContaining({ code: 'STORAGE_WRITE_ERROR' }),
    );

    expect(fsControl.renameCalls).toBe(5);
    expect(readFileSync(filePath, 'utf8')).toBe(before);
    expect(readdirSync(tempDir)).toEqual(['settings.json']);
  });

  it('does not retry the rename on other platforms', () => {
    const store = new AppSettingsStore({ filePath, storage: createMockStorage() });
    store.saveUserPreferences({ laneNumber: 3 });
    runAs('linux');
    fsControl.renameCalls = 0;
    fsControl.renameErrors = ['EPERM'];

    expect(() => store.saveUserPreferences({ laneNumber: 4 })).toThrow(
      expect.objectContaining({ code: 'STORAGE_WRITE_ERROR' }),
    );
    expect(fsControl.renameCalls).toBe(1);
  });

  it.skipIf(process.platform === 'win32')('keeps the permissions of the settings file it replaces', () => {
    const store = new AppSettingsStore({ filePath, storage: createMockStorage() });
    store.saveUserPreferences({ laneNumber: 3 });
    chmodSync(filePath, 0o600);

    store.saveUserPreferences({ laneNumber: 4 });

    expect(statSync(filePath).mode & 0o777).toBe(0o600);
  });
});
