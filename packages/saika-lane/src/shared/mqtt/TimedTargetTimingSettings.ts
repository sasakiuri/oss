// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** Installation measurements, independent from rule-defined firing and recording windows. */
export const TimedTargetTimingSettingsSchema = z.object({
  mode: z.enum(['BOUNDED', 'TIMESTAMP']),
  maximumReceiptDelayMilliseconds: z.number().int().nonnegative().max(60_000).nullable(),
  clockUncertaintyMilliseconds: z.number().int().nonnegative().max(60_000).nullable(),
});

export type TimedTargetTimingSettings = z.infer<typeof TimedTargetTimingSettingsSchema>;

export const DEFAULT_TIMED_TARGET_TIMING_SETTINGS: TimedTargetTimingSettings = Object.freeze({
  mode: 'BOUNDED',
  maximumReceiptDelayMilliseconds: null,
  clockUncertaintyMilliseconds: null,
});
