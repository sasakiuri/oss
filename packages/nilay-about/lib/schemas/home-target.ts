import { z } from 'zod';

export const paperSchema = z.enum(['a4', 'letter', 'target']);
export type TargetPaper = z.infer<typeof paperSchema>;
export const copiesSchema = z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6)]);
export type TargetCopies = z.infer<typeof copiesSchema>;
const conditionsSchema = z.object({
  eyeCm: z.number().finite().positive(),
  distanceCm: z.number().finite().positive(),
  heightCm: z.number().finite(),
});
export interface TargetPrintOptions {
  copies: TargetCopies;
  conditions?: z.infer<typeof conditionsSchema>;
  /** Four corner marks whose spacing is printed, for correcting a photo of the sheet taken at an angle. */
  markers?: boolean;
}
export const targetRequestSchema = z.object({
  blackAreaSize: z.object({ number: z.number().finite().positive().max(100), unit: z.literal('cm') }),
  paper: paperSchema.default('target'),
  copies: copiesSchema.default(1),
  conditions: conditionsSchema.optional(),
  markers: z.boolean().default(false),
});
