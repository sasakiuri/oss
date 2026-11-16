// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Conf from 'conf';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSettingsStore } from '@/main/modules/settings/infra/AppSettingsStore';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';
import type { StorageData } from '@/shared/storage/types';

/** The same conf store electron-store wraps, written to `saika-lane.json` in a temporary directory. */
function confStorage(cwd: string): ILocalStorage {
  const store = new Conf<Record<string, unknown>>({ cwd, configName: 'saika-lane', clearInvalidConfig: true });
  return {
    get: <T>(key: string) => store.get(key) as T | undefined,
    set: (key, value) => store.set(key, value),
    setMany: (entries) => store.set(entries),
    has: (key) => store.has(key),
    delete: (key) => store.delete(key),
    getAll: () => store.store as StorageData,
    clear: () => store.clear(),
  };
}

describe('AppSettingsStore electron-store mirror writes', () => {
  let tempDir: string;
  let mirrorPath: string;
  let storage: ILocalStorage;
  let settingsStore: AppSettingsStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'saika-lane-mirror-'));
    mirrorPath = join(tempDir, 'saika-lane.json');
    storage = confStorage(tempDir);
    settingsStore = new AppSettingsStore({ filePath: join(tempDir, 'settings.json'), storage });
    settingsStore.saveConnectionSettings({ portName: 'COM3', manufacturer: 'KOHTO', deviceId: 'MT201' });
    settingsStore.saveUserPreferences({ laneNumber: 4, audioVolume: 70 });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('leaves saika-lane.json untouched when every mirror already matches settings.json', () => {
    settingsStore.getAll();
    const bytes = readFileSync(mirrorPath, 'utf8');
    const modifiedAt = statSync(mirrorPath).mtimeMs;
    const set = vi.spyOn(storage, 'set');

    settingsStore.getAll();
    settingsStore.getLaneId();
    settingsStore.getMqttSettings();
    settingsStore.getUserPreferences();
    settingsStore.getConnectionSettings();

    expect(set).not.toHaveBeenCalled();
    expect(readFileSync(mirrorPath, 'utf8')).toBe(bytes);
    expect(statSync(mirrorPath).mtimeMs).toBe(modifiedAt);
  });

  it('rewrites a mirror that no longer matches settings.json with the same bytes as before', () => {
    settingsStore.getAll();
    const expected = readFileSync(mirrorPath, 'utf8');
    storage.set('mqtt.settings', { enabled: true });

    settingsStore.getAll();

    expect(readFileSync(mirrorPath, 'utf8')).toBe(expected);
  });
});
