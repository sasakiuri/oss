// SPDX-License-Identifier: MIT
import type { PrintSettingsDto } from '@/shared/ipc/contracts';

import { createServiceMethod } from './createServiceMethod';

export const settingsService = {
  savePrintSettings: createServiceMethod(
    (api) => (settings: PrintSettingsDto) => api.settings.savePrintSettings({ settings }),
  ),
  saveConnectionSettings: createServiceMethod((api) => api.settings.saveConnectionSettings),
  getConnectionSettings: createServiceMethod((api) => api.settings.getConnectionSettings),
  saveUserPreferences: createServiceMethod((api) => api.settings.saveUserPreferences),
  getUserPreferences: createServiceMethod((api) => api.settings.getUserPreferences),
  saveAppSettings: createServiceMethod((api) => api.settings.saveAppSettings),
  getAppSettings: createServiceMethod((api) => api.settings.getAppSettings),
  getSettingsFileInfo: createServiceMethod((api) => api.settings.getSettingsFileInfo),
};
