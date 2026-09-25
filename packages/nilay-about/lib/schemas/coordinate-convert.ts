import { z } from 'zod';

const text = z.string().max(80);

/** What was typed, as typed, so a half-written value survives a reload. */
export const coordinateInputSchema = z.object({
  format: z.enum(['latlon', 'utm', 'mgrs', 'plane', 'mesh']),
  latitude: text,
  longitude: text,
  utmZone: text,
  utmHemisphere: z.enum(['N', 'S']),
  utmEasting: text,
  utmNorthing: text,
  mgrs: text,
  planeSystem: z.number().int().min(1).max(19),
  planeX: text,
  planeY: text,
  mesh: text,
});
