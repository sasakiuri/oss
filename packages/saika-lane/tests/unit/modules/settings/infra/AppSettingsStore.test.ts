// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppSettingsStore } from '@/main/modules/settings/infra/AppSettingsStore';

import { createMockStorage } from '../../../../helpers/mockDependencies';

describe('AppSettingsStore', () => {
  let tempDir: string;
  let filePath: string;
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'saika-lane-settings-'));
    filePath = join(tempDir, 'settings.json');
    storage = createMockStorage();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates settings.json from legacy storage on first load', () => {
    storage.set('connectionSettings', {
      portName: 'COM3',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
    });
    storage.set('userPreferences', {
      laneNumber: 4,
      audioVolume: 70,
    });
    storage.set('mqtt.settings', {
      enabled: true,
      brokerUrl: 'mqtt://broker.example.com:1883',
      laneAlias: 'Lane 4',
      autoConnect: true,
      laneId: '550e8400-e29b-41d4-a716-446655440000',
    });
    storage.set('mqtt.laneId', '550e8400-e29b-41d4-a716-446655440000');

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.connection).toEqual({
      portName: 'COM3',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
    });
    expect(settings.userPreferences).toEqual({
      laneNumber: 4,
      discipline: null,
      competitionTypeId: '',
      audioVolume: 70,
    });
    expect(settings.mqtt.laneId).toBe('550e8400-e29b-41d4-a716-446655440000');

    const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<AppSettingsStore['getAll']>;
    expect(persisted).toEqual(settings);
  });

  it('generates and mirrors laneId when legacy storage does not have one', () => {
    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.mqtt.laneId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(storage.set).toHaveBeenCalledWith('mqtt.laneId', settings.mqtt.laneId);
  });

  it('persists document updates and keeps legacy mirrors in sync', () => {
    const store = new AppSettingsStore({ filePath, storage });

    store.saveUserPreferences({
      laneNumber: 8,
      competitionTypeId: 'final',
      audioVolume: 65,
    });

    expect(store.getUserPreferences()).toEqual({
      laneNumber: 8,
      competitionTypeId: 'final',
      audioVolume: 65,
    });

    const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<typeof store.getAll>;
    expect(persisted.userPreferences).toEqual({
      laneNumber: 8,
      discipline: null,
      competitionTypeId: 'final',
      audioVolume: 65,
    });
    expect(storage.set).toHaveBeenCalledWith('userPreferences', {
      laneNumber: 8,
      competitionTypeId: 'final',
      audioVolume: 65,
    });
  });
});
