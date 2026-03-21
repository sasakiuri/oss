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

// ============================================================
// Settings data schemas
// ============================================================

export const ConnectionSettingsSchema = z.object({
  portName: z.string(),
  manufacturer: TargetManufacturerSchema,
  deviceId: z.string().optional(),
});

const UserPreferencesSchema = z.object({
  laneNumber: z.number().optional(),
  discipline: DisciplineSchema.optional(),
  competitionTypeId: z.string().optional(),
  audioVolume: z.number().int().min(0).max(100).optional(),
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
});

// ============================================================
// Exported inferred types
// ============================================================

export type ConnectionSettingsDto = z.infer<typeof ConnectionSettingsSchema>;
export type UserPreferencesDto = z.infer<typeof UserPreferencesSchema>;
export type SaveConnectionSettingsInput = z.infer<typeof SaveConnectionSettingsInputSchema>;
export type SaveUserPreferencesInput = z.infer<typeof SaveUserPreferencesInputSchema>;
