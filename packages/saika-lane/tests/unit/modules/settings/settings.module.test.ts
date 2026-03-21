// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settingsModule } from '@/main/modules/settings/settings.module';
import { settingsContract } from '@/shared/ipc/contracts';

import { createMockIpcRouter, createMockStorage } from '../../../helpers/mockDependencies';

describe('settings.module', () => {
  let ipcRouter: ReturnType<typeof createMockIpcRouter>;
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    ipcRouter = createMockIpcRouter();
    storage = createMockStorage();
  });

  describe('metadata', () => {
    it('should have name "settings"', () => {
      expect(settingsModule.name).toBe('settings');
    });

    it('should declare correct dependencies', () => {
      expect(settingsModule.deps).toEqual(['ipcRouter', 'storage']);
    });
  });

  describe('register', () => {
    it('should register IPC handlers with settingsContract', () => {
      settingsModule.register({ ipcRouter, storage });

      expect(ipcRouter.register).toHaveBeenCalledTimes(1);
      expect(ipcRouter.register).toHaveBeenCalledWith(settingsContract, expect.any(Object));
    });

    it('should register handlers with all 4 settings methods', () => {
      settingsModule.register({ ipcRouter, storage });

      const registeredHandlers = (ipcRouter.register as ReturnType<typeof vi.fn>).mock.calls[0]![1];
      expect(registeredHandlers).toHaveProperty('saveConnectionSettings');
      expect(registeredHandlers).toHaveProperty('getConnectionSettings');
      expect(registeredHandlers).toHaveProperty('saveUserPreferences');
      expect(registeredHandlers).toHaveProperty('getUserPreferences');
    });

    it('should not register command or query bus handlers', () => {
      // settings module only uses ipcRouter, not commandBus/queryBus
      settingsModule.register({ ipcRouter, storage });

      // Only ipcRouter.register was called
      expect(ipcRouter.register).toHaveBeenCalledTimes(1);
    });
  });

  describe('IPC handlers', () => {
    interface SettingsHandlers {
      saveConnectionSettings: (input: Record<string, unknown>) => Promise<void>;
      getConnectionSettings: () => Promise<unknown>;
      saveUserPreferences: (input: Record<string, unknown>) => Promise<void>;
      getUserPreferences: () => Promise<unknown>;
    }

    function getHandlers(): SettingsHandlers {
      settingsModule.register({ ipcRouter, storage });
      return (ipcRouter.register as ReturnType<typeof vi.fn>).mock.calls[0]![1] as SettingsHandlers;
    }

    it('saveConnectionSettings should store settings', async () => {
      const handlers = getHandlers();
      const settings = { portName: 'COM3', manufacturer: 'KOHTO' };

      await handlers.saveConnectionSettings({ settings });

      expect(storage.set).toHaveBeenCalledWith('connectionSettings', settings);
    });

    it('getConnectionSettings should return stored settings', async () => {
      const handlers = getHandlers();
      const settings = { portName: 'COM3', manufacturer: 'KOHTO' };
      (storage.get as ReturnType<typeof vi.fn>).mockReturnValue(settings);

      const result = await handlers.getConnectionSettings();

      expect(result).toEqual(settings);
    });

    it('getConnectionSettings should throw SETTINGS_NOT_FOUND when no settings', async () => {
      const handlers = getHandlers();
      (storage.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      await expect(handlers.getConnectionSettings()).rejects.toThrow();
    });

    it('saveUserPreferences should merge with existing preferences', async () => {
      const handlers = getHandlers();
      (storage.get as ReturnType<typeof vi.fn>).mockReturnValue({ laneNumber: 1 });

      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_RIFLE_10M' } });

      expect(storage.set).toHaveBeenCalledWith('userPreferences', {
        laneNumber: 1,
        discipline: 'AIR_RIFLE_10M',
      });
    });

    it('getUserPreferences should return empty object when no preferences', async () => {
      const handlers = getHandlers();
      (storage.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({});
    });
  });

  describe('laneId auto-generation', () => {
    it('should generate laneId when not present in storage', () => {
      (storage.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      settingsModule.register({ ipcRouter, storage });

      expect(storage.get).toHaveBeenCalledWith('mqtt.laneId');
      expect(storage.set).toHaveBeenCalledWith(
        'mqtt.laneId',
        expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      );
    });

    it('should preserve existing laneId', () => {
      const existingId = '550e8400-e29b-41d4-a716-446655440000';
      (storage.get as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'mqtt.laneId') return existingId;
        return undefined;
      });

      settingsModule.register({ ipcRouter, storage });

      // storage.set should NOT have been called with mqtt.laneId
      const setCalls = (storage.set as ReturnType<typeof vi.fn>).mock.calls;
      const laneIdSetCalls = setCalls.filter((call: unknown[]) => call[0] === 'mqtt.laneId');
      expect(laneIdSetCalls).toHaveLength(0);
    });

    it('should generate a valid UUID v4 format', () => {
      (storage.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      settingsModule.register({ ipcRouter, storage });

      const setCalls = (storage.set as ReturnType<typeof vi.fn>).mock.calls;
      const laneIdCall = setCalls.find((call: unknown[]) => call[0] === 'mqtt.laneId');
      expect(laneIdCall).toBeDefined();

      const generatedId = laneIdCall![1] as string;
      // UUID v4 format: 8-4-4-4-12 hex chars, version 4, variant 1
      expect(generatedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });
});
