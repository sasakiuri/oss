// SPDX-License-Identifier: MIT
/** Validates session data loaded from electron-store. */

import { z } from 'zod';

import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { DisciplineSchema } from '@/shared/ipc/schemas/common';
import { SCORING_GAUGE_PROFILE_IDS, TARGET_SCORING_PROFILE_IDS } from '@/shared/target';

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
  calculatedScore: z.number().optional(),
  receivedAt: z.string().optional(),
  sourceObservationId: z.string().optional(),
  competitionContext: z
    .object({
      competitionId: z.string().min(1),
      stageIndex: z.number().int().nonnegative(),
      seriesIndex: z.number().int().nonnegative(),
    })
    .optional(),
  targetProfileId: z.enum(TARGET_SCORING_PROFILE_IDS).optional(),
  scoringGaugeProfileId: z.enum(SCORING_GAUGE_PROFILE_IDS).optional(),
});

const SeriesStorageSchema = z.object({
  seriesNumber: z.number().int().positive(),
  totalScore: z.number(),
  maxShots: z.number().int().nonnegative().optional().default(10),
});

export const SessionStorageSchema = z.object({
  id: z.string(),
  discipline: DisciplineSchema,
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
