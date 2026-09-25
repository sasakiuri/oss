import { z } from 'zod';

/**
 * Settings kept under a name, so a reader can keep several (a rifle and a shotgun, the home range and
 * the club) and bring one back. The list is plain data and these functions return a new list, so the
 * same rules hold in any store: names are trimmed and unique, and a deleted entry can be put back.
 */

export const NAMED_SETTINGS_NAME_MAX_LENGTH = 60;
/** Enough for every rifle and load a person keeps, and a bound on what one list writes to storage. */
export const NAMED_SETTINGS_MAX_COUNT = 50;

export interface NamedSettings<T> {
  id: string;
  name: string;
  settings: T;
}

export function namedSettingsSchema<T extends z.ZodTypeAny>(settings: T) {
  return z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(NAMED_SETTINGS_NAME_MAX_LENGTH),
    settings,
  });
}

export function namedSettingsListSchema<T extends z.ZodTypeAny>(settings: T) {
  return (
    z
      .array(namedSettingsSchema(settings))
      .max(NAMED_SETTINGS_MAX_COUNT)
      .refine((list) => new Set(list.map((entry) => entry.name)).size === list.length, 'Names must be unique')
      // Entries are deleted and put back by id, so two with one id would go together and come back as one.
      .refine((list) => new Set(list.map((entry) => entry.id)).size === list.length, 'Ids must be unique')
  );
}

/** Why a name was refused, so the form can say which. */
export type NameError = 'empty-name' | 'long-name' | 'duplicate-name';
export type SaveError = NameError | 'full';

export type NamedResult<T> = { ok: true; list: NamedSettings<T>[] } | { ok: false; error: SaveError };

function checkName<T>(list: readonly NamedSettings<T>[], name: string, exceptId?: string): NameError | string {
  const trimmed = name.trim();
  if (!trimmed) return 'empty-name';
  if (trimmed.length > NAMED_SETTINGS_NAME_MAX_LENGTH) return 'long-name';
  if (list.some((entry) => entry.id !== exceptId && entry.name === trimmed)) return 'duplicate-name';
  return trimmed;
}

const isNameError = (value: string): value is NameError =>
  value === 'empty-name' || value === 'long-name' || value === 'duplicate-name';

export function addNamedSettings<T>(
  list: readonly NamedSettings<T>[],
  name: string,
  settings: T,
  id: string,
): NamedResult<T> {
  if (list.length >= NAMED_SETTINGS_MAX_COUNT) return { ok: false, error: 'full' };
  const checked = checkName(list, name);
  if (isNameError(checked)) return { ok: false, error: checked };
  return { ok: true, list: [...list, { id, name: checked, settings }] };
}

export function renameNamedSettings<T>(list: readonly NamedSettings<T>[], id: string, name: string): NamedResult<T> {
  const checked = checkName(list, name, id);
  if (isNameError(checked)) return { ok: false, error: checked };
  return { ok: true, list: list.map((entry) => (entry.id === id ? { ...entry, name: checked } : entry)) };
}

/** The entry keeps its name and place; only what it holds is replaced. Unknown ids leave the list as it was. */
export function replaceNamedSettings<T>(
  list: readonly NamedSettings<T>[],
  id: string,
  settings: T,
): NamedSettings<T>[] {
  return list.map((entry) => (entry.id === id ? { ...entry, settings } : entry));
}

export interface RemovedNamedSettings<T> {
  entry: NamedSettings<T>;
  index: number;
}

export function removeNamedSettings<T>(
  list: readonly NamedSettings<T>[],
  id: string,
): { list: NamedSettings<T>[]; removed: RemovedNamedSettings<T> } | null {
  const index = list.findIndex((entry) => entry.id === id);
  const entry = list[index];
  if (!entry) return null;
  return { list: list.filter((item) => item.id !== id), removed: { entry, index } };
}

/**
 * Puts a deleted entry back where it was. A name taken while it was gone gets a number, as
 * “Home (2)”, so the two never collide; a long name is shortened to make room for it.
 * A list that filled up in the meantime is refused rather than let past its limit.
 */
export function restoreNamedSettings<T>(
  list: readonly NamedSettings<T>[],
  removed: RemovedNamedSettings<T>,
): NamedResult<T> {
  if (list.length >= NAMED_SETTINGS_MAX_COUNT) return { ok: false, error: 'full' };
  let name = removed.entry.name;
  for (let suffix = 2; list.some((entry) => entry.name === name); suffix += 1) {
    const tail = ` (${suffix})`;
    name = `${removed.entry.name.slice(0, NAMED_SETTINGS_NAME_MAX_LENGTH - tail.length)}${tail}`;
  }
  const next = [...list];
  next.splice(Math.min(removed.index, next.length), 0, { ...removed.entry, name });
  return { ok: true, list: next };
}
