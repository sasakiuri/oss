// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
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
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
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

  it('migrates the legacy RedDot rifle device ID and vendor', () => {
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          connection: {
            portName: 'COM8',
            manufacturer: 'CUSTOM',
            deviceId: 'RDT_ZIE1_RIFLE',
            serialNumber: 'REDDOT01',
            vendorId: '',
            productId: '',
          },
          userPreferences: {},
          mqtt: {},
        },
        null,
        2,
      ),
      'utf8',
    );

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.connection).toEqual({
      portName: 'COM8',
      manufacturer: 'DISAG',
      deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
      serialNumber: 'REDDOT01',
      vendorId: '',
      productId: '',
    });

    const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<typeof store.getAll>;
    expect(persisted.connection).toEqual(settings.connection);
    expect(storage.set).toHaveBeenCalledWith('connectionSettings', {
      portName: 'COM8',
      manufacturer: 'DISAG',
      deviceId: 'DISAG_KT_RDT_ZIE_1_RIFLE',
      serialNumber: 'REDDOT01',
    });
  });

  it('migrates the legacy RedDot pistol device ID and vendor', () => {
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          connection: {
            portName: 'COM9',
            manufacturer: 'CUSTOM',
            deviceId: 'RDT_ZIE1_PISTOL',
            serialNumber: 'REDDOT02',
            vendorId: '',
            productId: '',
          },
          userPreferences: { discipline: 'AIR_PISTOL_10M' },
          mqtt: {},
        },
        null,
        2,
      ),
      'utf8',
    );

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.connection).toEqual({
      portName: 'COM9',
      manufacturer: 'DISAG',
      deviceId: 'DISAG_KT_RDT_ZIE_1_PISTOL',
      serialNumber: 'REDDOT02',
      vendorId: '',
      productId: '',
    });

    const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<typeof store.getAll>;
    expect(persisted.connection).toEqual(settings.connection);
    expect(storage.set).toHaveBeenCalledWith('connectionSettings', {
      portName: 'COM9',
      manufacturer: 'DISAG',
      deviceId: 'DISAG_KT_RDT_ZIE_1_PISTOL',
      serialNumber: 'REDDOT02',
    });
  });

  it('rebuilds settings from legacy storage when settings.json exists but is empty', () => {
    storage.set('connectionSettings', {
      portName: 'COM3',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });
    storage.set('userPreferences', {
      laneNumber: 4,
      audioVolume: 70,
    });
    writeFileSync(filePath, '', 'utf8');

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.connection).toEqual({
      portName: 'COM3',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });
    expect(settings.userPreferences).toEqual({
      laneNumber: 4,
      discipline: null,
      competitionTypeId: '',
      audioVolume: 70,
    });

    const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<AppSettingsStore['getAll']>;
    expect(persisted.connection.portName).toBe('COM3');
    expect(persisted.userPreferences.laneNumber).toBe(4);
  });

  it('generates and mirrors laneId when legacy storage does not have one', () => {
    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.mqtt.laneId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(storage.set).toHaveBeenCalledWith('mqtt.laneId', settings.mqtt.laneId);
  });

  it('preserves legacy mqtt.settings.laneId when the mirrored mqtt.laneId key is missing', () => {
    storage.set('mqtt.settings', {
      enabled: true,
      brokerUrl: 'mqtt://broker.example.com:1883',
      laneAlias: 'Lane 4',
      autoConnect: true,
      laneId: '550e8400-e29b-41d4-a716-446655440000',
    });

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.mqtt.laneId).toBe('550e8400-e29b-41d4-a716-446655440000');
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

  it('preserves explicitly saved default laneNumber across reloads', () => {
    const store = new AppSettingsStore({ filePath, storage });

    store.saveUserPreferences({
      laneNumber: 1,
    });

    expect(store.getUserPreferences()).toEqual({
      laneNumber: 1,
    });

    const reloadedStore = new AppSettingsStore({ filePath, storage });
    expect(reloadedStore.getUserPreferences()).toEqual({
      laneNumber: 1,
    });
  });

  it('persists USB identity fields with connection settings', () => {
    const store = new AppSettingsStore({ filePath, storage });

    store.saveConnectionSettings({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });

    expect(store.getConnectionSettings()).toEqual({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });

    const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<typeof store.getAll>;
    expect(persisted.connection).toEqual({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });
  });

  it('backs up and restores settings when settings.json is corrupted', () => {
    storage.set('userPreferences', {
      laneNumber: 4,
      audioVolume: 70,
    });
    writeFileSync(filePath, '{"broken": ', 'utf8');

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.userPreferences).toEqual({
      laneNumber: 4,
      discipline: null,
      competitionTypeId: '',
      audioVolume: 70,
    });

    const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<typeof store.getAll>;
    expect(persisted.userPreferences.laneNumber).toBe(4);

    const backupFiles = readdirSync(tempDir).filter((name) => name.startsWith('settings.json.corrupted-'));
    expect(backupFiles).toHaveLength(1);
    expect(readFileSync(join(tempDir, backupFiles[0]!), 'utf8')).toBe('{"broken": ');
  });

  it('backs up and restores settings when settings.json has a non-object root', () => {
    storage.set('userPreferences', {
      laneNumber: 4,
      audioVolume: 70,
    });
    writeFileSync(filePath, '[]\n', 'utf8');

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.userPreferences).toEqual({
      laneNumber: 4,
      discipline: null,
      competitionTypeId: '',
      audioVolume: 70,
    });

    const backupFiles = readdirSync(tempDir).filter((name) => name.startsWith('settings.json.corrupted-'));
    expect(backupFiles).toHaveLength(1);
    expect(readFileSync(join(tempDir, backupFiles[0]!), 'utf8')).toBe('[]\n');
  });

  it('normalizes invalid fields without discarding unrelated settings from settings.json', () => {
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          connection: {
            portName: 'COM7',
            manufacturer: 'KOHTO',
            deviceId: 'MT201',
            serialNumber: 'ABC123',
            vendorId: '0403',
            productId: '6001',
          },
          userPreferences: {
            laneNumber: 7,
            discipline: 'AIR_RIFLE_10M',
            competitionTypeId: 'qualification',
            audioVolume: 101,
          },
          mqtt: {
            enabled: true,
            brokerUrl: 'mqtt://broker.example.com:1883',
            laneAlias: 'Lane 7',
            autoConnect: true,
            laneId: 'not-a-uuid',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.connection).toEqual({
      portName: 'COM7',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });
    expect(settings.userPreferences).toEqual({
      laneNumber: 7,
      discipline: 'AIR_RIFLE_10M',
      competitionTypeId: 'qualification',
      audioVolume: 50,
    });
    expect(settings.mqtt).toMatchObject({
      enabled: true,
      brokerUrl: 'mqtt://broker.example.com:1883',
      laneAlias: 'Lane 7',
      autoConnect: true,
    });
    expect(settings.mqtt.laneId).toMatch(/^[0-9a-f-]{36}$/i);

    const backupFiles = readdirSync(tempDir).filter((name) => name.startsWith('settings.json.corrupted-'));
    expect(backupFiles).toHaveLength(0);
  });

  it('drops an incomplete saved connection when the legacy manufacturer is invalid during migration', () => {
    storage.set('connectionSettings', {
      portName: 'COM7',
      manufacturer: 'INVALID_MANUFACTURER',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });
    storage.set('userPreferences', {
      laneNumber: 7,
      discipline: 'AIR_RIFLE_10M',
      competitionTypeId: 'qualification',
      audioVolume: 101,
    });
    storage.set('mqtt.settings', {
      enabled: true,
      brokerUrl: 'not-a-mqtt-url',
      laneAlias: 'Lane 7',
      autoConnect: true,
    });
    storage.set('mqtt.laneId', '550e8400-e29b-41d4-a716-446655440000');

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.connection).toEqual({
      portName: '',
      manufacturer: 'KOHTO',
      deviceId: '',
      serialNumber: '',
      vendorId: '',
      productId: '',
    });
    expect(settings.userPreferences).toEqual({
      laneNumber: 7,
      discipline: 'AIR_RIFLE_10M',
      competitionTypeId: 'qualification',
      audioVolume: 50,
    });
    expect(settings.mqtt).toEqual({
      enabled: true,
      brokerUrl: '',
      laneAlias: 'Lane 7',
      autoConnect: true,
      laneId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('drops an incomplete saved connection when the legacy manufacturer is missing during migration', () => {
    storage.set('connectionSettings', {
      portName: 'COM7',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });

    const store = new AppSettingsStore({ filePath, storage });
    const settings = store.getAll();

    expect(settings.connection).toEqual({
      portName: '',
      manufacturer: 'KOHTO',
      deviceId: '',
      serialNumber: '',
      vendorId: '',
      productId: '',
    });
    expect(store.getConnectionSettings()).toBeNull();
  });

  it('preserves the existing laneId when replacing the full settings document', () => {
    const store = new AppSettingsStore({ filePath, storage });
    const current = store.getAll();
    const replacementLaneId = '660e8400-e29b-41d4-a716-446655440000';

    const updated = store.replaceAll({
      ...current,
      userPreferences: {
        ...current.userPreferences,
        laneNumber: 9,
      },
      mqtt: {
        ...current.mqtt,
        laneId: replacementLaneId,
      },
    });

    expect(updated.userPreferences.laneNumber).toBe(9);
    expect(updated.mqtt.laneId).toBe(current.mqtt.laneId);

    const persisted = JSON.parse(readFileSync(filePath, 'utf8')) as ReturnType<typeof store.getAll>;
    expect(persisted.mqtt.laneId).toBe(current.mqtt.laneId);
  });

  it('preserves saved USB identity fields when later saves omit them', () => {
    const store = new AppSettingsStore({ filePath, storage });

    store.saveConnectionSettings({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });

    store.saveConnectionSettings({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
    });

    expect(store.getConnectionSettings()).toEqual({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });
  });

  it('clears a stale deviceId when later saves omit it for the same port', () => {
    const store = new AppSettingsStore({ filePath, storage });

    store.saveConnectionSettings({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });

    store.saveConnectionSettings({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });

    expect(store.getConnectionSettings()).toEqual({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });
  });

  it('clears saved USB identity fields when the selected port changes without fresh identifiers', () => {
    const store = new AppSettingsStore({ filePath, storage });

    store.saveConnectionSettings({
      portName: '/dev/ttyUSB1',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });

    store.saveConnectionSettings({
      portName: '/dev/ttyUSB2',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
    });

    expect(store.getConnectionSettings()).toEqual({
      portName: '/dev/ttyUSB2',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
    });
  });
});
