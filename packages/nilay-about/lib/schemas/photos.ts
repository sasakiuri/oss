import { z } from 'zod';

/**
 * A photo attached to a record in a Labs tool, as it is kept in this browser's IndexedDB.
 *
 * Every photo is redrawn before it is kept: scaled to fit `PHOTO_MAX_EDGE` and encoded as JPEG. That
 * bounds what a phone's 12-megapixel picture costs in storage, and it leaves behind the file's
 * metadata, including the position a phone camera writes into it.
 */
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_JPEG_QUALITY = 0.85;
/** Photos on one record. Enough for a catch from several sides, and a bound on the storage one record takes. */
export const PHOTOS_PER_RECORD_MAX = 10;
/** A photo at `PHOTO_MAX_EDGE` and this quality stays well under this; a bound on what one record can hold. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

/** Stored as an ArrayBuffer rather than a Blob: Safari cannot put a Blob in IndexedDB in a private window. */
export const arrayBufferSchema = z.custom<ArrayBuffer>(
  (value) => Object.prototype.toString.call(value) === '[object ArrayBuffer]',
  'Expected an ArrayBuffer',
);

export const savedPhotoSchema = z.object({
  id: z.string().min(1).max(128),
  /** The tool's slug, so a tool only ever lists and deletes its own photos. */
  tool: z.string().min(1).max(64),
  /** The record in that tool the photo belongs to. */
  ownerId: z.string().min(1).max(128),
  type: z.literal('image/jpeg'),
  data: arrayBufferSchema.refine((data) => data.byteLength > 0 && data.byteLength <= PHOTO_MAX_BYTES),
  width: z.number().int().positive().max(PHOTO_MAX_EDGE),
  height: z.number().int().positive().max(PHOTO_MAX_EDGE),
  addedAt: z.string().datetime(),
});
export type SavedPhoto = z.infer<typeof savedPhotoSchema>;
