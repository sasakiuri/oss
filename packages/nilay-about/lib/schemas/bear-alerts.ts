import { z } from 'zod';

import { RADIUS_KM_OPTIONS } from '@/lib/bear-alerts';

import { latitudeSchema, longitudeSchema, subscriptionRequestSchema } from './push';

export const BEAR_PLACES_MAX = 5;

export const bearPlaceSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  radiusKm: z.number().refine((value) => (RADIUS_KM_OPTIONS as readonly number[]).includes(value)),
});
export type BearPlace = z.infer<typeof bearPlaceSchema>;

export const bearWatchRequestSchema = subscriptionRequestSchema.extend({
  places: z.array(bearPlaceSchema).min(1).max(BEAR_PLACES_MAX),
});
