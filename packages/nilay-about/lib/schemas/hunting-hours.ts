import { z } from 'zod';

export const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

export const savedLocationSchema = coordinatesSchema.extend({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  presetId: z.string().nullable().default(null),
});
export type SavedLocation = z.infer<typeof savedLocationSchema>;
