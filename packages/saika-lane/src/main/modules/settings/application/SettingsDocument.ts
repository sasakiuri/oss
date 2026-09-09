// SPDX-License-Identifier: MIT
import { z } from 'zod';

import {
  AppSettingsDraftSchema,
  type AppSettingsDraftDto,
  type AppSettingsDto,
  type ConnectionSettingsDto,
  type UserPreferencesDto,
} from '@/shared/ipc/contracts';

const LEGACY_RED_DOT_RIFLE_DEVICE_ID = 'RDT_ZIE1_RIFLE';
const RED_DOT_RIFLE_DEVICE_ID = 'DISAG_KT_RDT_ZIE_1_RIFLE';
const LEGACY_RED_DOT_PISTOL_DEVICE_ID = 'RDT_ZIE1_PISTOL';
const RED_DOT_PISTOL_DEVICE_ID = 'DISAG_KT_RDT_ZIE_1_PISTOL';
const LEGACY_BPT216_DEVICE_ID = 'BP216';
const BPT216_DEVICE_ID = 'BPT216';

/** Normalize document values without reading storage or allocating a Lane identity. */
export function normalizeSettingsDraft(draft: unknown): AppSettingsDraftDto {
  const root = asRecord(draft);
  const isLegacyBpt216 = asRecord(root.connection).deviceId === LEGACY_BPT216_DEVICE_ID;
  const userPreferences = normalizeUserPreferencesDraft(root.userPreferences);
  return {
    connection: normalizeConnectionDraft(root.connection),
    userPreferences: isLegacyBpt216 ? migrateLegacyBpt216UserPreferences(userPreferences) : userPreferences,
    mqtt: normalizeMqttDraft(root.mqtt),
  };
}

export function normalizeConnectionDraft(input: unknown): AppSettingsDraftDto['connection'] {
  const section = asRecord(input);
  const connectionSchema = AppSettingsDraftSchema.shape.connection.removeDefault();
  const portName = parseDraftField(connectionSchema.shape.portName, section.portName);
  const hasStoredManufacturer = typeof section.manufacturer === 'string' && section.manufacturer.trim() !== '';
  const manufacturerResult = connectionSchema.shape.manufacturer.safeParse(section.manufacturer);
  const deviceId = parseDraftField(connectionSchema.shape.deviceId, section.deviceId);
  const isLegacyRedDotRifle = deviceId === LEGACY_RED_DOT_RIFLE_DEVICE_ID;
  const isLegacyRedDotPistol = deviceId === LEGACY_RED_DOT_PISTOL_DEVICE_ID;
  const migratedRedDotDeviceId = isLegacyRedDotRifle
    ? RED_DOT_RIFLE_DEVICE_ID
    : isLegacyRedDotPistol
      ? RED_DOT_PISTOL_DEVICE_ID
      : null;
  const migratedDeviceId = migratedRedDotDeviceId ?? (deviceId === LEGACY_BPT216_DEVICE_ID ? BPT216_DEVICE_ID : null);
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
    manufacturer: migratedRedDotDeviceId === null ? manufacturer : 'DISAG',
    deviceId: migratedDeviceId ?? deviceId,
    serialNumber: parseDraftField(connectionSchema.shape.serialNumber, section.serialNumber),
    vendorId: parseDraftField(connectionSchema.shape.vendorId, section.vendorId),
    productId: parseDraftField(connectionSchema.shape.productId, section.productId),
  });
}

export function normalizeUserPreferencesDraft(input: unknown): AppSettingsDraftDto['userPreferences'] {
  const section = asRecord(input);
  const userPreferencesSchema = AppSettingsDraftSchema.shape.userPreferences.removeDefault();

  return userPreferencesSchema.parse({
    laneNumber: parseDraftField(userPreferencesSchema.shape.laneNumber, section.laneNumber),
    discipline: parseDraftField(userPreferencesSchema.shape.discipline, section.discipline),
    competitionTypeId: parseDraftField(userPreferencesSchema.shape.competitionTypeId, section.competitionTypeId),
    audioVolume: parseDraftField(userPreferencesSchema.shape.audioVolume, section.audioVolume),
  });
}

