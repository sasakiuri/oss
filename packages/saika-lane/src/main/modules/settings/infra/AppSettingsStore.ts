// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { getLogger } from '@/main/shared-infra/logging';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';
import {
  AppSettingsDraftSchema,
  AppSettingsSchema,
  type AppSettingsDto,
  type AppSettingsDraftDto,
  type ConnectionSettingsDto,
  type MqttSettings,
  type UserPreferencesDto,
} from '@/shared/ipc/contracts';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IAppSettingsStore } from './IAppSettingsStore';

interface AppSettingsStoreOptions {
  filePath: string;
  storage: ILocalStorage;
}

export class AppSettingsStore implements IAppSettingsStore {
  private readonly filePath: string;
  private readonly storage: ILocalStorage;

  constructor(options: AppSettingsStoreOptions) {
    this.filePath = options.filePath;
    this.storage = options.storage;
  }

  getAll(): AppSettingsDto {
    const settings = this.loadSettings();
    this.syncLegacyStorage(settings);
    return settings;
  }

  replaceAll(settings: AppSettingsDto): AppSettingsDto {
    const normalized = AppSettingsSchema.parse(settings);
    this.writeSettings(normalized);
    this.syncLegacyStorage(normalized);
    return normalized;
  }

  getConnectionSettings(): ConnectionSettingsDto | null {
    const { connection } = this.getAll();
    if (!connection.portName) {
      return null;
    }

    return {
      portName: connection.portName,
      manufacturer: connection.manufacturer,
      ...(connection.deviceId ? { deviceId: connection.deviceId } : {}),
    };
  }

  saveConnectionSettings(settings: ConnectionSettingsDto): AppSettingsDto {
    const current = this.getAll();
    return this.replaceAll({
      ...current,
      connection: {
        portName: settings.portName,
        manufacturer: settings.manufacturer,
        deviceId: settings.deviceId ?? '',
      },
    });
  }

  getUserPreferences(): UserPreferencesDto {
    return this.toLegacyUserPreferences(this.getAll().userPreferences);
  }

  saveUserPreferences(preferences: UserPreferencesDto): AppSettingsDto {
    const current = this.getAll();

    return this.replaceAll({
      ...current,
      userPreferences: {
        ...current.userPreferences,
        ...(preferences.laneNumber !== undefined ? { laneNumber: preferences.laneNumber } : {}),
        ...(preferences.audioVolume !== undefined ? { audioVolume: preferences.audioVolume } : {}),
        ...(preferences.discipline !== undefined ? { discipline: preferences.discipline } : {}),
        ...(preferences.competitionTypeId !== undefined ? { competitionTypeId: preferences.competitionTypeId } : {}),
      },
    });
  }

  getMqttSettings(): MqttSettings {
    return this.getAll().mqtt;
  }

  saveMqttSettings(settings: MqttSettings): AppSettingsDto {
    const current = this.getAll();
    return this.replaceAll({
      ...current,
      mqtt: {
        ...settings,
        laneId: settings.laneId || current.mqtt.laneId,
      },
    });
  }

  getLaneId(): string {
    return this.getAll().mqtt.laneId;
  }

  getFilePath(): string {
    return this.filePath;
  }

  private loadSettings(): AppSettingsDto {
    if (!existsSync(this.filePath)) {
      const settings = this.buildInitialSettings();
      this.writeSettings(settings);
      return settings;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      const normalized = this.normalizeDraft(parsed);
      const normalizedText = this.serialize(normalized);

      if (raw !== normalizedText) {
        this.writeSettings(normalized);
      }

      return normalized;
    } catch (error) {
      getLogger().error('[AppSettingsStore] Failed to load settings.json', 'module', {
        path: this.filePath,
        error,
      });
      throw ErrorCatalog.createError('STORAGE_DATA_CORRUPTED', { path: this.filePath }, toError(error));
    }
  }

