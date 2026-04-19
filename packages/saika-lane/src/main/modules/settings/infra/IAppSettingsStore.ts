// SPDX-License-Identifier: MIT
import type { AppSettingsDto, ConnectionSettingsDto, MqttSettings, UserPreferencesDto } from '@/shared/ipc/contracts';

export interface IAppSettingsStore {
  getAll(): AppSettingsDto;
  replaceAll(settings: AppSettingsDto): AppSettingsDto;
  getConnectionSettings(): ConnectionSettingsDto | null;
  saveConnectionSettings(settings: ConnectionSettingsDto): AppSettingsDto;
  getUserPreferences(): UserPreferencesDto;
  saveUserPreferences(preferences: UserPreferencesDto): AppSettingsDto;
  getMqttSettings(): MqttSettings;
  saveMqttSettings(settings: MqttSettings): AppSettingsDto;
  getLaneId(): string;
  getFilePath(): string;
}
