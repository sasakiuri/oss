import { z } from 'zod';

/** The kinds a person picks from. `other` covers anything the list does not name. */
export const trapKindSchema = z.enum(['kukuri', 'hako', 'kakoi', 'hakootoshi', 'other']);
export type TrapKind = z.infer<typeof trapKindSchema>;
export const TRAP_KINDS = trapKindSchema.options;

/** What the person found on a round. */
export const checkResultSchema = z.enum(['nothing', 'caught', 'bycatch', 'trouble']);
export type CheckResult = z.infer<typeof checkResultSchema>;
export const CHECK_RESULTS = checkResultSchema.options;

export const TRAP_NAME_MAX_LENGTH = 60;
export const TRAP_TEXT_MAX_LENGTH = 200;
/** Limits on what one browser holds, so a runaway list cannot fill the storage quota. */
export const TRAP_MAX_COUNT = 200;
export const CHECKS_PER_TRAP_MAX = 1000;

export const INTERVAL_HOURS_MIN = 1;
export const INTERVAL_HOURS_MAX = 168;

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The parts of a `datetime-local` value (`2026-09-23T06:30`), or null when the shape or the calendar is wrong. */
export function readLocalDateTime(
  value: string,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  // The pattern has exactly five groups of digits, so each is present.
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number) as [number, number, number, number, number];
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || day < 1) return null;
  // Day 0 of the next month is the last day of this one, in any year; 30 February is refused, not rolled over.
  if (day > new Date(year, month, 0).getDate()) return null;
  return { year, month, day, hour, minute };
}

/** A wall-clock time on this device, as a `datetime-local` field writes it. */
export function isLocalDateTime(value: string): boolean {
  return readLocalDateTime(value) !== null;
}

export const localDateTimeSchema = z.string().refine(isLocalDateTime);

export const trapCheckSchema = z.object({
  id: z.string().min(1),
  at: localDateTimeSchema,
  result: checkResultSchema,
  note: z.string().max(TRAP_TEXT_MAX_LENGTH),
});
export type TrapCheck = z.infer<typeof trapCheckSchema>;

export const latitudeSchema = z.number().finite().min(-90).max(90);
export const longitudeSchema = z.number().finite().min(-180).max(180);

export const trapSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(TRAP_NAME_MAX_LENGTH),
  kind: trapKindSchema,
  installedAt: localDateTimeSchema,
  location: z.string().max(TRAP_TEXT_MAX_LENGTH),
  latitude: latitudeSchema.nullable(),
  longitude: longitudeSchema.nullable(),
  /** Set once the trap has been taken up. A removed trap is kept for the record but no longer watched. */
  removedAt: localDateTimeSchema.nullable(),
  checks: z.array(trapCheckSchema).max(CHECKS_PER_TRAP_MAX),
});
export type Trap = z.infer<typeof trapSchema>;

export const intervalHoursSchema = z.number().int().min(INTERVAL_HOURS_MIN).max(INTERVAL_HOURS_MAX);

/** What the registration form holds while it is being filled in: every field is still text. */
export interface TrapDraft {
  name: string;
  kind: TrapKind;
  installedAt: string;
  location: string;
  latitude: string;
  longitude: string;
}

export type TrapDraftField = 'name' | 'installedAt' | 'location' | 'latitude' | 'longitude';
export type TrapDraftError = 'required' | 'tooLong' | 'invalid' | 'outOfRange' | 'pairMissing';

export type TrapDraftValidation =
  | {
      valid: true;
      value: Pick<Trap, 'name' | 'kind' | 'installedAt' | 'location' | 'latitude' | 'longitude'>;
      errors: Record<string, never>;
    }
  | { valid: false; value: null; errors: Partial<Record<TrapDraftField, TrapDraftError>> };

const parseCoordinate = (text: string): number | null | undefined => {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  // Number('') is 0 and Number('1e2') is 100, so only plain decimals are read as a coordinate.
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  return Number(trimmed);
};

/** Checks the registration form. Coordinates are optional, but a latitude needs its longitude. */
export function validateTrapDraft(draft: TrapDraft): TrapDraftValidation {
  const errors: Partial<Record<TrapDraftField, TrapDraftError>> = {};
  const name = draft.name.trim();
  if (name === '') errors.name = 'required';
  else if (name.length > TRAP_NAME_MAX_LENGTH) errors.name = 'tooLong';
  if (draft.installedAt === '') errors.installedAt = 'required';
  else if (!isLocalDateTime(draft.installedAt)) errors.installedAt = 'invalid';
  const location = draft.location.trim();
  if (location.length > TRAP_TEXT_MAX_LENGTH) errors.location = 'tooLong';

  const latitude = parseCoordinate(draft.latitude);
  const longitude = parseCoordinate(draft.longitude);
  if (latitude === undefined) errors.latitude = 'invalid';
  else if (latitude !== null && !latitudeSchema.safeParse(latitude).success) errors.latitude = 'outOfRange';
  if (longitude === undefined) errors.longitude = 'invalid';
  else if (longitude !== null && !longitudeSchema.safeParse(longitude).success) errors.longitude = 'outOfRange';
  if (!errors.latitude && !errors.longitude) {
    if (latitude === null && longitude !== null) errors.latitude = 'pairMissing';
    if (longitude === null && latitude !== null) errors.longitude = 'pairMissing';
  }

  if (Object.keys(errors).length > 0) return { valid: false, value: null, errors };
  return {
    valid: true,
    value: {
      name,
      kind: draft.kind,
      installedAt: draft.installedAt,
      location,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    },
    errors: {},
  };
}
