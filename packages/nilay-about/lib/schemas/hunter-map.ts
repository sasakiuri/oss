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

export const hunterMapSetupSchema = z.object({
  /** The picture these points were placed on, so points are never read against another picture. */
  imageId: z.string().nullable(),
  points: z.array(referencePointSchema).max(maxReferencePoints),
  model: hunterMapModelSchema,
  projection: hunterMapProjectionSchema,
});
export type HunterMapSetup = z.infer<typeof hunterMapSetupSchema>;
