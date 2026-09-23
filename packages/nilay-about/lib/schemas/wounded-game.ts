import { z } from 'zod';

/** What the hunter can see at the shot site and on the trail. Several can be ticked at once. */
export const cueIdSchema = z.enum([
  'bright-red',
  'dark-red',
  'frothy',
  'gut-fluid',
  'both-sides',
  'hair-bone',
  'no-blood',
  'down-in-sight',
]);
export type CueId = z.infer<typeof cueIdSchema>;

/** Where the hunter believes the shot struck, before any sign is read. */
export const impressionSchema = z.enum(['chest', 'unsure', 'gut', 'outside-cavity']);
export type Impression = z.infer<typeof impressionSchema>;

export const entryKindSchema = z.enum(['shot-site', 'blood', 'sign', 'lost', 'recovered', 'note']);
export type EntryKind = z.infer<typeof entryKindSchema>;

const localPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Milliseconds for a local wall-clock time read as if it were UTC, or `null` for a time that does not
 * exist. The saved data and the arithmetic share this check, so a date the calculation refuses is
 * never stored as valid.
 */
export function localDateTimeMs(local: string): number | null {
  const match = localPattern.exec(local);
  if (!match) return null;
  const [year, month, day, hour, minute] = [1, 2, 3, 4, 5].map((index) => Number(match[index])) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  const ms = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(ms);
  // Date.UTC rolls 30 February into March; a day that does not exist is not a time.
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month - 1) return null;
  return ms;
}

/** A local date and time as a `datetime-local` field writes it, without seconds or a zone. */
export const localDateTimeSchema = z.string().refine((value) => localDateTimeMs(value) !== null);

export const NOTE_MAX_LENGTH = 500;
export const ENTRY_LIMIT = 200;

export const positionSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().nonnegative().nullable(),
});
export type Position = z.infer<typeof positionSchema>;

export const trailEntrySchema = z.object({
  id: z.string().min(1),
  at: localDateTimeSchema,
  kind: entryKindSchema,
  note: z.string().max(NOTE_MAX_LENGTH),
  position: positionSchema.nullable(),
});
export type TrailEntry = z.infer<typeof trailEntrySchema>;

export const woundedGameStateSchema = z.object({
  /** Empty until the hunter sets it: a guessed time would put a false start time on the page. */
  shotAt: z.union([localDateTimeSchema, z.literal('')]),
  impression: impressionSchema,
  cues: z.array(cueIdSchema).refine((cues) => new Set(cues).size === cues.length),
  entries: z.array(trailEntrySchema).max(ENTRY_LIMIT),
});
export type WoundedGameState = z.infer<typeof woundedGameStateSchema>;
