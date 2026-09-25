import { z } from 'zod';

export const fitUnitSchema = z.enum(['mm', 'inch']);
export type FitUnit = z.infer<typeof fitUnitSchema>;

/** The side the butt is moved to, seen from behind the gun looking towards the muzzle. */
export const castSideSchema = z.enum(['left', 'right', 'none']);
export type CastSide = z.infer<typeof castSideSchema>;

export const eyeTrialSchema = z.enum(['right', 'left', 'unclear']);
export type EyeTrial = z.infer<typeof eyeTrialSchema>;

export const FIT_TEXT_MAX_LENGTH = 60;
export const FIT_NOTE_MAX_LENGTH = 300;

/** A measurement left blank is null: the sheet prints an empty box for it rather than a zero. */
const length = z.number().finite().nonnegative().nullable();

/**
 * The dimensions of one stock, in the unit the owner measured in. The four measurements and where
 * each is taken follow the definitions quoted on the page (Orvis, Browning); pitch and the heel and
 * toe lengths are not given a field of their own because no primary source defining them was found,
 * and go in the note.
 */
export const fitSheetSchema = z.object({
  name: z.string().max(FIT_TEXT_MAX_LENGTH),
  shooter: z.string().max(FIT_TEXT_MAX_LENGTH),
  unit: fitUnitSchema,
  lengthOfPull: length,
  dropAtComb: length,
  dropAtHeel: length,
  cast: length,
  castSide: castSideSchema,
  note: z.string().max(FIT_NOTE_MAX_LENGTH),
});
export type FitSheet = z.infer<typeof fitSheetSchema>;

export const savedFitSheetSchema = fitSheetSchema.extend({
  id: z.string().min(1),
  savedAt: z.string().datetime(),
  name: z.string().trim().min(1).max(FIT_TEXT_MAX_LENGTH),
});
export type SavedFitSheet = z.infer<typeof savedFitSheetSchema>;
