// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { settingsService } from '@/renderer/services/settingsService';

import { installMockElectronAPI } from '../../../helpers/mockElectronAPI';

const connection = {
  portName: '/dev/ttyUSB0',
  manufacturer: 'KOHTO' as const,
  deviceId: 'MT201',
  serialNumber: 'ABC123',
  vendorId: '0403',
  productId: '6001',
};

const appSettings = {
  connection,
  userPreferences: { laneNumber: 1, discipline: null, competitionTypeId: '', audioVolume: 50 },
  mqtt: {
    enabled: true,
    brokerUrl: 'mqtt://broker.example.com:1883',
    laneAlias: 'Lane 1',
    autoConnect: true,
  },
};

const printing = {
  deviceName: 'Printer',
  pageSize: 'A4' as const,
  landscape: false,
  copies: 1,
  color: false,
  duplexMode: 'simplex' as const,
};

// services.test.ts covers the settings methods that forward their input unchanged.
describe('settingsService save adapters', () => {
  it.each([
    ['savePrintSettings', () => settingsService.savePrintSettings(printing), { settings: printing }],
    ['saveConnectionSettings', () => settingsService.saveConnectionSettings(connection), { settings: connection }],
    [
      'saveUserPreferences',
      () => settingsService.saveUserPreferences({ discipline: 'AIR_RIFLE_10M' }),
      { preferences: { discipline: 'AIR_RIFLE_10M' } },
    ],
    ['saveAppSettings', () => settingsService.saveAppSettings(appSettings), { settings: appSettings }],
  ] as const)('%s wraps the value in its contract input', async (method, save, input) => {
    const api = installMockElectronAPI();
    api.settings[method].mockResolvedValue({ success: true });

    await expect(save()).resolves.toBeUndefined();
    expect(api.settings[method]).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('rejects with the response error', async () => {
    const api = installMockElectronAPI();
    api.settings.saveConnectionSettings.mockResolvedValue({
      success: false,
      error: { code: 'SAVE_ERROR', message: 'Disk full' },
    });

    await expect(settingsService.saveConnectionSettings(connection)).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'SAVE_ERROR',
      message: 'Disk full',
    });
  });
});
