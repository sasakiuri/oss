// SPDX-License-Identifier: MIT
/**
 * Settings module definition
 *
 * Registers IPC handlers related to settings management.
 * AppSettingsStore is provided externally via the ServiceRegistry.
 */

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { settingsContract } from '@/shared/ipc/contracts';
import type { InferHandlers } from '@/shared/ipc/defineContract';

type SettingsDeps = 'ipcRouter' | 'settingsStore';

export const settingsModule: ModuleDefinition<SettingsDeps> = {
  name: 'settings',
  deps: ['ipcRouter', 'settingsStore'] as const,
  register({ ipcRouter, settingsStore }) {
    // Register IPC handlers via IpcRouter
    const settingsHandlers: InferHandlers<typeof settingsContract> = {
      saveConnectionSettings: async (input) => {
        settingsStore.saveConnectionSettings(input.settings);
      },

      getConnectionSettings: async () => {
        const settings = settingsStore.getConnectionSettings();

        if (!settings) {
          throw ErrorCatalog.createError('SETTINGS_NOT_FOUND');
        }

        return settings;
      },

      saveUserPreferences: async (input) => {
        settingsStore.saveUserPreferences(input.preferences);
      },

      getUserPreferences: async () => settingsStore.getUserPreferences(),

      saveAppSettings: async (input) => {
        settingsStore.replaceAll(input.settings);
      },

      getAppSettings: async () => settingsStore.getAll(),

      getSettingsFileInfo: async () => ({
        path: settingsStore.getFilePath(),
      }),
    };

    ipcRouter.register(settingsContract, settingsHandlers);
  },
};
