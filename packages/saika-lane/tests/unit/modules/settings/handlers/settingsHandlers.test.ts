// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IAppSettingsStore } from '@/main/modules/settings/infra/IAppSettingsStore';
import { settingsModule } from '@/main/modules/settings/settings.module';
import type { AppSettingsDto } from '@/shared/ipc/contracts';
import { settingsContract } from '@/shared/ipc/contracts';
import type { InferHandlers } from '@/shared/ipc/defineContract';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CapturedHandlers = InferHandlers<typeof settingsContract>;

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockSettingsStore(): IAppSettingsStore {
  let settings: AppSettingsDto = {
    connection: {
      portName: '',
      manufacturer: 'KOHTO' as const,
      deviceId: '',
      serialNumber: '',
      vendorId: '',
      productId: '',
    },
    userPreferences: {
      laneNumber: 1,
      discipline: null,
      competitionTypeId: '',
      audioVolume: 50,
    },
    mqtt: {
      enabled: false,
      brokerUrl: '',
      laneAlias: '',
      autoConnect: false,
      laneId: '550e8400-e29b-41d4-a716-446655440000',
    },
  };

  return {
    getAll: vi.fn(() => settings),
    replaceAll: vi.fn((nextSettings) => {
      settings = nextSettings;
      return settings;
    }),
    getConnectionSettings: vi.fn(() =>
      settings.connection.portName
        ? {
            portName: settings.connection.portName,
            manufacturer: settings.connection.manufacturer,
            ...(settings.connection.deviceId ? { deviceId: settings.connection.deviceId } : {}),
            ...(settings.connection.serialNumber ? { serialNumber: settings.connection.serialNumber } : {}),
            ...(settings.connection.vendorId ? { vendorId: settings.connection.vendorId } : {}),
            ...(settings.connection.productId ? { productId: settings.connection.productId } : {}),
          }
        : null,
    ),
    saveConnectionSettings: vi.fn((connection) => {
      settings = {
        ...settings,
        connection: {
          portName: connection.portName,
          manufacturer: connection.manufacturer,
          deviceId: connection.deviceId ?? '',
          serialNumber: connection.serialNumber ?? '',
          vendorId: connection.vendorId ?? '',
          productId: connection.productId ?? '',
        },
      };
      return settings;
    }),
    getUserPreferences: vi.fn(() => ({
      ...(settings.userPreferences.laneNumber !== 1 ? { laneNumber: settings.userPreferences.laneNumber } : {}),
      ...(settings.userPreferences.audioVolume !== 50 ? { audioVolume: settings.userPreferences.audioVolume } : {}),
      ...(settings.userPreferences.discipline ? { discipline: settings.userPreferences.discipline } : {}),
      ...(settings.userPreferences.competitionTypeId
        ? { competitionTypeId: settings.userPreferences.competitionTypeId }
        : {}),
    })),
    saveUserPreferences: vi.fn((preferences) => {
      settings = {
        ...settings,
        userPreferences: {
          ...settings.userPreferences,
          ...(preferences.laneNumber !== undefined ? { laneNumber: preferences.laneNumber } : {}),
          ...(preferences.audioVolume !== undefined ? { audioVolume: preferences.audioVolume } : {}),
          ...(preferences.discipline !== undefined ? { discipline: preferences.discipline } : {}),
          ...(preferences.competitionTypeId !== undefined ? { competitionTypeId: preferences.competitionTypeId } : {}),
        },
      };
      return settings;
    }),
    getMqttSettings: vi.fn(() => settings.mqtt),
    saveMqttSettings: vi.fn((mqttSettings) => {
      settings = {
        ...settings,
        mqtt: mqttSettings,
      };
      return settings;
    }),
    getLaneId: vi.fn(() => settings.mqtt.laneId),
    getFilePath: vi.fn(() => '/tmp/settings.json'),
  };
}

