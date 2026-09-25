import { z } from 'zod';

export const clayDisciplineSchema = z.enum(['trap', 'skeet']);
export type ClayDiscipline = z.infer<typeof clayDisciplineSchema>;

/**
 * What became of one target.
 *
 * Trap allows two shots at a target outside finals (ISSF Rule 9.8.1.1 d), so a hit can be recorded
 * with the barrel that broke it, `first` or `second`. `hit` is a hit whose barrel was not recorded:
 * every skeet hit, since skeet loads one cartridge per target (ISSF Rule 9.9.1.1 a, b), and a trap
 * hit on a sheet kept without the barrels.
 */
export const targetResultSchema = z.enum(['hit', 'first', 'second', 'miss']);
export type TargetResult = z.infer<typeof targetResultSchema>;

/**
 * The way a trap target flew, as seen from the station. Each athlete gets 2 left, 2 right and 1 centre
 * from each station (ISSF Rule 9.8.1.1 f). Recording it is optional.
 */
export const trapDirectionSchema = z.enum(['left', 'centre', 'right']);
export type TrapDirection = z.infer<typeof trapDirectionSchema>;

/** A round is 25 targets in both disciplines (ISSF Rule 9.6.1.3). */
export const TARGETS_PER_ROUND = 25;

/** Trap is shot from five stations (ISSF Rule 6.4.18); the starting one depends on the squad position. */
export const trapStartStationSchema = z.number().int().min(1).max(5);

/** A squad is six athletes (ISSF Rule 9.10.2.1 a); the sixth waits behind trap station 1 (Rule 9.8.1). */
export const MAX_SQUAD = 6;

/** A note is a place or a gun, not an essay, and it is kept short so the history stays readable. */
export const NOTE_MAX_LENGTH = 200;
export const noteSchema = z.string().max(NOTE_MAX_LENGTH);

/** Names and tags are a word or two each: a gun, a cartridge, a range, the weather. */
export const TAG_MAX_LENGTH = 60;
export const tagSchema = z.string().max(TAG_MAX_LENGTH);

export const clayTagsSchema = z.object({
  gun: tagSchema,
  cartridge: tagSchema,
  range: tagSchema,
  weather: tagSchema,
});
export type ClayTags = z.infer<typeof clayTagsSchema>;
export type ClayTagKey = keyof ClayTags;
export const emptyTags = (): ClayTags => ({ gun: '', cartridge: '', range: '', weather: '' });

/** The sheet being filled in. A target not yet shot at is null. */
export const sheetResultsSchema = z.array(targetResultSchema.nullable()).length(TARGETS_PER_ROUND);
export const sheetDirectionsSchema = z.array(trapDirectionSchema.nullable()).length(TARGETS_PER_ROUND);

/**
 * A saved round. `id`, `savedAt`, `results` and `note` (and a trap round's starting station) are what
 * every round has carried from the start. The rest were added later and are optional: a round without
 * one did not record it, and is counted as such rather than given a value it never had.
 */
const recordBase = {
  id: z.string().min(1),
  savedAt: z.string().datetime(),
  results: z.array(targetResultSchema).length(TARGETS_PER_ROUND),
  note: noteSchema,
  /** Trap only. Missing: no direction recorded for any target. */
  directions: sheetDirectionsSchema.optional(),
  /** The name typed in for a member of a squad. Missing or empty: no name. */
  shooter: tagSchema.optional(),
  /** Rounds saved in the same session belong together, as the 4 × 25 of a 100-target day. Missing: none. */
  sessionId: z.string().min(1).optional(),
  /** Missing: no tags. */
  tags: clayTagsSchema.optional(),
};

// Only trap needs the starting station: a skeet round is shot in the same order by everyone.
export const clayRoundRecordSchema = z
  .discriminatedUnion('discipline', [
    z.object({
      discipline: z.literal('trap'),
      startStation: trapStartStationSchema,
      /** Whether the hits on this sheet say which barrel broke them. Missing: they do not. */
      barrels: z.boolean().optional(),
      ...recordBase,
    }),
    z.object({ discipline: z.literal('skeet'), ...recordBase }),
  ])
  .superRefine((record, context) => {
    const allowed = resultsAllowed(record.discipline, record.discipline === 'trap' && record.barrels === true);
    if (record.results.some((result) => !allowed.includes(result)))
      context.addIssue({ code: 'custom', path: ['results'], message: 'result not allowed on this sheet' });
    if (record.discipline === 'skeet' && record.directions?.some((direction) => direction !== null))
      context.addIssue({ code: 'custom', path: ['directions'], message: 'skeet has no trap directions' });
  });
export type ClayRoundRecord = z.infer<typeof clayRoundRecordSchema>;

/** The results a sheet can hold: the barrels for trap when they are recorded, a plain hit otherwise. */
export function resultsAllowed(discipline: ClayDiscipline, barrels: boolean): readonly TargetResult[] {
  return discipline === 'trap' && barrels ? ['first', 'second', 'miss'] : ['hit', 'miss'];
}

/** One member of the squad on the sheet in progress. */
export const squadShooterSchema = z.object({
  id: z.string().min(1),
  name: tagSchema,
  startStation: trapStartStationSchema,
  results: sheetResultsSchema,
  directions: sheetDirectionsSchema,
});
export type SquadShooter = z.infer<typeof squadShooterSchema>;

/** What a key on the keyboard, or a remote that types like one, can do. */
export const keyActionSchema = z.enum(['first', 'second', 'miss', 'undo', 'left', 'centre', 'right']);
export type KeyAction = z.infer<typeof keyActionSchema>;
const assignedKey = z.string().min(1).nullable();
/** Every action is listed, with null for one that has no key. */
export const keyMapSchema = z.object({
  first: assignedKey,
  second: assignedKey,
  miss: assignedKey,
  undo: assignedKey,
  left: assignedKey,
  centre: assignedKey,
  right: assignedKey,
}) satisfies z.ZodType<Record<KeyAction, string | null>>;
export type KeyMap = z.infer<typeof keyMapSchema>;
