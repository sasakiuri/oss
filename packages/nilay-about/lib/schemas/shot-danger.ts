import { z } from 'zod';

import type { ConeRowId } from '../shot-danger';

export const geoPointSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

/** The rows of DA PAM 385-63's tables that are drawn with figure 4-1. */
const coneRows = ['12-gauge-slug', '22-lr'] as const satisfies readonly ConeRowId[];

export const shotDangerSettingsSchema = z
  .object({
    ammunition: z.enum(coneRows),
    firing: geoPointSchema.nullable(),
    /** Degrees clockwise from true north. */
    bearing: z.number().finite().min(0).max(360),
  })
  .strict();
export type ShotDangerSettings = z.infer<typeof shotDangerSettingsSchema>;
