import { z } from 'zod';

import {
  AUTO_OFF_MINUTES_MAX,
  BELL_TONES,
  INTERVAL_SECONDS_MAX,
  INTERVAL_SECONDS_MIN,
  PRE_TRIP_CHECKLIST,
} from '@/lib/bear-bell';

export const bellModeSchema = z.enum(['interval', 'walking']);
export type BellMode = z.infer<typeof bellModeSchema>;

const checklistIds = PRE_TRIP_CHECKLIST.map((item) => item.id) as [string, ...string[]];

export const bearBellSettingsSchema = z.object({
  tone: z.enum(BELL_TONES),
  volumePercent: z.number().int().min(0).max(100),
  mode: bellModeSchema,
  intervalSeconds: z.number().finite().min(INTERVAL_SECONDS_MIN).max(INTERVAL_SECONDS_MAX),
  varyInterval: z.boolean(),
  varyVolume: z.boolean(),
  // Must list exactly SENSITIVITY_LEVELS; the store's type is checked against it.
  sensitivity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  autoOffMinutes: z.number().int().min(0).max(AUTO_OFF_MINUTES_MAX),
  keepScreenOn: z.boolean(),
  /** The pre-trip items ticked, kept until the person clears them for the next trip. */
  checked: z.array(z.enum(checklistIds)),
});
export type BearBellSettings = z.infer<typeof bearBellSettingsSchema>;
