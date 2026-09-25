import { z } from 'zod';

export const hunterMapModelSchema = z.enum(['affine', 'similarity']);
export const hunterMapProjectionSchema = z.enum(['transverse-mercator', 'web-mercator']);

/** Only pictures the browser can draw without a new library; a PDF has to be turned into one first. */
export const hunterMapImageTypes = ['image/png', 'image/jpeg'] as const;

export const savedMapImageSchema = z.object({
  id: z.string().min(1),
  /**
   * The picture's bytes. Stored as an ArrayBuffer rather than a Blob: Safari cannot put a Blob in
   * IndexedDB in a private window.
   */
  data: z.custom<ArrayBuffer>(
    (value) => Object.prototype.toString.call(value) === '[object ArrayBuffer]',
    'Expected an ArrayBuffer',
  ),
  type: z.enum(hunterMapImageTypes),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type SavedMapImage = z.infer<typeof savedMapImageSchema>;

export const referencePointSchema = z.object({
  id: z.string().min(1),
  /** Pixels from the top left of the picture; null until it has been placed on the picture. */
  x: z.number().finite().nullable(),
  y: z.number().finite().nullable(),
  /** As typed, so decimal degrees and degrees–minutes–seconds both come back the way they were written. */
  latitude: z.string().max(64),
  longitude: z.string().max(64),
  /** The reported accuracy in metres, when the latitude and longitude came from this device. */
  accuracy: z.number().finite().nonnegative().nullable(),
});
export type ReferencePoint = z.infer<typeof referencePointSchema>;

export const maxReferencePoints = 20;
export const maxZones = 50;
export const maxZoneVertices = 200;
export const MAP_NAME_MAX = 100;
export const ZONE_NAME_MAX = 60;

/** An area the reader traced on the picture, such as a protected area, in the picture's pixels. */
export const zoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(ZONE_NAME_MAX),
  points: z
    .array(z.object({ x: z.number().finite(), y: z.number().finite() }))
    .min(3)
    .max(maxZoneVertices),
});
export type Zone = z.infer<typeof zoneSchema>;

/** One map's setup. Its id is the id of its picture, so points are never read against another picture. */
export const hunterMapSetupSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(MAP_NAME_MAX),
  /** The fiscal year (April to March) the prefecture's map is for, such as 2025 for 令和7年度. */
  fiscalYear: z.number().int().min(1989).max(2100).nullable(),
  points: z.array(referencePointSchema).max(maxReferencePoints),
  model: hunterMapModelSchema,
  projection: hunterMapProjectionSchema,
  zones: z.array(zoneSchema).max(maxZones),
});
export type HunterMapSetup = z.infer<typeof hunterMapSetupSchema>;
