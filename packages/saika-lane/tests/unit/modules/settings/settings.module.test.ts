// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { settingsModule } from '@/main/modules/settings/settings.module';
import { settingsContract } from '@/shared/ipc/contracts';

import { createMockIpcRouter, createMockSettingsStore } from '../../../helpers/mockDependencies';

interface SettingsHandlers {
  saveConnectionSettings: (input: Record<string, unknown>) => Promise<void>;
  getConnectionSettings: () => Promise<unknown>;
  saveUserPreferences: (input: Record<string, unknown>) => Promise<void>;
  getUserPreferences: () => Promise<unknown>;
}

describe('settings.module', () => {
  let ipcRouter: ReturnType<typeof createMockIpcRouter>;
  let settingsStore: ReturnType<typeof createMockSettingsStore>;

  beforeEach(() => {
    ipcRouter = createMockIpcRouter();
    settingsStore = createMockSettingsStore();
  });

  describe('metadata', () => {
    it('should have name "settings"', () => {
      expect(settingsModule.name).toBe('settings');
    });

    it('should declare correct dependencies', () => {
      expect(settingsModule.deps).toEqual(['ipcRouter', 'settingsStore']);
    });
  });

  describe('register', () => {
    it('should register IPC handlers with settingsContract', () => {
      settingsModule.register({ ipcRouter, settingsStore });

      expect(ipcRouter.register).toHaveBeenCalledTimes(1);
      expect(ipcRouter.register).toHaveBeenCalledWith(settingsContract, expect.any(Object));
    });

    it('should register handlers with all settings methods', () => {
      settingsModule.register({ ipcRouter, settingsStore });

      const registeredHandlers = (ipcRouter.register as ReturnType<typeof vi.fn>).mock.calls[0]![1];
      expect(registeredHandlers).toHaveProperty('saveConnectionSettings');
      expect(registeredHandlers).toHaveProperty('getConnectionSettings');
      expect(registeredHandlers).toHaveProperty('saveUserPreferences');
      expect(registeredHandlers).toHaveProperty('getUserPreferences');
      expect(registeredHandlers).toHaveProperty('saveAppSettings');
      expect(registeredHandlers).toHaveProperty('getAppSettings');
      expect(registeredHandlers).toHaveProperty('getSettingsFileInfo');
    });

    it('should not register command or query bus handlers', () => {
      // settings module only uses ipcRouter/settingsStore, not commandBus/queryBus
      settingsModule.register({ ipcRouter, settingsStore });

      // Only ipcRouter.register was called
      expect(ipcRouter.register).toHaveBeenCalledTimes(1);
    });
  });

  describe('IPC handlers', () => {
    function getHandlers(): SettingsHandlers {
      settingsModule.register({ ipcRouter, settingsStore });
      return (ipcRouter.register as ReturnType<typeof vi.fn>).mock.calls[0]![1] as SettingsHandlers;
    }

    it('saveConnectionSettings should store settings', async () => {
      const handlers = getHandlers();
      const settings = { portName: 'COM3', manufacturer: 'KOHTO' };

      await handlers.saveConnectionSettings({ settings });

      expect(settingsStore.saveConnectionSettings).toHaveBeenCalledWith(settings);
    });

    it('getConnectionSettings should return stored settings', async () => {
      const handlers = getHandlers();
      const settings = { portName: 'COM3', manufacturer: 'KOHTO' };
      (settingsStore.getConnectionSettings as ReturnType<typeof vi.fn>).mockReturnValue(settings);

      const result = await handlers.getConnectionSettings();

      expect(result).toEqual(settings);
    });

    it('getConnectionSettings should throw SETTINGS_NOT_FOUND when no settings', async () => {
      const handlers = getHandlers();
      (settingsStore.getConnectionSettings as ReturnType<typeof vi.fn>).mockReturnValue(null);

      await expect(handlers.getConnectionSettings()).rejects.toThrow();
    });

    it('saveUserPreferences should merge with existing preferences', async () => {
      const handlers = getHandlers();

      await handlers.saveUserPreferences({ preferences: { discipline: 'AIR_RIFLE_10M' } });

      expect(settingsStore.saveUserPreferences).toHaveBeenCalledWith({
        discipline: 'AIR_RIFLE_10M',
      });
    });

    it('getUserPreferences should return empty object when no preferences', async () => {
      const handlers = getHandlers();
      (settingsStore.getUserPreferences as ReturnType<typeof vi.fn>).mockReturnValue({});

      const result = await handlers.getUserPreferences();

      expect(result).toEqual({});
    });
  });

  describe('document-level APIs', () => {
    interface ExtendedSettingsHandlers extends SettingsHandlers {
      saveAppSettings: (input: Record<string, unknown>) => Promise<void>;
      getAppSettings: () => Promise<unknown>;
      getSettingsFileInfo: () => Promise<unknown>;
    }

    function getExtendedHandlers(): ExtendedSettingsHandlers {
      settingsModule.register({ ipcRouter, settingsStore });
      return (ipcRouter.register as ReturnType<typeof vi.fn>).mock.calls[0]![1] as ExtendedSettingsHandlers;
    }

    it('getAppSettings returns the full settings document', async () => {
      const handlers = getExtendedHandlers();

      const result = await handlers.getAppSettings();

      expect(result).toEqual(settingsStore.getAll());
    });

    it('saveAppSettings stores the full settings document', async () => {
      const handlers = getExtendedHandlers();
      const appSettings = settingsStore.getAll();

      await handlers.saveAppSettings({ settings: appSettings });

      expect(settingsStore.replaceAll).toHaveBeenCalledWith(appSettings);
    });

    it('getSettingsFileInfo returns the settings path', async () => {
      const handlers = getExtendedHandlers();

      const result = await handlers.getSettingsFileInfo();

      expect(result).toEqual({ path: '/tmp/settings.json' });
    });
  });
});
