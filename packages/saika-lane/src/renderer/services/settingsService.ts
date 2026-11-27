// SPDX-License-Identifier: MIT
import type {
  AppSettingsInputDto,
  ConnectionSettingsDto,
  PrintSettingsDto,
  UserPreferencesDto,
} from '@/shared/ipc/contracts';

import { createServiceMethod } from './createServiceMethod';

/** The save methods take the bare value and wrap it in the contract input. */
export const settingsService = {
  savePrintSettings: createServiceMethod(
    (api) => (settings: PrintSettingsDto) => api.settings.savePrintSettings({ settings }),
  ),
  saveConnectionSettings: createServiceMethod(
    (api) => (settings: ConnectionSettingsDto) => api.settings.saveConnectionSettings({ settings }),
  ),
  getConnectionSettings: createServiceMethod((api) => api.settings.getConnectionSettings),
  saveUserPreferences: createServiceMethod(
    (api) => (preferences: UserPreferencesDto) => api.settings.saveUserPreferences({ preferences }),
  ),
  getUserPreferences: createServiceMethod((api) => api.settings.getUserPreferences),
  saveAppSettings: createServiceMethod(
    (api) => (settings: AppSettingsInputDto) => api.settings.saveAppSettings({ settings }),
  ),
  getAppSettings: createServiceMethod((api) => api.settings.getAppSettings),
  getSettingsFileInfo: createServiceMethod((api) => api.settings.getSettingsFileInfo),
};
