// SPDX-License-Identifier: MIT
/**
 * Settings IPC Contract
 *
 * @description
 * Defines Zod-based contracts for settings-related IPC channels.
 * Covers connection settings and user preferences CRUD operations.
 */

import { z } from 'zod';

import { command, CommandResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';
import { TargetManufacturerSchema } from '../schemas/common';

// ============================================================
// Shared enums / literals
// ============================================================

const DisciplineSchema = z.union([
  z.literal('AIR_RIFLE_10M'),
  z.literal('AIR_PISTOL_10M'),
  z.literal('RIFLE_50M'),
  z.literal('PISTOL_25M'),
  z.literal('BEAM_RIFLE_10M'),
]);

/** Regex for validating MQTT broker URLs (mqtt:// or mqtts://) */
const mqttUrlPattern = /^mqtts?:\/\//;

/** Regex to detect userinfo (username:password@) in a URL */
const mqttUserinfoPattern = /^mqtts?:\/\/[^@/]+@/;

// ============================================================
// Settings data schemas
// ============================================================

export const ConnectionSettingsSchema = z.object({
  portName: z.string(),
  manufacturer: TargetManufacturerSchema,
  deviceId: z.string().optional(),
  serialNumber: z.string().optional(),
  vendorId: z.string().optional(),
  productId: z.string().optional(),
});

const UserPreferencesSchema = z.object({
  laneNumber: z.number().optional(),
  discipline: DisciplineSchema.optional(),
  competitionTypeId: z.string().optional(),
  audioVolume: z.number().int().min(0).max(100).optional(),
});

const AppSettingsInputConnectionSchema = z.object({
  portName: z.string(),
  manufacturer: TargetManufacturerSchema,
  deviceId: z.string(),
  serialNumber: z.string(),
  vendorId: z.string(),
  productId: z.string(),
});

const AppSettingsInputUserPreferencesSchema = z.object({
  laneNumber: z.number().int().min(1),
  discipline: DisciplineSchema.nullable(),
  competitionTypeId: z.string(),
  audioVolume: z.number().int().min(0).max(100),
});

const AppSettingsInputMqttSchema = z.object({
  enabled: z.boolean(),
  brokerUrl: z
    .string()
    .refine((v) => v === '' || mqttUrlPattern.test(v), { message: 'Must be empty or a valid mqtt:// / mqtts:// URL' })
    .refine((v) => !mqttUserinfoPattern.test(v), {
      message: 'Broker URL must not contain credentials (username:password@)',
    }),
  laneAlias: z.string(),
  autoConnect: z.boolean(),
  laneId: z.string().uuid().optional(),
});

export const AppSettingsInputSchema = z.object({
  connection: AppSettingsInputConnectionSchema,
  userPreferences: AppSettingsInputUserPreferencesSchema,
  mqtt: AppSettingsInputMqttSchema,
});

const PersistedConnectionSettingsSchema = z.object({
  portName: z.string().default(''),
  manufacturer: TargetManufacturerSchema.default('KOHTO'),
  deviceId: z.string().default(''),
  serialNumber: z.string().default(''),
  vendorId: z.string().default(''),
  productId: z.string().default(''),
});

const PersistedUserPreferencesSchema = z.object({
  laneNumber: z.number().int().min(1).default(1),
  discipline: DisciplineSchema.nullable().default(null),
  competitionTypeId: z.string().default(''),
  audioVolume: z.number().int().min(0).max(100).default(50),
});

const PersistedMqttSettingsDraftSchema = z.object({
  enabled: z.boolean().default(false),
  brokerUrl: z
    .string()
    .refine((v) => v === '' || mqttUrlPattern.test(v), { message: 'Must be empty or a valid mqtt:// / mqtts:// URL' })
    .refine((v) => !mqttUserinfoPattern.test(v), {
      message: 'Broker URL must not contain credentials (username:password@)',
    })
    .default(''),
  laneAlias: z.string().default(''),
  autoConnect: z.boolean().default(false),
  laneId: z.string().uuid().optional(),
});

export const AppSettingsDraftSchema = z.object({
  connection: PersistedConnectionSettingsSchema.default(() => ({
    portName: '',
    manufacturer: 'KOHTO' as const,
    deviceId: '',
    serialNumber: '',
    vendorId: '',
    productId: '',
  })),
  userPreferences: PersistedUserPreferencesSchema.default(() => ({
    laneNumber: 1,
    discipline: null,
    competitionTypeId: '',
    audioVolume: 50,
  })),
  mqtt: PersistedMqttSettingsDraftSchema.default(() => ({
    enabled: false,
    brokerUrl: '',
    laneAlias: '',
    autoConnect: false,
  })),
});

export const AppSettingsSchema = z.object({
  connection: PersistedConnectionSettingsSchema,
  userPreferences: PersistedUserPreferencesSchema,
  mqtt: PersistedMqttSettingsDraftSchema.extend({
    laneId: z.string().uuid(),
  }),
});

const SettingsFileInfoSchema = z.object({
  path: z.string(),
});

// ============================================================
// Command input schemas
// ============================================================

const SaveConnectionSettingsInputSchema = z.object({
  settings: ConnectionSettingsSchema,
});

const SaveUserPreferencesInputSchema = z.object({
  preferences: UserPreferencesSchema,
});

const SaveAppSettingsInputSchema = z.object({
  settings: AppSettingsInputSchema,
});

// ============================================================
// Contract definition
// ============================================================

export const settingsContract = defineContract('settings', {
  saveConnectionSettings: command(SaveConnectionSettingsInputSchema, CommandResponseSchema, {
    channel: 'settings:save-connection-settings',
  }),
  getConnectionSettings: query(queryResponseSchema(ConnectionSettingsSchema), {
    channel: 'settings:get-connection-settings',
  }),
  saveUserPreferences: command(SaveUserPreferencesInputSchema, CommandResponseSchema, {
    channel: 'settings:save-user-preferences',
  }),
  getUserPreferences: query(queryResponseSchema(UserPreferencesSchema), {
    channel: 'settings:get-user-preferences',
  }),
  saveAppSettings: command(SaveAppSettingsInputSchema, CommandResponseSchema, {
    channel: 'settings:save-app-settings',
  }),
  getAppSettings: query(queryResponseSchema(AppSettingsSchema), {
    channel: 'settings:get-app-settings',
  }),
  getSettingsFileInfo: query(queryResponseSchema(SettingsFileInfoSchema), {
    channel: 'settings:get-settings-file-info',
  }),
});

// ============================================================
// Exported inferred types
// ============================================================

export type ConnectionSettingsDto = z.infer<typeof ConnectionSettingsSchema>;
export type UserPreferencesDto = z.infer<typeof UserPreferencesSchema>;
export type AppSettingsInputDto = z.infer<typeof AppSettingsInputSchema>;
export type AppSettingsDto = z.infer<typeof AppSettingsSchema>;
export type AppSettingsDraftDto = z.infer<typeof AppSettingsDraftSchema>;
export type SettingsFileInfoDto = z.infer<typeof SettingsFileInfoSchema>;
export type SaveConnectionSettingsInput = z.infer<typeof SaveConnectionSettingsInputSchema>;
export type SaveUserPreferencesInput = z.infer<typeof SaveUserPreferencesInputSchema>;
export type SaveAppSettingsInput = z.infer<typeof SaveAppSettingsInputSchema>;
