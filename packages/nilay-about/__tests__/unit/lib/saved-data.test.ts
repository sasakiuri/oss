import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { photoRecords, savedDataEntries, savedDataEntry } from '@/app/(standalone)/labs/data/saved-data';
import { useStorageStatus } from '@/lib/browser-storage';
import { acceptsPersisted, persistedKey, type PersistedStore } from '@/lib/persisted-store';
import { languageStorageKey } from '@/store/language-store';

const packageDirectory = join(__dirname, '../../..');

/** The site's own setting, read on every page and never part of a backup. */
const SITE_KEYS = [languageStorageKey];

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

/**
 * Every localStorage key named in a file that makes a persisted store, read from the source so a new
 * store cannot be missed, wherever it is kept: a tool's `_store/`, the shared `store/`, or elsewhere.
 */
function keysOfPersistedStores(): string[] {
  const keys = new Set<string>();
  for (const directory of ['app', 'store', 'lib', 'features', 'components'])
    for (const file of sourceFiles(join(packageDirectory, directory))) {
      const source = readFileSync(file, 'utf8');
      if (!/\bpersist\(|createJSONStorage\(|createNamedSettingsStore\(/.test(source)) continue;
      for (const match of source.matchAll(/'(nilay-[a-z0-9-]+-v\d+)'/g)) keys.add(match[1]!);
    }
  return [...keys].filter((key) => !SITE_KEYS.includes(key)).sort();
}

/** What the store would write now: its initial state, as its own partialize keeps it. */
function savedNow(store: PersistedStore): { state: unknown; version: number } {
  const options = store.persist.getOptions() as { partialize?: (state: unknown) => unknown; version?: number };
  const state = store.getInitialState();
  return { state: options.partialize ? options.partialize(state) : state, version: options.version ?? 0 };
}

describe('the stores the backup covers', () => {
  beforeEach(() => useStorageStatus.setState({ available: true, discarded: [] }));

  it('include every store Labs saves to localStorage, in a tool or shared by several', () => {
    const keys = keysOfPersistedStores();
    // The two a registry that read only the tools' `_store/index.ts` would miss.
    expect(keys).toEqual(expect.arrayContaining(['nilay-labs-electric-fence-power-v1', 'nilay-study-log-v1']));
    expect(savedDataEntries.map((entry) => persistedKey(entry.store)).sort()).toEqual(keys);
  });

  it('tie the photos of a tool to the key of its records, and give no key to a tool without photos', () => {
    const records = photoRecords('hunting-log')!;
    expect(records.key).toBe('nilay-labs-hunting-log-v1');
    expect([...records.ids({ state: { outings: [{ id: 'a' }, { id: 'b' }] }, version: 0 })]).toEqual(['a', 'b']);
    const rounds = photoRecords('trap-check-log')!;
    expect(rounds.key).toBe('nilay-labs-trap-check-log-v1');
    expect([
      ...rounds.ids({
        state: { traps: [{ checks: [{ id: 'r1' }, { id: 'r2' }] }, { checks: [{ id: 'r3' }] }] },
        version: 0,
      }),
    ]).toEqual(['r1', 'r2', 'r3']);
    const captures = photoRecords('gibier-record')!;
    expect(captures.key).toBe('nilay-labs-gibier-record-v1');
    expect([...captures.ids({ state: { records: [{ id: 'g1' }] }, version: 0 })]).toEqual(['g1']);
    expect(photoRecords('recoil')).toBeUndefined();
    expect(photoRecords('not-a-tool')).toBeUndefined();
  });

  it('are found by their key', () => {
    for (const entry of savedDataEntries) expect(savedDataEntry(persistedKey(entry.store))).toBe(entry);
    expect(savedDataEntry('nilay-language-v1')).toBeUndefined();
  });

  it.each(savedDataEntries.map((entry) => [persistedKey(entry.store), entry.store] as const))(
    '%s takes what it saves itself and refuses what it would discard',
    (key, store) => {
      expect(acceptsPersisted(store, savedNow(store))).toBe(true);
      expect(acceptsPersisted(store, { state: { unexpected: true, settings: 'broken' }, version: 0 })).toBe(false);
      expect(acceptsPersisted(store, { ...savedNow(store), version: 1 })).toBe(false);
      expect(acceptsPersisted(store, savedNow(store).state)).toBe(false);
      // Checking leaves the page's notices as they were, whatever it found.
      expect(useStorageStatus.getState().discarded).toEqual([]);
      useStorageStatus.setState({ discarded: [key] });
      expect(acceptsPersisted(store, savedNow(store))).toBe(true);
      expect(useStorageStatus.getState().discarded).toEqual([key]);
    },
  );
});