function createMockIpcRouter() {
  let capturedHandlers: CapturedHandlers | null = null;
  return {
    register: vi.fn((_contract: unknown, handlers: CapturedHandlers) => {
      capturedHandlers = handlers;
    }),
    getHandlers: () => capturedHandlers!,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settings module handlers', () => {
  let settingsStore: IAppSettingsStore;
  let handlers: CapturedHandlers;

  beforeEach(() => {
    settingsStore = createMockSettingsStore();
    const ipcRouter = createMockIpcRouter();

    settingsModule.register({
      ipcRouter: ipcRouter as unknown as Parameters<typeof settingsModule.register>[0]['ipcRouter'],
      settingsStore,
    });

    handlers = ipcRouter.getHandlers();
  });

  // -----------------------------------------------------------------------
  // UserPreferences round-trip (Lane Number persistence)
  // -----------------------------------------------------------------------

  describe('UserPreferences round-trip (Lane Number persistence)', () => {
    it('should restore saved laneNumber via getUserPreferences', async () => {
      await handlers.saveUserPreferences({ preferences: { laneNumber: 3 } });

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({ laneNumber: 3 });
    });

    it('should save and restore laneNumber and discipline simultaneously', async () => {
      await handlers.saveUserPreferences({
        preferences: { laneNumber: 5, discipline: 'AIR_RIFLE_10M' },
      });

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({ laneNumber: 5, discipline: 'AIR_RIFLE_10M' });
    });

    it('should restore the latest value when laneNumber is overwritten', async () => {
      await handlers.saveUserPreferences({ preferences: { laneNumber: 1 } });
      await handlers.saveUserPreferences({ preferences: { laneNumber: 7 } });

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({ laneNumber: 7 });
    });

    it('should return an empty object when nothing is saved', async () => {
      const result = await handlers.getUserPreferences();

      expect(result).toEqual({});
    });

    it('should not include discipline when only laneNumber is saved', async () => {
      await handlers.saveUserPreferences({ preferences: { laneNumber: 2 } });

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({ laneNumber: 2 });
      expect(result).not.toHaveProperty('discipline');
    });
  });

  // -----------------------------------------------------------------------
  // ConnectionSettings round-trip
  // -----------------------------------------------------------------------

  describe('ConnectionSettings round-trip', () => {
    it('should restore saved connectionSettings', async () => {
      const settings = {
        portName: 'COM3',
        manufacturer: 'KOHTO' as const,
        deviceId: 'MT201-001',
        serialNumber: 'ABC123',
        vendorId: '0403',
        productId: '6001',
      };

      await handlers.saveConnectionSettings({ settings });

      const result = await handlers.getConnectionSettings();

      expect(result).toEqual(settings);
    });

    it('should throw SETTINGS_NOT_FOUND error when nothing is saved', async () => {
      await expect(handlers.getConnectionSettings()).rejects.toMatchObject({
        code: 'SETTINGS_NOT_FOUND',
      });
    });
  });

  // -----------------------------------------------------------------------
  // UserPreferences incremental save consistency
  // -----------------------------------------------------------------------

  describe('UserPreferences incremental save consistency', () => {
    it('should not lose discipline when saving laneNumber after saving discipline', async () => {
      // Target tab discipline selection (save discipline only)
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_RIFLE_10M' } });

      // General tab Save (save laneNumber only)
      await handlers.saveUserPreferences({ preferences: { laneNumber: 5 } });

      // Read on restart
      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ discipline: 'AIR_RIFLE_10M', laneNumber: 5 });
    });

    it('should not lose laneNumber when saving discipline after saving laneNumber', async () => {
      // General tab Save (save laneNumber only)
      await handlers.saveUserPreferences({ preferences: { laneNumber: 3 } });

      // Target tab discipline selection (save discipline only)
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_PISTOL_10M' } });

      // Read on restart
      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ laneNumber: 3, discipline: 'AIR_PISTOL_10M' });
    });
  });

  // -----------------------------------------------------------------------
  // UserPreferences edge cases (Codex review feedback)
  // -----------------------------------------------------------------------

  describe('UserPreferences edge cases (Codex review feedback)', () => {
    it('should not erase existing values when preferences contain explicit undefined', async () => {
      // discipline already saved
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_RIFLE_10M' } });

      // Save laneNumber while discipline: undefined is mixed in
      await handlers.saveUserPreferences({
        preferences: { laneNumber: 5, discipline: undefined },
      });

      const prefs = await handlers.getUserPreferences();
      // discipline should not be overwritten by undefined, original value should be retained
      expect(prefs).toEqual({ discipline: 'AIR_RIFLE_10M', laneNumber: 5 });
    });

    it('should not change existing values when saving with empty object {}', async () => {
      await handlers.saveUserPreferences({ preferences: { laneNumber: 7, discipline: 'AIR_PISTOL_10M' } });

      // Save with empty object (expected no-op)
      await handlers.saveUserPreferences({ preferences: {} });

      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ laneNumber: 7, discipline: 'AIR_PISTOL_10M' });
    });

    it('should merge new values when existing value is an empty object', async () => {
      // Explicitly save empty object (simulating initial state)
      await handlers.saveUserPreferences({ preferences: {} });

      await handlers.saveUserPreferences({ preferences: { laneNumber: 2 } });

      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ laneNumber: 2 });
    });

    it('should reflect the latest value when overwriting the same discipline key', async () => {
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_RIFLE_10M' } });
      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_PISTOL_10M' } });

      const prefs = await handlers.getUserPreferences();
      expect(prefs).toEqual({ discipline: 'AIR_PISTOL_10M' });
    });
  });
});
