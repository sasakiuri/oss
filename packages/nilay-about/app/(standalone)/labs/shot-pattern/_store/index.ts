import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  PATTERN_SETUP_MAX_LENGTH,
  patternRecordSchema,
  type PatternRecord,
  type ShotOffset,
} from '@/lib/schemas/shot-pattern';
import { PATTERN_DIAMETER_CM, getScale, toImagePoint, toOffsetCm, type Point } from '@/lib/shot-pattern';

export interface ImageSize {
  width: number;
  height: number;
}
export interface Shot extends Point {
  id: string;
}
export interface Calibration {
  a: Point;
  b: Point;
  referenceCm: number;
}

export const storageKey = 'nilay-labs-shot-pattern-v1';

/** Without a photo the tool still works on a blank board of this size, in the same pixel frame. */
export const defaultImageSize: ImageSize = { width: 1200, height: 900 };

const defaultCalibration = (size: ImageSize): Calibration => ({
  a: { x: size.width * 0.25, y: size.height / 2 },
  b: { x: size.width * 0.75, y: size.height / 2 },
  referenceCm: PATTERN_DIAMETER_CM,
});
const defaultCentre = (size: ImageSize): Point => ({ x: size.width / 2, y: size.height / 2 });

const isLength = (value: number) => Number.isFinite(value) && value > 0;

const savedSchema = z.object({
  referenceCm: z.number().finite().positive(),
  diameterCm: z.number().finite().positive(),
  records: z.array(patternRecordSchema),
});
type SavedState = z.infer<typeof savedSchema>;

interface ShotPatternStore {
  imageSize: ImageSize;
  calibration: Calibration;
  centre: Point;
  diameterCm: number;
  pellets: number | null;
  note: string;
  /** Gun, barrel, choke and cartridge, saved with the record; empty when not stated. */
  setup: string;
  /** Muzzle to board in metres; NaN when not stated. */
  distanceM: number;
  shots: Shot[];
  records: PatternRecord[];
  deletedRecord: { record: PatternRecord; index: number } | null;
  lastValidDiameterCm: number;
  lastValidReferenceCm: number;
  setImage: (size: ImageSize | null) => void;
  setCalibrationPoint: (key: 'a' | 'b', point: Point) => void;
  setReferenceCm: (referenceCm: number) => void;
  setCentre: (centre: Point) => void;
  setDiameterCm: (diameterCm: number) => void;
  addShot: (point: Point) => void;
  addShotAtOffset: (offset: ShotOffset) => boolean;
  /** Put a whole set of shots in place of the current ones, as an automatic reading does. */
  replaceShots: (points: readonly Point[]) => void;
  removeShot: (id: string) => void;
  undoShot: () => void;
  clearShots: () => void;
  setPellets: (pellets: number | null) => void;
  setNote: (note: string) => void;
  setSetup: (setup: string) => void;
  setDistanceM: (distanceM: number) => void;
  saveRecord: (name: string) => boolean;
  loadRecord: (id: string) => boolean;
  deleteRecord: (id: string) => void;
  undoDelete: () => void;
  reset: () => void;
}

const initialState = {
  imageSize: defaultImageSize,
  calibration: defaultCalibration(defaultImageSize),
  centre: defaultCentre(defaultImageSize),
  diameterCm: PATTERN_DIAMETER_CM,
  pellets: null,
  note: '',
  setup: '',
  distanceM: NaN,
  shots: [] as Shot[],
  records: [] as PatternRecord[],
  deletedRecord: null as { record: PatternRecord; index: number } | null,
  lastValidDiameterCm: PATTERN_DIAMETER_CM,
  lastValidReferenceCm: PATTERN_DIAMETER_CM,
};

/** Centimetres per pixel of the current calibration, or null while it is incomplete. */
export const selectScale = (state: Pick<ShotPatternStore, 'calibration'>): number | null =>
  getScale(state.calibration.a, state.calibration.b, state.calibration.referenceCm);

