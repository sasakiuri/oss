// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceError } from '@/renderer/services/createServiceMethod';

const mockSaveConnectionSettings = vi.fn();
const mockGetConnectionSettings = vi.fn();
const mockSaveUserPreferences = vi.fn();
const mockGetUserPreferences = vi.fn();
const mockSaveAppSettings = vi.fn();
const mockGetAppSettings = vi.fn();
const mockGetSettingsFileInfo = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    settings: {
      saveConnectionSettings: mockSaveConnectionSettings,
      getConnectionSettings: mockGetConnectionSettings,
      saveUserPreferences: mockSaveUserPreferences,
      getUserPreferences: mockGetUserPreferences,
      saveAppSettings: mockSaveAppSettings,
      getAppSettings: mockGetAppSettings,
      getSettingsFileInfo: mockGetSettingsFileInfo,
    },
  },
});

const { settingsService } = await import('@/renderer/services/settingsService');

describe('settingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveConnectionSettings', () => {
    const settings = {
      portName: '/dev/ttyUSB0',
      manufacturer: 'KOHTO' as const,
      deviceId: 'MT201',
      discipline: 'AIR_RIFLE_10M' as const,
    };

    it('returns void on success', async () => {
      mockSaveConnectionSettings.mockResolvedValue({ success: true });

      await expect(settingsService.saveConnectionSettings(settings)).resolves.toBeUndefined();

      expect(mockSaveConnectionSettings).toHaveBeenCalledWith(settings);
    });

    it('can be called without optional parameters', async () => {
      mockSaveConnectionSettings.mockResolvedValue({ success: true });

      const minimalSettings = {
        portName: 'COM1',
        manufacturer: 'SIUS' as const,
      };

      await expect(settingsService.saveConnectionSettings(minimalSettings)).resolves.toBeUndefined();
    });

    it('throws ServiceError on failure', async () => {
      mockSaveConnectionSettings.mockResolvedValue({
        success: false,
        error: { code: 'SAVE_ERROR', message: 'Disk full' },
      });

      await expect(settingsService.saveConnectionSettings(settings)).rejects.toThrow(ServiceError);

      try {
        await settingsService.saveConnectionSettings(settings);
      } catch (err) {
        expect((err as ServiceError).code).toBe('SAVE_ERROR');
      }
    });

    it('IPC error is wrapped with IPC_ERROR', async () => {
      mockSaveConnectionSettings.mockRejectedValue(new Error('IPC broken'));

      try {
        await settingsService.saveConnectionSettings(settings);
      } catch (err) {
        expect((err as ServiceError).code).toBe('IPC_ERROR');
      }
    });
  });

  describe('getConnectionSettings', () => {
    const mockSettings = {
      portName: '/dev/ttyUSB0',
      manufacturer: 'KOHTO' as const,
      deviceId: 'MT201',
      discipline: 'AIR_RIFLE_10M' as const,
    };

    it('returns ConnectionSettingsDto on success', async () => {
      mockGetConnectionSettings.mockResolvedValue({
        success: true,
        data: mockSettings,
      });

      const result = await settingsService.getConnectionSettings();

      expect(result).toEqual(mockSettings);
      expect(mockGetConnectionSettings).toHaveBeenCalledWith();
    });

    it('throws ServiceError on failure', async () => {
      mockGetConnectionSettings.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No settings saved' },
      });

      await expect(settingsService.getConnectionSettings()).rejects.toThrow(ServiceError);
    });

    it('failure without error results in UNKNOWN code', async () => {
      mockGetConnectionSettings.mockResolvedValue({ success: false });

      try {
        await settingsService.getConnectionSettings();
      } catch (err) {
        expect((err as ServiceError).code).toBe('UNKNOWN');
        expect((err as ServiceError).message).toBe('Unknown error');
      }
    });
  });

  describe('saveUserPreferences', () => {
    const preferences = {
      laneNumber: 3,
      discipline: 'AIR_PISTOL_10M' as const,
    };

    it('returns void on success', async () => {
      mockSaveUserPreferences.mockResolvedValue({ success: true });

      await expect(settingsService.saveUserPreferences(preferences)).resolves.toBeUndefined();

      expect(mockSaveUserPreferences).toHaveBeenCalledWith(preferences);
    });

    it('can save empty preferences', async () => {
      mockSaveUserPreferences.mockResolvedValue({ success: true });

      await expect(settingsService.saveUserPreferences({})).resolves.toBeUndefined();
    });

    it('throws ServiceError on failure', async () => {
      mockSaveUserPreferences.mockResolvedValue({
        success: false,
        error: { code: 'SAVE_ERROR', message: 'Cannot save' },
      });

      await expect(settingsService.saveUserPreferences(preferences)).rejects.toThrow(ServiceError);
    });
  });

  describe('getUserPreferences', () => {
    const mockPrefs = {
      laneNumber: 3,
      discipline: 'AIR_PISTOL_10M' as const,
    };

    it('returns UserPreferencesDto on success', async () => {
      mockGetUserPreferences.mockResolvedValue({
        success: true,
        data: mockPrefs,
      });

      const result = await settingsService.getUserPreferences();

      expect(result).toEqual(mockPrefs);
      expect(mockGetUserPreferences).toHaveBeenCalledWith();
    });

    it('throws ServiceError on failure', async () => {
      mockGetUserPreferences.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No preferences' },
      });

      await expect(settingsService.getUserPreferences()).rejects.toThrow(ServiceError);
    });

    it('IPC error is wrapped with IPC_ERROR', async () => {
      mockGetUserPreferences.mockRejectedValue(new Error('Channel closed'));

      try {
        await settingsService.getUserPreferences();
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceError);
        expect((err as ServiceError).code).toBe('IPC_ERROR');
        expect((err as ServiceError).message).toBe('Channel closed');
      }
    });
  });

  describe('app settings document', () => {
    const appSettings = {
      connection: {
        portName: '/dev/ttyUSB0',
        manufacturer: 'KOHTO' as const,
        deviceId: 'MT201',
      },
      userPreferences: {
        laneNumber: 3,
        discipline: 'AIR_PISTOL_10M' as const,
        competitionTypeId: 'standard',
        audioVolume: 80,
      },
      mqtt: {
        enabled: true,
        brokerUrl: 'mqtt://broker.example.com:1883',
        laneAlias: 'Lane 1',
        autoConnect: true,
        laneId: '550e8400-e29b-41d4-a716-446655440000',
      },
    };

    it('saveAppSettings returns void on success', async () => {
      mockSaveAppSettings.mockResolvedValue({ success: true });

      await expect(settingsService.saveAppSettings(appSettings)).resolves.toBeUndefined();
      expect(mockSaveAppSettings).toHaveBeenCalledWith(appSettings);
    });

    it('getAppSettings returns the full document on success', async () => {
      mockGetAppSettings.mockResolvedValue({
        success: true,
        data: appSettings,
      });

      await expect(settingsService.getAppSettings()).resolves.toEqual(appSettings);
    });

    it('getSettingsFileInfo returns file metadata', async () => {
      mockGetSettingsFileInfo.mockResolvedValue({
        success: true,
        data: { path: '/tmp/settings.json' },
      });

      await expect(settingsService.getSettingsFileInfo()).resolves.toEqual({ path: '/tmp/settings.json' });
    });
  });
});
