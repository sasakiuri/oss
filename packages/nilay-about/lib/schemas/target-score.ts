import { z } from 'zod';

const finite = z.number().finite();

export const issfTargetKeySchema = z.enum(['AR10', 'AP10', 'FR50', 'P25', 'CF25']);

/** A shot in millimetres from the centre of the target, x to the right and y upwards. */
export const scoredShotSchema = z.object({ x: finite, y: finite, sighter: z.boolean() });

/** A card that was saved: only positions and settings, never the photo. Scores are worked out again when read. */
export const scoreSessionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  savedAt: z.string().min(1),
  target: issfTargetKeySchema,
  decimal: z.boolean(),
  shots: z.array(scoredShotSchema),
});
export type ScoreSession = z.infer<typeof scoreSessionSchema>;