export const useShotPatternStore = create<ShotPatternStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      setImage: (size) => {
        // Shots and the calibration belong to one photo, so a new photo starts from the defaults.
        const imageSize = size && size.width > 0 && size.height > 0 ? size : defaultImageSize;
        set({
          imageSize,
          calibration: { ...defaultCalibration(imageSize), referenceCm: get().calibration.referenceCm },
          centre: defaultCentre(imageSize),
          shots: [],
        });
      },
      setCalibrationPoint: (key, point) => set((state) => ({ calibration: { ...state.calibration, [key]: point } })),
      // Keep the last usable length while a field is being edited, so a blank draft is never stored.
      setReferenceCm: (referenceCm) =>
        set((state) => ({
          calibration: { ...state.calibration, referenceCm },
          ...(isLength(referenceCm) ? { lastValidReferenceCm: referenceCm } : {}),
        })),
      setCentre: (centre) => set({ centre }),
      setDiameterCm: (diameterCm) =>
        set(isLength(diameterCm) ? { diameterCm, lastValidDiameterCm: diameterCm } : { diameterCm }),
      addShot: (point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        set((state) => ({ shots: [...state.shots, { id: crypto.randomUUID(), ...point }] }));
      },
      addShotAtOffset: (offset) => {
        const scale = selectScale(get());
        if (scale === null || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)) return false;
        get().addShot(toImagePoint(offset, get().centre, scale));
        return true;
      },
      replaceShots: (points) =>
        set({
          shots: points
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
            .map((point) => ({ id: crypto.randomUUID(), x: point.x, y: point.y })),
        }),
      removeShot: (id) => set((state) => ({ shots: state.shots.filter((shot) => shot.id !== id) })),
      undoShot: () => set((state) => ({ shots: state.shots.slice(0, -1) })),
      clearShots: () => set({ shots: [] }),
      setPellets: (pellets) => set({ pellets }),
      setNote: (note) => set({ note }),
      setSetup: (setup) => set({ setup: setup.slice(0, PATTERN_SETUP_MAX_LENGTH) }),
      setDistanceM: (distanceM) => set({ distanceM }),
      saveRecord: (name) => {
        const state = get();
        const scale = selectScale(state);
        const trimmed = name.trim();
        if (scale === null || !trimmed || state.records.some((record) => record.name === trimmed)) return false;
        // A distance typed wrong is refused rather than dropped from the record.
        if (Number.isFinite(state.distanceM) && state.distanceM <= 0) return false;
        const record = patternRecordSchema.safeParse({
          id: crypto.randomUUID(),
          name: trimmed,
          savedAt: new Date().toISOString(),
          diameterCm: state.diameterCm,
          pellets: state.pellets,
          note: state.note,
          shots: state.shots.map((shot) => toOffsetCm(shot, state.centre, scale)),
          // Left out when not stated, so the record says nothing rather than a made-up value.
          ...(state.setup.trim() ? { setup: state.setup.trim() } : {}),
          ...(Number.isFinite(state.distanceM) && state.distanceM > 0 ? { distanceM: state.distanceM } : {}),
        });
        if (!record.success) return false;
        set({ records: [...state.records, record.data] });
        return true;
      },
      loadRecord: (id) => {
        const state = get();
        const record = state.records.find((item) => item.id === id);
        const scale = selectScale(state);
        if (!record || scale === null) return false;
        set({
          diameterCm: record.diameterCm,
          lastValidDiameterCm: record.diameterCm,
          pellets: record.pellets,
          note: record.note,
          setup: record.setup ?? '',
          distanceM: record.distanceM ?? NaN,
          shots: record.shots.map((offset) => ({
            id: crypto.randomUUID(),
            ...toImagePoint(offset, state.centre, scale),
          })),
        });
        return true;
      },
      deleteRecord: (id) => {
        const index = get().records.findIndex((item) => item.id === id);
        const record = get().records[index];
        if (!record) return;
        set((state) => ({
          deletedRecord: { record, index },
          records: state.records.filter((item) => item.id !== id),
        }));
      },
      undoDelete: () => {
        const deleted = get().deletedRecord;
        if (!deleted) return;
        const records = [...get().records];
        // A record saved under the same name in the meantime keeps it, so the restored one is renamed.
        let name = deleted.record.name;
        let suffix = 2;
        while (records.some((item) => item.name === name)) name = `${deleted.record.name} (${suffix++})`;
        records.splice(deleted.index, 0, { ...deleted.record, name });
        set({ records, deletedRecord: null });
      },
      reset: () =>
        set({
          ...initialState,
          records: get().records,
          deletedRecord: get().deletedRecord,
        }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      // The photo never leaves the page, so only the reusable setup and the records are stored.
      partialize: (state) => ({
        referenceCm: state.lastValidReferenceCm,
        diameterCm: state.lastValidDiameterCm,
        records: state.records,
      }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        // An empty storage also reaches merge, and a first visit is not a save that could not be read.
        if (!parsed.success && saved !== undefined) reportDiscardedSave(storageKey);
        return parsed.success
          ? {
              ...current,
              calibration: { ...current.calibration, referenceCm: parsed.data.referenceCm },
              lastValidReferenceCm: parsed.data.referenceCm,
              diameterCm: parsed.data.diameterCm,
              lastValidDiameterCm: parsed.data.diameterCm,
              records: parsed.data.records,
            }
          : current;
      },
    },
  ),
);
