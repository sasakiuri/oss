// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { TimedTargetTimingSettingsSchema } from '@/shared/mqtt/TimedTargetTimingSettings';

export const MAX_TIMING_MEASUREMENT_BYTES = 262_144;
export const TimingMeasurementRequestSchema = z.object({
  sourceName: z.string().trim().min(1).max(255),
  content: z.string().min(1).max(MAX_TIMING_MEASUREMENT_BYTES),
  receiptMarginMilliseconds: z.number().finite().nonnegative().max(60_000),
  clockMarginMilliseconds: z.number().finite().nonnegative().max(60_000),
});
export const TimingMeasurementAnalysisSchema = z.object({
  algorithm: z.literal('SAMPLE_MAXIMUM_WITH_UNCERTAINTY_V1'),
  sourceName: z.string(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  receiptSamples: z.number().int().nonnegative(),
  clockSamples: z.number().int().nonnegative(),
  settings: TimedTargetTimingSettingsSchema.extend({ mode: z.literal('BOUNDED') }),
});
export const TimingMeasurementEvidenceSchema = z.object({
  request: TimingMeasurementRequestSchema,
  analysis: TimingMeasurementAnalysisSchema,
});
export type TimingMeasurementRequest = z.infer<typeof TimingMeasurementRequestSchema>;
export type TimingMeasurementAnalysis = z.infer<typeof TimingMeasurementAnalysisSchema>;
