import { z } from 'zod';

import { createSavedStore, hasPassed } from '@/features/labs-notify/saved-store';
import { resultsIdSchema } from '@/lib/schemas/event-results';

export const EVENT_RESULTS_STORAGE_KEY = 'nilay-labs-event-results-v1';
export const SAVED_PAGES_MAX = 20;

/** The pages made on this device, so they can be found again. The passphrase is never saved. */
const savedSchema = z.object({
  pages: z.array(z.object({ id: resultsIdSchema, title: z.string(), expiresAt: z.string() })).max(SAVED_PAGES_MAX),
});
export type EventResultsSaved = z.infer<typeof savedSchema>;

export const useEventResultsStore = createSavedStore<EventResultsSaved>(
  EVENT_RESULTS_STORAGE_KEY,
  savedSchema,
  { pages: [] },
  (value, nowMs) => ({ pages: value.pages.filter((page) => !hasPassed(page.expiresAt, nowMs)) }),
);
