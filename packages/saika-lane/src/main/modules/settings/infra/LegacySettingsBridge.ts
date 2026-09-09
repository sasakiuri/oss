// SPDX-License-Identifier: MIT
import {
  AppSettingsDraftSchema,
  AppSettingsSchema,
  type AppSettingsDraftDto,
  type AppSettingsDto,
  type UserPreferencesDto,
} from '@/shared/ipc/contracts';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import {
  asRecord,
  normalizeConnectionDraft,
  normalizeMqttDraft,
  normalizeUserPreferencesDraft,
  shouldRecoverConnectionSection,
  shouldRecoverSection,
  toLegacyConnectionSettings,
  toLegacyUserPreferences,
} from '../application/SettingsDocument';

/** Owns the existing electron-store projection and reads used to complete older documents. */
export class LegacySettingsBridge {
  constructor(private readonly storage: ILocalStorage) {}

  readInitialDraft(): unknown {
    return {
      connection: this.readLegacyConnectionInput(),
      userPreferences: this.readLegacyUserPreferences(),
      mqtt: this.readLegacyMqttSettings(),
    };
  }

  saveUserPreferences(preferences: UserPreferencesDto): void {
    this.storage.set('userPreferences', preferences);
  }

  private readLegacyConnectionInput(): unknown {
    return this.storage.get('connectionSettings') ?? {};
  }

  private readLegacyConnection(): AppSettingsDraftDto['connection'] {
    return normalizeConnectionDraft(this.readLegacyConnectionInput());
  }

  private readLegacyUserPreferences(): AppSettingsDraftDto['userPreferences'] {
    return normalizeUserPreferencesDraft(this.storage.get('userPreferences') ?? {});
  }

  private readLegacyMqttSettings(): AppSettingsDraftDto['mqtt'] {
    const legacy = this.storage.get('mqtt.settings') ?? {};
    const laneId = this.storage.get<string>('mqtt.laneId');
    return normalizeMqttDraft({
      ...(typeof legacy === 'object' && legacy !== null ? legacy : {}),
      ...(laneId !== undefined ? { laneId } : {}),
    });
  }

  mergeMissingSectionsFromLegacy(draft: Record<string, unknown>): Record<string, unknown> {
    return {
      ...draft,
      ...(shouldRecoverConnectionSection(draft.connection)
        ? { connection: this.readLegacyConnectionInput() }
        : { connection: this.mergeConnectionFromLegacy(draft.connection) }),
      ...(shouldRecoverSection(draft.userPreferences)
        ? { userPreferences: this.readLegacyUserPreferences() }
        : { userPreferences: this.mergeUserPreferencesFromLegacy(draft.userPreferences) }),
      ...(shouldRecoverSection(draft.mqtt)
        ? { mqtt: this.readLegacyMqttSettings() }
        : { mqtt: this.mergeMqttFromLegacy(draft.mqtt) }),
    };
  }

  private mergeUserPreferencesFromLegacy(value: unknown): Record<string, unknown> {
    const legacy = this.readLegacyUserPreferences();
    const section = asRecord(value);

    return {
      ...legacy,
      ...section,
    };
  }

  private mergeConnectionFromLegacy(value: unknown): Record<string, unknown> {
    const legacy = this.readLegacyConnection();
    const section = asRecord(value);
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
    const section = asRecord(value);

    return {
      ...legacy,
      ...section,
    };
  }

  getValidLegacyLaneId(): string | null {
    const laneId = this.storage.get<string>('mqtt.laneId');
    const result = AppSettingsSchema.shape.mqtt.shape.laneId.safeParse(laneId);
    return result.success ? result.data : null;
  }

  syncLegacyStorage(settings: AppSettingsDto): void {
    this.storage.set('mqtt.laneId', settings.mqtt.laneId);
    this.storage.set('mqtt.settings', settings.mqtt);
    this.storage.set(
      'userPreferences',
      toLegacyUserPreferences(settings.userPreferences, this.getStoredLegacyUserPreferences()),
    );

    if (settings.connection.portName) {
      this.storage.set('connectionSettings', toLegacyConnectionSettings(settings.connection));
    } else if (this.storage.has('connectionSettings')) {
      this.storage.delete('connectionSettings');
    }
  }

  getStoredLegacyUserPreferences(): UserPreferencesDto {
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
}
