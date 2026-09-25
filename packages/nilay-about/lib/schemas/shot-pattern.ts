import { z } from 'zod';

const finite = z.number().finite();

export const PATTERN_SETUP_MAX_LENGTH = 120;

/** Centimetres from the circle centre, x to the right and y upwards. */
export const shotOffsetSchema = z.object({ x: finite, y: finite });
export type ShotOffset = z.infer<typeof shotOffsetSchema>;

// A saved measurement never carries the photo: only the shots in real-world units and the setup.
export const patternRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  savedAt: z.string().min(1),
  diameterCm: finite.positive(),
  pellets: z.number().int().positive().nullable(),
  note: z.string(),
  shots: z.array(shotOffsetSchema),
  // Added with the choke plan; a record saved before them, or without them, has neither.
  /** Gun, barrel, choke and cartridge in one line, typed in or filled from Shotgun Gear. */
  setup: z.string().trim().min(1).max(PATTERN_SETUP_MAX_LENGTH).optional(),
  /** Muzzle to board. */
  distanceM: finite.positive().optional(),
});
export type PatternRecord = z.infer<typeof patternRecordSchema>;
