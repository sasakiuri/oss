import { z } from 'zod';

const finite = z.number().finite();

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
});
export type PatternRecord = z.infer<typeof patternRecordSchema>;
