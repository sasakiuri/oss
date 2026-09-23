import { z } from 'zod';

export const clayDisciplineSchema = z.enum(['trap', 'skeet']);
export type ClayDiscipline = z.infer<typeof clayDisciplineSchema>;

export const targetResultSchema = z.enum(['hit', 'miss']);
export type TargetResult = z.infer<typeof targetResultSchema>;

/** A round is 25 targets in both disciplines (ISSF Rule 9.6.1.3). */
export const TARGETS_PER_ROUND = 25;

/** Trap is shot from five stations (ISSF Rule 6.4.18); the starting one depends on the squad position. */
export const trapStartStationSchema = z.number().int().min(1).max(5);

/** A note is a place or a gun, not an essay, and it is kept short so the history stays readable. */
export const NOTE_MAX_LENGTH = 200;
export const noteSchema = z.string().max(NOTE_MAX_LENGTH);

/** The sheet being filled in. A target not yet shot at is null. */
export const sheetResultsSchema = z.array(targetResultSchema.nullable()).length(TARGETS_PER_ROUND);

const recordBase = {
  id: z.string().min(1),
  savedAt: z.string().datetime(),
  results: z.array(targetResultSchema).length(TARGETS_PER_ROUND),
  note: noteSchema,
};

// Only trap needs the starting station: a skeet round is shot in the same order by everyone.
export const clayRoundRecordSchema = z.discriminatedUnion('discipline', [
  z.object({ discipline: z.literal('trap'), startStation: trapStartStationSchema, ...recordBase }),
  z.object({ discipline: z.literal('skeet'), ...recordBase }),
]);
export type ClayRoundRecord = z.infer<typeof clayRoundRecordSchema>;
