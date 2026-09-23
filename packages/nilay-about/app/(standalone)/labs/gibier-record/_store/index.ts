import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { sortGibierRecords } from '@/lib/gibier-record';
import {
  createGibierRecord,
  gibierRecordSchema,
  type GibierAbnormalityKey,
  type GibierDisinfection,
  type GibierHitSite,
  type GibierRecord,
  type GibierSnareSite,
  type GibierYesNo,
} from '@/lib/schemas/gibier-record';

export const GIBIER_RECORD_STORAGE_KEY = 'nilay-labs-gibier-record-v1';

// The envelope only: each record is read on its own below, so one damaged record does not take
// the rest of the list down with it.
const savedSchema = z.object({
  records: z.array(z.unknown()),
  currentId: z.string(),
});
interface SavedState {
  records: GibierRecord[];
  currentId: string;
}

/**
 * The records that can still be read, without repeats of an id, and whether anything was left behind.
 * Two records under one id would make every edit land on both, so only the first is kept.
 */
export function readSavedGibierRecords(saved: unknown): { records: GibierRecord[]; currentId: string; lost: boolean } {
  const envelope = savedSchema.safeParse(saved);
  if (!envelope.success) return { records: [], currentId: '', lost: true };
  const records: GibierRecord[] = [];
  let lost = false;
  for (const item of envelope.data.records) {
    const parsed = gibierRecordSchema.safeParse(item);
    if (parsed.success && !records.some((record) => record.id === parsed.data.id)) records.push(parsed.data);
    else lost = true;
  }
  return { records, currentId: envelope.data.currentId, lost };
}

type SiteListKey = 'hitSites' | 'snareSites' | 'knifeDisinfection';
type SiteOf<K extends SiteListKey> = K extends 'hitSites'
  ? GibierHitSite
  : K extends 'snareSites'
    ? GibierSnareSite
    : GibierDisinfection;
/** Every field that holds one value, so a list or the abnormality answers cannot be overwritten whole. */
type ScalarKey = Exclude<keyof GibierRecord, 'id' | 'createdAt' | SiteListKey | 'abnormalities'>;

interface GibierRecordStore {
  records: GibierRecord[];
  currentId: string;
  setField: <K extends ScalarKey>(key: K, value: GibierRecord[K]) => void;
  toggleSite: <K extends SiteListKey>(key: K, site: SiteOf<K>) => void;
  setAbnormality: (key: GibierAbnormalityKey, value: GibierYesNo) => void;
  /** Starts the next animal, carrying over who caught it: a day's records are usually one hunter's. */
  addRecord: () => void;
  selectRecord: (id: string) => void;
  deleteRecord: (id: string) => void;
  /** Empties the record on screen, keeping its place in the list. */
  resetCurrent: () => void;
  /** Deletes every record from this device and reports whether the removal landed. */
  deleteAll: () => boolean;
}

const newId = () => crypto.randomUUID();
const blankRecord = () => createGibierRecord(newId(), new Date().toISOString());

const initialRecord = () => {
  const record = blankRecord();
  return { records: [record], currentId: record.id };
};

export const useGibierRecordStore = create<GibierRecordStore>()(
  persist(
    (set) => {
      const editCurrent = (edit: (record: GibierRecord) => GibierRecord) =>
        set((state) => ({
          records: state.records.map((record) => (record.id === state.currentId ? edit(record) : record)),
        }));
      return {
        ...initialRecord(),
        setField: (key, value) => editCurrent((record) => ({ ...record, [key]: value })),
        toggleSite: (key, site) =>
          editCurrent((record) => {
            const list = record[key] as readonly string[];
            return {
              ...record,
              [key]: list.includes(site) ? list.filter((value) => value !== site) : [...list, site],
            };
          }),
        setAbnormality: (key, value) =>
          editCurrent((record) => ({ ...record, abnormalities: { ...record.abnormalities, [key]: value } })),
        addRecord: () =>
          set((state) => {
            const current = state.records.find((record) => record.id === state.currentId);
            const record = {
              ...blankRecord(),
              // The health of the hunter is asked again for every animal, so only the name and number carry.
              hunterName: current?.hunterName ?? '',
              licenseNumber: current?.licenseNumber ?? '',
            };
            return { records: [...state.records, record], currentId: record.id };
          }),
        selectRecord: (id) =>
          set((state) => (state.records.some((record) => record.id === id) ? { currentId: id } : {})),
        deleteRecord: (id) =>
          set((state) => {
            const records = state.records.filter((record) => record.id !== id);
            if (records.length === 0) return initialRecord();
            const currentId = state.currentId === id ? sortGibierRecords(records)[0]!.id : state.currentId;
            return { records, currentId };
          }),
        resetCurrent: () => editCurrent((record) => createGibierRecord(record.id, record.createdAt)),
        deleteAll: () => {
          set(initialRecord());
          void useGibierRecordStore.persist.clearStorage();
          // The status flag follows the last write rather than this removal, so the removal answers for itself.
          try {
            return window.localStorage.getItem(GIBIER_RECORD_STORAGE_KEY) === null;
          } catch {
            return false;
          }
        },
      };
    },
    {
      name: GIBIER_RECORD_STORAGE_KEY,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ records: state.records, currentId: state.currentId }),
      merge: (saved, current) => {
        // Nothing stored: a first visit, or a list deleted in another tab, which must not stay on
        // screen here. Either way the tool opens on one blank record.
        if (saved === undefined) return { ...current, ...initialRecord() };
        const { records, currentId, lost } = readSavedGibierRecords(saved);
        // Records that vanish without a word would look as if they had never been kept.
        if (lost) reportDiscardedSave(GIBIER_RECORD_STORAGE_KEY);
        if (records.length === 0) return current;
        return {
          ...current,
          records,
          currentId: records.some((record) => record.id === currentId) ? currentId : sortGibierRecords(records)[0]!.id,
        };
      },
    },
  ),
);
