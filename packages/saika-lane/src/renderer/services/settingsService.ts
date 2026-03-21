// SPDX-License-Identifier: MIT
import type { ConnectionSettingsDto, UserPreferencesDto } from '@/shared/ipc/contracts';

import { createCommandMethod, createVoidServiceMethod } from './createServiceMethod';

export const settingsService = {
  saveConnectionSettings: createCommandMethod<ConnectionSettingsDto>((settings) =>
    window.electronAPI.settings.saveConnectionSettings(settings),
  ),

  getConnectionSettings: createVoidServiceMethod<ConnectionSettingsDto>(() =>
    window.electronAPI.settings.getConnectionSettings(),
  ),

  saveUserPreferences: createCommandMethod<UserPreferencesDto>((preferences) =>
    window.electronAPI.settings.saveUserPreferences(preferences),
  ),

  getUserPreferences: createVoidServiceMethod<UserPreferencesDto>(() =>
    window.electronAPI.settings.getUserPreferences(),
  ),
};
