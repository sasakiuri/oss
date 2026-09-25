import { z } from 'zod';

import { createSavedStore, hasPassed } from '@/features/labs-notify/saved-store';
import { membershipSchema } from '@/lib/schemas/location-share';

export const LOCATION_SHARE_STORAGE_KEY = 'nilay-labs-location-share-v1';

/** Only the membership, so a reload returns to the room. Positions are never saved on the device. */
const savedSchema = z.object({ membership: membershipSchema.nullable() });
export type LocationShareSaved = z.infer<typeof savedSchema>;

export const useLocationShareStore = createSavedStore<LocationShareSaved>(
  LOCATION_SHARE_STORAGE_KEY,
  savedSchema,
  { membership: null },
  // The member token of an ended room is removed with it.
  (value, nowMs) => (value.membership && hasPassed(value.membership.expiresAt, nowMs) ? { membership: null } : value),
);
