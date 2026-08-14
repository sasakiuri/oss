// SPDX-License-Identifier: MIT
/**
 * Common IPC Schemas
 *
 * @description
 * Shared Zod schemas used across multiple IPC contracts.
 */

import { z } from 'zod';

export const TargetManufacturerSchema = z.union([
  z.literal('SIUS'),
  z.literal('MEYTON'),
  z.literal('DISAG'),
  z.literal('CUSTOM'),
  z.literal('KOHTO'),
]);

export type TargetManufacturer = z.infer<typeof TargetManufacturerSchema>;

export const DisciplineSchema = z.union([
  z.literal('AIR_RIFLE_10M'),
  z.literal('AIR_PISTOL_10M'),
  z.literal('RIFLE_50M'),
  z.literal('PISTOL_25M'),
  z.literal('BEAM_RIFLE_10M'),
  z.literal('BEAM_PISTOL_10M'),
]);

export type Discipline = z.infer<typeof DisciplineSchema>;
