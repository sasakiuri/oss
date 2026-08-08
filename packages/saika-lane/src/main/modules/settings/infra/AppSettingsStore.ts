// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

import { getLogger } from '@/main/shared-infra/logging';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';
import {
  AppSettingsDraftSchema,
  AppSettingsSchema,
  type AppSettingsInputDto,
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

const LEGACY_REDDOT_RIFLE_DEVICE_ID = 'RDT_ZIE1_RIFLE';
const REDDOT_RIFLE_DEVICE_ID = 'DISAG_KT_RDT_ZIE_1_RIFLE';

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

  replaceAll(settings: AppSettingsInputDto): AppSettingsDto {
    const normalized = this.normalizeDraft(settings, this.getPersistedLaneId() ?? this.getValidLegacyLaneId());
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
      ...(connection.serialNumber ? { serialNumber: connection.serialNumber } : {}),
      ...(connection.vendorId ? { vendorId: connection.vendorId } : {}),
      ...(connection.productId ? { productId: connection.productId } : {}),
    };
  }

  saveConnectionSettings(settings: ConnectionSettingsDto): AppSettingsDto {
    const current = this.getAll();
    const preserveExistingIdentity =
      settings.portName === current.connection.portName && settings.manufacturer === current.connection.manufacturer;

    return this.replaceAll({
      ...current,
      connection: {
        portName: settings.portName,
        manufacturer: settings.manufacturer,
        deviceId: settings.deviceId ?? '',
        serialNumber: settings.serialNumber ?? (preserveExistingIdentity ? current.connection.serialNumber : ''),
        vendorId: settings.vendorId ?? (preserveExistingIdentity ? current.connection.vendorId : ''),
        productId: settings.productId ?? (preserveExistingIdentity ? current.connection.productId : ''),
      },
    });
  }

  getUserPreferences(): UserPreferencesDto {
    this.getAll();
    return this.getStoredLegacyUserPreferences();
  }

  saveUserPreferences(preferences: UserPreferencesDto): AppSettingsDto {
    const current = this.getAll();
    const nextLegacyPreferences = this.mergeLegacyUserPreferences(this.getStoredLegacyUserPreferences(), preferences);
    const nextSettings = this.replaceAll({
      ...current,
      userPreferences: {
        ...current.userPreferences,
        ...(preferences.laneNumber !== undefined ? { laneNumber: preferences.laneNumber } : {}),
        ...(preferences.audioVolume !== undefined ? { audioVolume: preferences.audioVolume } : {}),
        ...(preferences.discipline !== undefined ? { discipline: preferences.discipline } : {}),
        ...(preferences.competitionTypeId !== undefined ? { competitionTypeId: preferences.competitionTypeId } : {}),
      },
    });
    this.storage.set('userPreferences', nextLegacyPreferences);
    return nextSettings;
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
      if (!raw.trim()) {
        const settings = this.buildInitialSettings();
        this.writeSettings(settings);
        return settings;
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return this.recoverCorruptedSettings(raw, error);
      }

      if (!this.isRecord(parsed)) {
        return this.recoverCorruptedSettings(raw, new Error('settings.json root must be an object'));
      }

      const normalized = this.normalizeDraft(this.mergeMissingSectionsFromLegacy(parsed));
      const normalizedText = this.serialize(normalized);
      if (raw !== normalizedText) {
        this.writeSettings(normalized);
      }

      return normalized;
    } catch (error) {
      this.tryLog('error', '[AppSettingsStore] Failed to load settings.json', {
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
      this.tryLog('error', '[AppSettingsStore] Failed to write settings.json', {
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
    return this.normalizeConnectionDraft(this.storage.get('connectionSettings') ?? {});
  }

  private readLegacyUserPreferences(): AppSettingsDraftDto['userPreferences'] {
    return this.normalizeUserPreferencesDraft(this.storage.get('userPreferences') ?? {});
  }

  private readLegacyMqttSettings(): AppSettingsDraftDto['mqtt'] {
    const legacy = this.storage.get('mqtt.settings') ?? {};
    const laneId = this.storage.get<string>('mqtt.laneId');
    return this.normalizeMqttDraft({
      ...(typeof legacy === 'object' && legacy !== null ? legacy : {}),
      ...(laneId !== undefined ? { laneId } : {}),
    });
  }

  private normalizeDraft(draft: unknown, preferredLaneId?: string | null): AppSettingsDto {
    const root = this.asRecord(draft);
    const connection = this.normalizeConnectionDraft(root.connection);
    const userPreferences = this.normalizeUserPreferencesDraft(root.userPreferences);
    const mqtt = this.normalizeMqttDraft(root.mqtt);
    const laneIdCandidate = preferredLaneId ?? mqtt.laneId ?? this.getValidLegacyLaneId() ?? randomUUID();

    return AppSettingsSchema.parse({
      connection,
      userPreferences,
      mqtt: {
        ...mqtt,
        laneId: laneIdCandidate,
      },
    });
  }

  private mergeMissingSectionsFromLegacy(draft: Record<string, unknown>): Record<string, unknown> {
    return {
      ...draft,
      ...(this.shouldRecoverConnectionSection(draft.connection)
        ? { connection: this.readLegacyConnection() }
        : { connection: this.mergeConnectionFromLegacy(draft.connection) }),
      ...(this.shouldRecoverSection(draft.userPreferences)
        ? { userPreferences: this.readLegacyUserPreferences() }
        : { userPreferences: this.mergeUserPreferencesFromLegacy(draft.userPreferences) }),
      ...(this.shouldRecoverSection(draft.mqtt)
        ? { mqtt: this.readLegacyMqttSettings() }
        : { mqtt: this.mergeMqttFromLegacy(draft.mqtt) }),
    };
  }

  private mergeUserPreferencesFromLegacy(value: unknown): Record<string, unknown> {
    const legacy = this.readLegacyUserPreferences();
    const section = this.asRecord(value);

    return {
      ...legacy,
      ...section,
    };
  }

  private mergeConnectionFromLegacy(value: unknown): Record<string, unknown> {
    const legacy = this.readLegacyConnection();
    const section = this.asRecord(value);
    const sectionPortName = typeof section.portName === 'string' ? section.portName.trim() : '';
    const connectionSchema = AppSettingsDraftSchema.shape.connection.removeDefault();
    const sectionManufacturer = connectionSchema.shape.manufacturer.safeParse(section.manufacturer);
    const sectionHasDeviceId = Object.prototype.hasOwnProperty.call(section, 'deviceId');

    if (!legacy.portName || sectionPortName !== legacy.portName || !sectionManufacturer.success) {
      return section;
    }

    if (sectionManufacturer.data !== legacy.manufacturer) {
      return section;
    }

    if (sectionHasDeviceId && section.deviceId !== legacy.deviceId) {
      return section;
    }

    return {
      ...legacy,
      ...section,
    };
  }

  private mergeMqttFromLegacy(value: unknown): Record<string, unknown> {
    const legacy = this.readLegacyMqttSettings();
    const section = this.asRecord(value);

    return {
      ...legacy,
      ...section,
    };
  }

  private normalizeConnectionDraft(input: unknown): AppSettingsDraftDto['connection'] {
    const section = this.asRecord(input);
    const connectionSchema = AppSettingsDraftSchema.shape.connection.removeDefault();
    const portName = this.parseDraftField(connectionSchema.shape.portName, section.portName);
    const hasStoredManufacturer = typeof section.manufacturer === 'string' && section.manufacturer.trim() !== '';
    const manufacturerResult = connectionSchema.shape.manufacturer.safeParse(section.manufacturer);
    const deviceId = this.parseDraftField(connectionSchema.shape.deviceId, section.deviceId);
    const isLegacyRedDotRifle = deviceId === LEGACY_REDDOT_RIFLE_DEVICE_ID;
    const manufacturer = manufacturerResult.success
      ? manufacturerResult.data
      : connectionSchema.shape.manufacturer.parse(undefined);

    // An incomplete saved connection must not auto-connect as the default manufacturer.
    if (portName && (!hasStoredManufacturer || !manufacturerResult.success)) {
      return connectionSchema.parse({
        portName: '',
        manufacturer: undefined,
        deviceId: '',
        serialNumber: '',
        vendorId: '',
        productId: '',
      });
    }

    return connectionSchema.parse({
      portName,
      manufacturer: isLegacyRedDotRifle ? 'DISAG' : manufacturer,
      deviceId: isLegacyRedDotRifle ? REDDOT_RIFLE_DEVICE_ID : deviceId,
      serialNumber: this.parseDraftField(connectionSchema.shape.serialNumber, section.serialNumber),
      vendorId: this.parseDraftField(connectionSchema.shape.vendorId, section.vendorId),
      productId: this.parseDraftField(connectionSchema.shape.productId, section.productId),
    });
  }

  private normalizeUserPreferencesDraft(input: unknown): AppSettingsDraftDto['userPreferences'] {
    const section = this.asRecord(input);
    const userPreferencesSchema = AppSettingsDraftSchema.shape.userPreferences.removeDefault();

    return userPreferencesSchema.parse({
      laneNumber: this.parseDraftField(userPreferencesSchema.shape.laneNumber, section.laneNumber),
      discipline: this.parseDraftField(userPreferencesSchema.shape.discipline, section.discipline),
      competitionTypeId: this.parseDraftField(userPreferencesSchema.shape.competitionTypeId, section.competitionTypeId),
      audioVolume: this.parseDraftField(userPreferencesSchema.shape.audioVolume, section.audioVolume),
    });
  }

  private normalizeMqttDraft(input: unknown): AppSettingsDraftDto['mqtt'] {
    const section = this.asRecord(input);
    const mqttSchema = AppSettingsDraftSchema.shape.mqtt.removeDefault();

    return mqttSchema.parse({
      enabled: this.parseDraftField(mqttSchema.shape.enabled, section.enabled),
      brokerUrl: this.parseDraftField(mqttSchema.shape.brokerUrl, section.brokerUrl),
      laneAlias: this.parseDraftField(mqttSchema.shape.laneAlias, section.laneAlias),
      autoConnect: this.parseDraftField(mqttSchema.shape.autoConnect, section.autoConnect),
      laneId: this.parseDraftField(mqttSchema.shape.laneId, section.laneId),
    });
  }

  private recoverCorruptedSettings(raw: string, error: unknown): AppSettingsDto {
    const backupPath = `${this.filePath}.corrupted-${Date.now()}.json`;
    let backupSucceeded = false;

    try {
      mkdirSync(dirname(backupPath), { recursive: true });
      writeFileSync(backupPath, raw, 'utf8');
      backupSucceeded = true;
    } catch (backupError) {
      this.tryLog('warn', '[AppSettingsStore] Failed to back up corrupted settings.json', {
        path: this.filePath,
        backupPath,
        error: backupError,
      });
    }

    const recovered = this.buildInitialSettings();
    this.writeSettings(recovered);

    this.tryLog('error', '[AppSettingsStore] Recovered from corrupted settings.json', {
      path: this.filePath,
      backupPath: backupSucceeded ? backupPath : null,
      error,
    });

    return recovered;
  }

  private getValidLegacyLaneId(): string | null {
    const laneId = this.storage.get<string>('mqtt.laneId');
    const result = AppSettingsSchema.shape.mqtt.shape.laneId.safeParse(laneId);
    return result.success ? result.data : null;
  }

  private getPersistedLaneId(): string | null {
    if (!existsSync(this.filePath)) {
      return null;
    }

    return this.loadSettings().mqtt.laneId;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private shouldRecoverSection(value: unknown): boolean {
    return !this.isRecord(value) || Object.keys(value).length === 0;
  }

  private shouldRecoverConnectionSection(value: unknown): boolean {
    if (this.shouldRecoverSection(value)) {
      return true;
    }

    const section = this.asRecord(value);
    const portName = typeof section.portName === 'string' ? section.portName.trim() : '';
    const connectionSchema = AppSettingsDraftSchema.shape.connection.removeDefault();
    const hasStoredManufacturer = typeof section.manufacturer === 'string' && section.manufacturer.trim() !== '';
    const manufacturerResult = connectionSchema.shape.manufacturer.safeParse(section.manufacturer);

    return portName !== '' && (!hasStoredManufacturer || !manufacturerResult.success);
  }

  private parseDraftField<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    return result.success ? result.data : schema.parse(undefined);
  }

  private tryLog(level: 'warn' | 'error', message: string, metadata: Record<string, unknown>): void {
    try {
      getLogger()[level](message, 'module', metadata);
    } catch {
      // Logger may not be initialized yet during early startup and unit tests.
    }
  }

  private syncLegacyStorage(settings: AppSettingsDto): void {
    this.storage.set('mqtt.laneId', settings.mqtt.laneId);
    this.storage.set('mqtt.settings', settings.mqtt);
    this.storage.set(
      'userPreferences',
      this.toLegacyUserPreferences(settings.userPreferences, this.getStoredLegacyUserPreferences()),
    );

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
      ...(connection.serialNumber ? { serialNumber: connection.serialNumber } : {}),
      ...(connection.vendorId ? { vendorId: connection.vendorId } : {}),
      ...(connection.productId ? { productId: connection.productId } : {}),
    };
  }

  private getStoredLegacyUserPreferences(): UserPreferencesDto {
    const stored = this.storage.get('userPreferences');
    if (typeof stored !== 'object' || stored === null) {
      return {};
    }

    const parsed = AppSettingsSchema.shape.userPreferences.safeParse(stored);
    if (!parsed.success) {
      return {};
    }

    const candidate = stored as Record<string, unknown>;
    return {
      ...('laneNumber' in candidate ? { laneNumber: parsed.data.laneNumber } : {}),
      ...('audioVolume' in candidate ? { audioVolume: parsed.data.audioVolume } : {}),
      ...('discipline' in candidate && parsed.data.discipline ? { discipline: parsed.data.discipline } : {}),
      ...('competitionTypeId' in candidate ? { competitionTypeId: parsed.data.competitionTypeId } : {}),
    };
  }

  private mergeLegacyUserPreferences(current: UserPreferencesDto, patch: UserPreferencesDto): UserPreferencesDto {
    return {
      ...current,
      ...(patch.laneNumber !== undefined ? { laneNumber: patch.laneNumber } : {}),
      ...(patch.audioVolume !== undefined ? { audioVolume: patch.audioVolume } : {}),
      ...(patch.discipline !== undefined ? { discipline: patch.discipline } : {}),
      ...(patch.competitionTypeId !== undefined ? { competitionTypeId: patch.competitionTypeId } : {}),
    };
  }

  private toLegacyUserPreferences(
    userPreferences: AppSettingsDto['userPreferences'],
    current: UserPreferencesDto = {},
  ): UserPreferencesDto {
    return {
      ...(userPreferences.laneNumber !== 1 || current.laneNumber === 1
        ? { laneNumber: userPreferences.laneNumber }
        : {}),
      ...(userPreferences.audioVolume !== 50 || current.audioVolume === 50
        ? { audioVolume: userPreferences.audioVolume }
        : {}),
      ...(userPreferences.discipline ? { discipline: userPreferences.discipline } : {}),
      ...(userPreferences.competitionTypeId !== '' || current.competitionTypeId === ''
        ? { competitionTypeId: userPreferences.competitionTypeId }
        : {}),
    };
  }

  private serialize(settings: AppSettingsDto): string {
    return `${JSON.stringify(settings, null, 2)}\n`;
  }
}
