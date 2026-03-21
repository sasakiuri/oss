// SPDX-License-Identifier: MIT
/**
 * SessionStorageSchema — runtime validation of storage data
 *
 * Validates the structure of data loaded from electron-store using Zod,
 * and provides clear error messages for corrupted data.
 */

import { z } from 'zod';

import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

const ImpactPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const ShotStorageSchema = z.object({
  id: z.string(),
  shotNumber: z.number().int().positive(),
  impactPoint: ImpactPointSchema.nullable(),
  score: z.number(),
  innerTen: z.boolean(),
  timestamp: z.string(),
  seriesNumber: z.number().int().nonnegative(),
  mode: z.union([z.literal('SIGHTING'), z.literal('MATCH')]),
  deviceScore: z.number().optional(),
});

const SeriesStorageSchema = z.object({
  seriesNumber: z.number().int().positive(),
  totalScore: z.number(),
  maxShots: z.number().int().nonnegative().optional().default(10),
});

export const SessionStorageSchema = z.object({
  id: z.string(),
  discipline: z.union([
    z.literal('AIR_RIFLE_10M'),
    z.literal('AIR_PISTOL_10M'),
    z.literal('RIFLE_50M'),
    z.literal('PISTOL_25M'),
    z.literal('BEAM_RIFLE_10M'),
  ]),
  mode: z.union([z.literal('SIGHTING'), z.literal('MATCH')]),
  series: z.array(SeriesStorageSchema),
  allShots: z.array(ShotStorageSchema),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  scoringMode: z
    .union([z.literal('RING'), z.literal('DECIMAL')])
    .optional()
    .default('DECIMAL'),
});

/**
 * Validates and converts unknown data to SessionStorageData
 *
 * @param data - Unvalidated data loaded from storage
 * @returns Validated SessionStorageData
 * @throws {Error} If the data is invalid, an error message indicating the corrupted field
 */
export function parseSessionStorageData(data: unknown): z.infer<typeof SessionStorageSchema> {
  const result = SessionStorageSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw ErrorCatalog.createError('STORAGE_DATA_CORRUPTED', { detail: issues });
  }
  return result.data;
}
