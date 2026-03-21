// SPDX-License-Identifier: MIT
/**
 * Settings module definition
 *
 * Registers IPC handlers related to settings management.
 * LocalStorageAdapter is provided externally via the ServiceRegistry.
 */

import { randomUUID } from 'node:crypto';

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import type { ConnectionSettingsDto, UserPreferencesDto } from '@/shared/ipc/contracts';
import { settingsContract } from '@/shared/ipc/contracts';
import type { InferHandlers } from '@/shared/ipc/defineContract';

type SettingsDeps = 'ipcRouter' | 'storage';

export const settingsModule: ModuleDefinition<SettingsDeps> = {
  name: 'settings',
  deps: ['ipcRouter', 'storage'] as const,
  register({ ipcRouter, storage }) {
    // Auto-generate laneId if not present
    if (!storage.get('mqtt.laneId')) {
      storage.set('mqtt.laneId', randomUUID());
    }

    // Register IPC handlers via IpcRouter
    const settingsHandlers: InferHandlers<typeof settingsContract> = {
      saveConnectionSettings: async (input) => {
        storage.set('connectionSettings', input.settings);
      },

      getConnectionSettings: async () => {
        const settings = storage.get<ConnectionSettingsDto>('connectionSettings');

        if (!settings) {
          throw ErrorCatalog.createError('SETTINGS_NOT_FOUND');
        }

        return settings;
      },

      saveUserPreferences: async (input) => {
        const existing = storage.get<UserPreferencesDto>('userPreferences');
        const patch = Object.fromEntries(Object.entries(input.preferences).filter(([, v]) => v !== undefined));
        const updated = existing ? { ...existing, ...patch } : (patch as UserPreferencesDto);
        storage.set('userPreferences', updated);
      },

      getUserPreferences: async () => {
        const preferences = storage.get<UserPreferencesDto>('userPreferences');
        if (!preferences) {
          return {} as UserPreferencesDto;
        }
        return preferences;
      },
    };

    ipcRouter.register(settingsContract, settingsHandlers);
  },
};
