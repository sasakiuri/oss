// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { getLogger } from '@/main/shared-infra/logging';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';
import {
  AppSettingsSchema,
  type AppSettingsInputDto,
  type AppSettingsDto,
  type ConnectionSettingsDto,
  type MqttSettings,
  type UserPreferencesDto,
} from '@/shared/ipc/contracts';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { IAppSettingsStore } from '../application/IAppSettingsStore';
import {
  isRecord,
  mergeLegacyUserPreferences,
  normalizeSettingsDraft,
  toLegacyConnectionSettings,
} from '../application/SettingsDocument';

import { LegacySettingsBridge } from './LegacySettingsBridge';

/** Pauses between rename attempts while Windows holds the new file (antivirus, indexer); 150 ms in total. */
const RENAME_RETRY_DELAYS_MS = [10, 20, 40, 80] as const;
const TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Renames over `target`, retrying briefly on Windows when another process still holds the source. */
function replaceFile(source: string, target: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (process.platform !== 'win32' || delay === undefined || !code || !TRANSIENT_RENAME_ERRORS.has(code)) {
        throw error;
      }
      sleepSync(delay);
    }
  }
}

interface AppSettingsStoreOptions {
  filePath: string;
  storage: ILocalStorage;
}

export class AppSettingsStore implements IAppSettingsStore {
  private readonly filePath: string;
  private readonly legacy: LegacySettingsBridge;

  constructor(options: AppSettingsStoreOptions) {
    this.filePath = options.filePath;
    this.legacy = new LegacySettingsBridge(options.storage);
  }

  /** Creates settings.json on first run and refreshes the electron-store mirrors other services read. */
  initialize(): void {
    this.getAll();
  }

  getAll(): AppSettingsDto {
    const settings = this.loadSettings();
    this.legacy.syncLegacyStorage(settings);
    return settings;
  }

  replaceAll(settings: AppSettingsInputDto): AppSettingsDto {
    const normalized = this.normalizeDraft(settings, this.getPersistedLaneId() ?? this.legacy.getValidLegacyLaneId());
    this.writeSettings(normalized);
    this.legacy.syncLegacyStorage(normalized);
    return normalized;
  }

  getConnectionSettings(): ConnectionSettingsDto | null {
    const { connection } = this.getAll();
    if (!connection.portName) {
      return null;
    }

    return toLegacyConnectionSettings(connection);
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
    return this.legacy.getStoredLegacyUserPreferences();
  }

  saveUserPreferences(preferences: UserPreferencesDto): AppSettingsDto {
    const current = this.getAll();
    const nextLegacyPreferences = mergeLegacyUserPreferences(this.legacy.getStoredLegacyUserPreferences(), preferences);
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
    this.legacy.saveUserPreferences(nextLegacyPreferences);
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

      if (!isRecord(parsed)) {
        return this.recoverCorruptedSettings(raw, new Error('settings.json root must be an object'));
      }

      const normalized = this.normalizeDraft(this.legacy.mergeMissingSectionsFromLegacy(parsed));
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
    // Replace the file in one rename so a crash mid-write leaves the previous document intact.
    const temporaryPath = `${this.filePath}.tmp`;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const existingMode = statSync(this.filePath, { throwIfNoEntry: false })?.mode;
      writeFileSync(temporaryPath, this.serialize(settings), { encoding: 'utf8', flush: true });
      // The rename replaces the file, so carry over the permissions of the one it replaces.
      if (existingMode !== undefined) chmodSync(temporaryPath, existingMode & 0o7777);
      replaceFile(temporaryPath, this.filePath);
    } catch (error) {
      try {
        rmSync(temporaryPath, { force: true });
      } catch {
        // Report the write failure; a leftover temporary file is replaced by the next write.
      }
      this.tryLog('error', '[AppSettingsStore] Failed to write settings.json', {
        path: this.filePath,
        error,
      });
      throw ErrorCatalog.createError('STORAGE_WRITE_ERROR', { key: this.filePath }, toError(error));
    }
  }

  private buildInitialSettings(): AppSettingsDto {
    return this.normalizeDraft(this.legacy.readInitialDraft());
  }

  private normalizeDraft(draft: unknown, preferredLaneId?: string | null): AppSettingsDto {
    const normalized = normalizeSettingsDraft(draft);
    const laneId = preferredLaneId ?? normalized.mqtt.laneId ?? this.legacy.getValidLegacyLaneId() ?? randomUUID();
    return AppSettingsSchema.parse({
      ...normalized,
      mqtt: { ...normalized.mqtt, laneId },
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

  private getPersistedLaneId(): string | null {
    if (!existsSync(this.filePath)) {
      return null;
    }

    return this.loadSettings().mqtt.laneId;
  }

  private tryLog(level: 'warn' | 'error', message: string, metadata: Record<string, unknown>): void {
    try {
      getLogger()[level](message, 'module', metadata);
    } catch {
      // Logger may not be initialized yet during early startup and unit tests.
    }
  }

  private serialize(settings: AppSettingsDto): string {
    return `${JSON.stringify(settings, null, 2)}\n`;
  }
}