function migrateLegacyBpt216UserPreferences(
  preferences: AppSettingsDraftDto['userPreferences'],
): AppSettingsDraftDto['userPreferences'] {
  return {
    ...preferences,
    discipline: preferences.discipline === 'BEAM_RIFLE_10M' ? 'BEAM_PISTOL_10M' : preferences.discipline,
    competitionTypeId:
      preferences.competitionTypeId === '' || preferences.competitionTypeId === 'BR60S'
        ? 'BP60'
        : preferences.competitionTypeId,
  };
}

export function normalizeMqttDraft(input: unknown): AppSettingsDraftDto['mqtt'] {
  const section = asRecord(input);
  const mqttSchema = AppSettingsDraftSchema.shape.mqtt.removeDefault();

  return mqttSchema.parse({
    enabled: parseDraftField(mqttSchema.shape.enabled, section.enabled),
    brokerUrl: parseDraftField(mqttSchema.shape.brokerUrl, section.brokerUrl),
    laneAlias: parseDraftField(mqttSchema.shape.laneAlias, section.laneAlias),
    autoConnect: parseDraftField(mqttSchema.shape.autoConnect, section.autoConnect),
    laneId: parseDraftField(mqttSchema.shape.laneId, section.laneId),
  });
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function shouldRecoverSection(value: unknown): boolean {
  return !isRecord(value) || Object.keys(value).length === 0;
}

export function shouldRecoverConnectionSection(value: unknown): boolean {
  if (shouldRecoverSection(value)) {
    return true;
  }

  const section = asRecord(value);
  const portName = typeof section.portName === 'string' ? section.portName.trim() : '';
  const connectionSchema = AppSettingsDraftSchema.shape.connection.removeDefault();
  const hasStoredManufacturer = typeof section.manufacturer === 'string' && section.manufacturer.trim() !== '';
  const manufacturerResult = connectionSchema.shape.manufacturer.safeParse(section.manufacturer);

  return portName !== '' && (!hasStoredManufacturer || !manufacturerResult.success);
}

function parseDraftField<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : schema.parse(undefined);
}

export function mergeLegacyUserPreferences(current: UserPreferencesDto, patch: UserPreferencesDto): UserPreferencesDto {
  return {
    ...current,
    ...(patch.laneNumber !== undefined ? { laneNumber: patch.laneNumber } : {}),
    ...(patch.audioVolume !== undefined ? { audioVolume: patch.audioVolume } : {}),
    ...(patch.discipline !== undefined ? { discipline: patch.discipline } : {}),
    ...(patch.competitionTypeId !== undefined ? { competitionTypeId: patch.competitionTypeId } : {}),
  };
}

export function toLegacyUserPreferences(
  userPreferences: AppSettingsDto['userPreferences'],
  current: UserPreferencesDto = {},
): UserPreferencesDto {
  return {
    ...(userPreferences.laneNumber !== 1 || current.laneNumber === 1 ? { laneNumber: userPreferences.laneNumber } : {}),
    ...(userPreferences.audioVolume !== 50 || current.audioVolume === 50
      ? { audioVolume: userPreferences.audioVolume }
      : {}),
    ...(userPreferences.discipline ? { discipline: userPreferences.discipline } : {}),
    ...(userPreferences.competitionTypeId !== '' || current.competitionTypeId === ''
      ? { competitionTypeId: userPreferences.competitionTypeId }
      : {}),
  };
}

export function toLegacyConnectionSettings(connection: AppSettingsDto['connection']): ConnectionSettingsDto {
  return {
    portName: connection.portName,
    manufacturer: connection.manufacturer,
    ...(connection.deviceId ? { deviceId: connection.deviceId } : {}),
    ...(connection.serialNumber ? { serialNumber: connection.serialNumber } : {}),
    ...(connection.vendorId ? { vendorId: connection.vendorId } : {}),
    ...(connection.productId ? { productId: connection.productId } : {}),
  };
}