  private writeSettings(settings: AppSettingsDto): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, this.serialize(settings), 'utf8');
    } catch (error) {
      getLogger().error('[AppSettingsStore] Failed to write settings.json', 'module', {
        path: this.filePath,
        error,
      });
      throw ErrorCatalog.createError('STORAGE_WRITE_ERROR', { key: this.filePath }, toError(error));
    }
  }

  private buildInitialSettings(): AppSettingsDto {
    return this.normalizeDraft({
      connection: this.readLegacyConnection(),
      userPreferences: this.readLegacyUserPreferences(),
      mqtt: this.readLegacyMqttSettings(),
    });
  }

  private readLegacyConnection(): AppSettingsDraftDto['connection'] {
    const parsed = AppSettingsDraftSchema.shape.connection.safeParse(this.storage.get('connectionSettings') ?? {});
    return parsed.success ? parsed.data : AppSettingsDraftSchema.shape.connection.parse({});
  }

  private readLegacyUserPreferences(): AppSettingsDraftDto['userPreferences'] {
    const parsed = AppSettingsDraftSchema.shape.userPreferences.safeParse(this.storage.get('userPreferences') ?? {});
    return parsed.success ? parsed.data : AppSettingsDraftSchema.shape.userPreferences.parse({});
  }

  private readLegacyMqttSettings(): AppSettingsDraftDto['mqtt'] {
    const legacy = this.storage.get('mqtt.settings') ?? {};
    const laneId = this.storage.get<string>('mqtt.laneId');
    const parsed = AppSettingsDraftSchema.shape.mqtt.safeParse({
      ...(typeof legacy === 'object' && legacy !== null ? legacy : {}),
      laneId,
    });

    return parsed.success ? parsed.data : AppSettingsDraftSchema.shape.mqtt.parse({});
  }

  private normalizeDraft(draft: unknown): AppSettingsDto {
    const parsed = AppSettingsDraftSchema.parse(draft);
    const laneIdCandidate = parsed.mqtt.laneId ?? this.getValidLegacyLaneId() ?? randomUUID();

    return AppSettingsSchema.parse({
      connection: parsed.connection,
      userPreferences: parsed.userPreferences,
      mqtt: {
        ...parsed.mqtt,
        laneId: laneIdCandidate,
      },
    });
  }

  private getValidLegacyLaneId(): string | null {
    const laneId = this.storage.get<string>('mqtt.laneId');
    const result = AppSettingsSchema.shape.mqtt.shape.laneId.safeParse(laneId);
    return result.success ? result.data : null;
  }

  private syncLegacyStorage(settings: AppSettingsDto): void {
    this.storage.set('mqtt.laneId', settings.mqtt.laneId);
    this.storage.set('mqtt.settings', settings.mqtt);
    this.storage.set('userPreferences', this.toLegacyUserPreferences(settings.userPreferences));

    if (settings.connection.portName) {
      this.storage.set('connectionSettings', this.toLegacyConnectionSettings(settings.connection));
    } else if (this.storage.has('connectionSettings')) {
      this.storage.delete('connectionSettings');
    }
  }

  private toLegacyConnectionSettings(connection: AppSettingsDto['connection']): ConnectionSettingsDto {
    return {
      portName: connection.portName,
      manufacturer: connection.manufacturer,
      ...(connection.deviceId ? { deviceId: connection.deviceId } : {}),
    };
  }

  private toLegacyUserPreferences(userPreferences: AppSettingsDto['userPreferences']): UserPreferencesDto {
    return {
      ...(userPreferences.laneNumber !== 1 ? { laneNumber: userPreferences.laneNumber } : {}),
      ...(userPreferences.audioVolume !== 50 ? { audioVolume: userPreferences.audioVolume } : {}),
      ...(userPreferences.discipline ? { discipline: userPreferences.discipline } : {}),
      ...(userPreferences.competitionTypeId ? { competitionTypeId: userPreferences.competitionTypeId } : {}),
    };
  }

  private serialize(settings: AppSettingsDto): string {
    return `${JSON.stringify(settings, null, 2)}\n`;
  }
}
