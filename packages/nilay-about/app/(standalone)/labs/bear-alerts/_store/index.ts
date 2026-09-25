import { z } from 'zod';

import { createSavedStore, hasPassed } from '@/features/labs-notify/saved-store';
import { bearPlaceSchema, BEAR_PLACES_MAX } from '@/lib/schemas/bear-alerts';

export const BEAR_ALERTS_STORAGE_KEY = 'nilay-labs-bear-alerts-v1';

const savedSchema = z.object({
  places: z.array(bearPlaceSchema).max(BEAR_PLACES_MAX),
  /** When the server forgets the registration, or null when this device has none. */
  registeredUntil: z.string().nullable(),
});
export type BearAlertsSaved = z.infer<typeof savedSchema>;

export const useBearAlertsStore = createSavedStore<BearAlertsSaved>(
  BEAR_ALERTS_STORAGE_KEY,
  savedSchema,
  { places: [], registeredUntil: null },
  (value, nowMs) =>
    value.registeredUntil && hasPassed(value.registeredUntil, nowMs) ? { ...value, registeredUntil: null } : value,
);
