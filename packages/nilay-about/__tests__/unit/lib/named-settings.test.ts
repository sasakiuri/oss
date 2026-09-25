import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { useStorageStatus } from '@/lib/browser-storage';
import {
  NAMED_SETTINGS_MAX_COUNT,
  NAMED_SETTINGS_NAME_MAX_LENGTH,
  addNamedSettings,
  namedSettingsListSchema,
  removeNamedSettings,
  renameNamedSettings,
  replaceNamedSettings,
  restoreNamedSettings,
  type NamedSettings,
} from '@/lib/named-settings';
import { createNamedSettingsStore } from '@/lib/named-settings-store';

type Entry = NamedSettings<number>;
const entry = (id: string, name: string, settings = 1): Entry => ({ id, name, settings });
const full = Array.from({ length: NAMED_SETTINGS_MAX_COUNT }, (_, index) => entry(`id-${index}`, `n${index}`));

describe('named settings', () => {
  it('adds an entry under its trimmed name', () => {
    const result = addNamedSettings<number>([], '  Home  ', 5, 'a');
    expect(result).toEqual({ ok: true, list: [entry('a', 'Home', 5)] });
  });

  it('refuses an empty, a too long and a taken name, and a full list', () => {
    const list = [entry('a', 'Home')];
    expect(addNamedSettings(list, '   ', 1, 'b')).toEqual({ ok: false, error: 'empty-name' });
    expect(addNamedSettings(list, 'x'.repeat(NAMED_SETTINGS_NAME_MAX_LENGTH + 1), 1, 'b')).toEqual({
      ok: false,
      error: 'long-name',
    });
    expect(addNamedSettings(list, ' Home', 1, 'b')).toEqual({ ok: false, error: 'duplicate-name' });
    expect(addNamedSettings(full, 'new', 1, 'b')).toEqual({ ok: false, error: 'full' });
  });

  it('renames an entry, allowing its own name but not another one', () => {
    const list = [entry('a', 'Home'), entry('b', 'Club')];
    expect(renameNamedSettings(list, 'a', 'Home')).toEqual({ ok: true, list });
    expect(renameNamedSettings(list, 'a', 'Club')).toEqual({ ok: false, error: 'duplicate-name' });
    expect(renameNamedSettings(list, 'b', ' Range ')).toEqual({
      ok: true,
      list: [entry('a', 'Home'), entry('b', 'Range')],
    });
  });

  it('replaces what an entry holds and keeps its name and place', () => {
    const list = [entry('a', 'Home', 1), entry('b', 'Club', 2)];
    expect(replaceNamedSettings(list, 'a', 9)).toEqual([entry('a', 'Home', 9), entry('b', 'Club', 2)]);
    expect(replaceNamedSettings(list, 'missing', 9)).toEqual(list);
  });

  it('puts a deleted entry back where it was', () => {
    const list = [entry('a', 'A'), entry('b', 'B'), entry('c', 'C')];
    const removed = removeNamedSettings(list, 'b');
    expect(removed?.list).toEqual([entry('a', 'A'), entry('c', 'C')]);
    expect(restoreNamedSettings(removed!.list, removed!.removed)).toEqual({ ok: true, list });
    expect(removeNamedSettings(list, 'missing')).toBeNull();
  });

  it('numbers a restored entry whose name was taken meanwhile, shortening a long name to fit', () => {
    const removed = { entry: entry('a', 'Home'), index: 0 };
    expect(restoreNamedSettings([entry('b', 'Home'), entry('c', 'Home (2)')], removed)).toEqual({
      ok: true,
      list: [entry('a', 'Home (3)'), entry('b', 'Home'), entry('c', 'Home (2)')],
    });
    const long = 'x'.repeat(NAMED_SETTINGS_NAME_MAX_LENGTH);
    const restored = restoreNamedSettings([entry('b', long)], { entry: entry('a', long), index: 1 });
    expect(restored.ok && restored.list[1]!.name).toBe(`${'x'.repeat(NAMED_SETTINGS_NAME_MAX_LENGTH - 4)} (2)`);
    expect(restored.ok && namedSettingsListSchema(z.number()).safeParse(restored.list).success).toBe(true);
  });

  it('refuses to restore into a list that filled up meanwhile', () => {
    expect(restoreNamedSettings(full, { entry: entry('z', 'Z'), index: 0 })).toEqual({ ok: false, error: 'full' });
  });

  it('refuses a saved list with a repeated name', () => {
    const schema = namedSettingsListSchema(z.number());
    expect(schema.safeParse([entry('a', 'A'), entry('b', 'B')]).success).toBe(true);
    expect(schema.safeParse([entry('a', 'A'), entry('b', 'A')]).success).toBe(false);
  });

  it('refuses a saved list with a repeated id, which a delete would take twice and an undo bring back once', () => {
    expect(namedSettingsListSchema(z.number()).safeParse([entry('a', 'A'), entry('a', 'B')]).success).toBe(false);
  });
});

describe('createNamedSettingsStore', () => {
  const key = 'nilay-labs-test-profiles-v1';
  const schema = z.object({ speed: z.number().positive() });

  beforeEach(() => {
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('saves only settings that pass the schema, and keeps them under its own key', () => {
    const store = createNamedSettingsStore(key, schema);
    expect(store.getState().save('Fast', { speed: -1 })).toBe('invalid-settings');
    expect(store.getState().save('Fast', { speed: 900 })).toBe('saved');
    expect(store.getState().save('Fast', { speed: 800 })).toBe('duplicate-name');
    const id = store.getState().entries[0]!.id;
    expect(store.getState().find(id)).toEqual({ speed: 900 });
    expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual({
      state: { entries: [{ id, name: 'Fast', settings: { speed: 900 } }] },
      version: 0,
    });
  });

  it('replaces, renames, deletes and undoes', () => {
    const store = createNamedSettingsStore(key, schema);
    store.getState().save('A', { speed: 1 });
    const id = store.getState().entries[0]!.id;
    expect(store.getState().replace(id, { speed: 0 })).toBe('invalid-settings');
    expect(store.getState().replace(id, { speed: 2 })).toBe('saved');
    expect(store.getState().rename(id, 'B')).toBe('saved');
    store.getState().remove(id);
    expect(store.getState().entries).toEqual([]);
    expect(store.getState().removed?.entry.name).toBe('B');
    expect(store.getState().undoRemove()).toBe('saved');
    expect(store.getState().entries).toEqual([{ id, name: 'B', settings: { speed: 2 } }]);
    expect(store.getState().removed).toBeNull();
  });

  it('reads a saved list back, and reports one that does not match instead of dropping it in silence', async () => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ state: { entries: [{ id: 'a', name: 'A', settings: { speed: 3 } }] }, version: 0 }),
    );
    const store = createNamedSettingsStore(key, schema);
    await store.persist.rehydrate();
    expect(store.getState().entries).toEqual([{ id: 'a', name: 'A', settings: { speed: 3 } }]);

    window.localStorage.setItem(
      key,
      JSON.stringify({ state: { entries: [{ id: 'a', name: 'A', settings: { speed: 'fast' } }] }, version: 0 }),
    );
    const broken = createNamedSettingsStore(key, schema);
    await broken.persist.rehydrate();
    expect(broken.getState().entries).toEqual([]);
    expect(useStorageStatus.getState().discarded).toContain(key);
  });
});
