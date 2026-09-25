import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { getMarkerLayout } from '@/lib/home-target';
import type { Quad } from '@/lib/homography';
import {
  bulletUnitSchema,
  groupRecordSchema,
  precisionUnitSchema,
  type BulletUnit,
  type GroupRecord,
  type PrecisionUnit,
  type ShotImpact,
} from '@/lib/schemas/shot-group';
import {
  distanceUnitSchema,
  offsetUnitSchema,
  type DistanceUnit,
  type OffsetUnit,
} from '@/lib/schemas/sight-adjustment';
import {
  fromMillimeters,
  getScale,
  measureImpact,
  placeImpact,
  sheetFrame,
  toBulletDiameterMm,
  type PhotoFrame,
  type Point,
} from '@/lib/shot-group';
import { toMillimeters } from '@/lib/sight-adjustment';

export interface ImageSize {
  width: number;
  height: number;
}
export interface Impact extends Point {
  id: string;
}
export interface Calibration {
  a: Point;
  b: Point;
  value: number;
  unit: OffsetUnit;
}
export interface BulletDiameter {
  value: number | null;
  unit: BulletUnit;
}
export interface TargetPrecision {
  value: number | null;
  unit: PrecisionUnit;
}
/** How the photo is read in millimetres: two points a known distance apart, or four marks on the sheet. */
export type CalibrationMode = 'two-point' | 'corners';
export interface MarkerSpacing {
  width: number;
  height: number;
}
/** Another group on the same photo, with its own aim point. It stays in photo pixels, like the one being edited. */
export interface PhotoGroup {
  id: string;
  aim: Point;
  impacts: Impact[];
}

export const storageKey = 'nilay-labs-shot-group-v1';

/** Without a photo the tool still works on a blank target of this size, in the same pixel frame. */
export const defaultImageSize: ImageSize = { width: 1200, height: 900 };

/** A ruler laid on the target is the usual reference, so the default is a round length in millimetres. */
export const defaultReferenceMm = 100;

/** The marks the practice target maker prints on A4, which is the sheet most readers will have. */
export const defaultMarkerSpacing: MarkerSpacing = getMarkerLayout(210, 297).spacing;

const defaultCalibration = (size: ImageSize): Calibration => ({
  a: { x: size.width * 0.25, y: size.height * 0.75 },
  b: { x: size.width * 0.75, y: size.height * 0.75 },
  value: defaultReferenceMm,
  unit: 'mm',
});
const defaultAim = (size: ImageSize): Point => ({ x: size.width / 2, y: size.height / 2 });
/** The four marks start near the corners of the photo, in the order they sit round the sheet. */
const defaultCorners = ({ width, height }: ImageSize): Quad => [
  { x: width * 0.1, y: height * 0.1 },
  { x: width * 0.9, y: height * 0.1 },
  { x: width * 0.9, y: height * 0.9 },
  { x: width * 0.1, y: height * 0.9 },
];

const isLength = (value: number) => Number.isFinite(value) && value > 0;
const finite = z.number().finite();

const savedSchema = z.object({
  reference: z.object({ value: finite.positive(), unit: offsetUnitSchema }),
  distance: z.object({ value: finite.positive(), unit: distanceUnitSchema }),
  offsetUnit: offsetUnitSchema,
  bulletDiameter: z.object({ value: finite.positive().nullable(), unit: bulletUnitSchema }),
  // Optional: a save written before the statistics were added carries no target, and reading one
  // has to leave the rest of that save - the setup and every group in it - intact.
  targetPrecision: z.object({ value: finite.positive().nullable(), unit: precisionUnitSchema }).optional(),
  // Optional for the same reason: saves from before the corner marks existed carry no sheet.
  sheet: z
    .object({
      mode: z.enum(['two-point', 'corners']),
      spacing: z.object({ width: finite.positive(), height: finite.positive() }),
    })
    .optional(),
  records: z.array(groupRecordSchema),
});
type SavedState = z.infer<typeof savedSchema>;

interface ShotGroupStore {
  imageSize: ImageSize;
  calibrationMode: CalibrationMode;
  calibration: Calibration;
  corners: Quad;
  markerSpacing: MarkerSpacing;
  /** The group being edited. */
  aim: Point;
  impacts: Impact[];
  /** The other groups on this photo, in order, and where the one being edited sits among them. */
  otherGroups: PhotoGroup[];
  groupIndex: number;
  distance: { value: number; unit: DistanceUnit };
  offsetUnit: OffsetUnit;
  bulletDiameter: BulletDiameter;
  targetPrecision: TargetPrecision;
  note: string;
  records: GroupRecord[];
  deletedRecord: { record: GroupRecord; index: number } | null;
  lastValidReferenceValue: number;
  lastValidMarkerSpacing: MarkerSpacing;
  lastValidDistanceValue: number;
  lastValidBulletDiameter: number | null;
  lastValidTargetPrecision: number | null;
  setImage: (size: ImageSize | null) => void;
  setCalibrationMode: (mode: CalibrationMode) => void;
  setCalibrationPoint: (key: 'a' | 'b', point: Point) => void;
  setReferenceValue: (value: number) => void;
  setReferenceUnit: (unit: OffsetUnit) => void;
  setCorner: (index: 0 | 1 | 2 | 3, point: Point) => void;
  setMarkerSpacing: (spacing: MarkerSpacing) => void;
  setAim: (aim: Point) => void;
  setDistance: (distance: { value: number; unit: DistanceUnit }) => void;
  setOffsetUnit: (offsetUnit: OffsetUnit) => void;
  setBulletDiameter: (value: number | null) => void;
  setBulletUnit: (unit: BulletUnit) => void;
  setTargetPrecision: (value: number | null) => void;
  setTargetPrecisionUnit: (unit: PrecisionUnit) => void;
  addImpact: (point: Point) => void;
  addImpactAtOffset: (impact: ShotImpact) => boolean;
  /**
   * Put a whole set of impacts in place of the current ones, as an automatic reading does. With
   * more than one group on the photo, each point goes to the group whose aim point is nearest.
   */
  replaceImpacts: (points: readonly Point[]) => void;
  removeImpact: (id: string) => void;
  undoImpact: () => void;
  clearImpacts: () => void;
  /** Keep the group being edited on the photo and start another after it, aimed where this one was. */
  startNextGroup: () => void;
  /** Edit another group on the photo. The one being edited stays in its place among them. */
  selectGroup: (id: string) => void;
  removeGroup: (id: string) => void;
  setNote: (note: string) => void;
  saveRecord: (name: string) => boolean;
  loadRecord: (id: string) => boolean;
  deleteRecord: (id: string) => void;
  undoDelete: () => void;
  reset: () => void;
}

const initialState = {
  imageSize: defaultImageSize,
  calibrationMode: 'two-point' as CalibrationMode,
  calibration: defaultCalibration(defaultImageSize),
  corners: defaultCorners(defaultImageSize),
  markerSpacing: defaultMarkerSpacing,
  aim: defaultAim(defaultImageSize),
  impacts: [] as Impact[],
  otherGroups: [] as PhotoGroup[],
  groupIndex: 0,
  distance: { value: 100, unit: 'm' as DistanceUnit },
  offsetUnit: 'mm' as OffsetUnit,
  bulletDiameter: { value: null, unit: 'mm' as BulletUnit } as BulletDiameter,
  // A tenth of a centimetre on the target is a tight but reachable zero, and it opens the field
  // with a number so the question it answers is visible without the reader typing anything.
  targetPrecision: { value: 10, unit: 'mm' as PrecisionUnit } as TargetPrecision,
  note: '',
  records: [] as GroupRecord[],
  deletedRecord: null as { record: GroupRecord; index: number } | null,
  lastValidReferenceValue: defaultReferenceMm,
  lastValidMarkerSpacing: defaultMarkerSpacing,
  lastValidDistanceValue: 100,
  lastValidBulletDiameter: null as number | null,
  lastValidTargetPrecision: 10 as number | null,
};

/** Millimetres per pixel of the two-point calibration, or null while it is incomplete. */
export const selectScale = (state: Pick<ShotGroupStore, 'calibration'>): number | null =>
  getScale(state.calibration.a, state.calibration.b, toMillimeters(state.calibration.value, state.calibration.unit));

/** How the photo is read in millimetres under the chosen calibration, or null while it is incomplete. */
export const selectFrame = (
  state: Pick<ShotGroupStore, 'calibrationMode' | 'calibration' | 'corners' | 'markerSpacing'>,
): PhotoFrame | null => {
  if (state.calibrationMode === 'corners') return sheetFrame(state.corners, state.markerSpacing);
  const scale = selectScale(state);
  return scale === null ? null : { kind: 'scale', mmPerPixel: scale };
};

/** Every group on the photo in order, the one being edited included, with the one being edited marked. */
export const selectPhotoGroups = (
  state: Pick<ShotGroupStore, 'aim' | 'impacts' | 'otherGroups' | 'groupIndex'>,
): (PhotoGroup & { current: boolean })[] => {
  const others = state.otherGroups.map((group) => ({ ...group, current: false }));
  const index = Math.min(Math.max(0, state.groupIndex), others.length);
  return [
    ...others.slice(0, index),
    { id: 'current', aim: state.aim, impacts: state.impacts, current: true },
    ...others.slice(index),
  ];
};

/** The bullet diameter in millimetres, or null while the field is blank or unusable. */
export const selectBulletDiameterMm = (state: Pick<ShotGroupStore, 'bulletDiameter'>): number | null => {
  const { value, unit } = state.bulletDiameter;
  if (value === null || !isLength(value)) return null;
  return toBulletDiameterMm(value, unit);
};

// A length keeps four decimals so switching between millimetres and inches stays readable and reversible.
const readable = (value: number) => Math.round(value * 10000) / 10000;

const isFinitePoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y);
const toImpacts = (points: readonly Point[]): Impact[] =>
  points.filter(isFinitePoint).map((point) => ({ id: crypto.randomUUID(), x: point.x, y: point.y }));

export const useShotGroupStore = create<ShotGroupStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      setImage: (size) => {
        // Impacts, aim points and the calibration all belong to one photo, so a new photo starts over.
        const imageSize = size && size.width > 0 && size.height > 0 ? size : defaultImageSize;
        const { calibration } = get();
        set({
          imageSize,
          calibration: { ...defaultCalibration(imageSize), value: calibration.value, unit: calibration.unit },
          corners: defaultCorners(imageSize),
          aim: defaultAim(imageSize),
          impacts: [],
          otherGroups: [],
          groupIndex: 0,
        });
      },
      setCalibrationMode: (calibrationMode) => set({ calibrationMode }),
      setCalibrationPoint: (key, point) => set((state) => ({ calibration: { ...state.calibration, [key]: point } })),
      // Keep the last usable length while a field is being edited, so a blank draft is never stored.
      setReferenceValue: (value) =>
        set((state) => ({
          calibration: { ...state.calibration, value },
          ...(isLength(value) ? { lastValidReferenceValue: value } : {}),
        })),
      setReferenceUnit: (unit) =>
        set((state) => {
          // A measured length keeps the length that was measured, so the scale does not jump on a unit change.
          const value = isLength(state.calibration.value)
            ? readable(fromMillimeters(toMillimeters(state.calibration.value, state.calibration.unit), unit))
            : state.calibration.value;
          return {
            calibration: { ...state.calibration, value, unit },
            ...(isLength(value) ? { lastValidReferenceValue: value } : {}),
          };
        }),
      setCorner: (index, point) =>
        set((state) => {
          const corners = [...state.corners] as [Point, Point, Point, Point];
          corners[index] = point;
          return { corners };
        }),
      // The spacing is printed on the sheet in millimetres, so it is always read in millimetres.
      setMarkerSpacing: (markerSpacing) =>
        set(
          isLength(markerSpacing.width) && isLength(markerSpacing.height)
            ? { markerSpacing, lastValidMarkerSpacing: markerSpacing }
            : { markerSpacing },
        ),
      setAim: (aim) => set({ aim }),
      // The shooting distance is a range that was chosen, not a length that was measured, so 100 m
      // becomes 100 yd rather than 109.36 yd. This is how the sight adjustment tool reads it too.
      setDistance: (distance) =>
        set(isLength(distance.value) ? { distance, lastValidDistanceValue: distance.value } : { distance }),
      setOffsetUnit: (offsetUnit) => set({ offsetUnit }),
      // A blank field is a diameter the reader chose not to give, but a zero or a minus sign is a draft
      // on the way to a number. Only the first of those may be saved: the saved state is read back as a
      // whole, so a draft that fails the schema would take every saved group down with it.
      setBulletDiameter: (value) =>
        set((state) => ({
          bulletDiameter: { ...state.bulletDiameter, value },
          ...(value === null || isLength(value) ? { lastValidBulletDiameter: value } : {}),
        })),
      setBulletUnit: (unit) =>
        set((state) => {
          const keepLength = (value: number | null) =>
            value !== null && isLength(value)
              ? readable(fromMillimeters(toBulletDiameterMm(value, state.bulletDiameter.unit), unit))
              : value;
          return {
            bulletDiameter: { value: keepLength(state.bulletDiameter.value), unit },
            lastValidBulletDiameter: keepLength(state.lastValidBulletDiameter),
          };
        }),
      // The target is a precision the reader is aiming for, not a length they measured, so changing
      // its unit leaves the number alone: ±5 mm becomes ±5 MOA rather than 0.17 MOA. The screen
      // prints what the current target comes to in the other units, so neither can be misread.
      setTargetPrecision: (value) =>
        set((state) => ({
          targetPrecision: { ...state.targetPrecision, value },
          ...(value === null || isLength(value) ? { lastValidTargetPrecision: value } : {}),
        })),
      setTargetPrecisionUnit: (unit) => set((state) => ({ targetPrecision: { ...state.targetPrecision, unit } })),
      addImpact: (point) => {
        if (!isFinitePoint(point)) return;
        set((state) => ({ impacts: [...state.impacts, { id: crypto.randomUUID(), ...point }] }));
      },
      addImpactAtOffset: (impact) => {
        const frame = selectFrame(get());
        if (frame === null || !isFinitePoint(impact)) return false;
        const point = placeImpact(impact, get().aim, frame);
        if (!point) return false;
        get().addImpact(point);
        return true;
      },
      replaceImpacts: (points) => {
        const { otherGroups, aim } = get();
        if (otherGroups.length === 0) {
          set({ impacts: toImpacts(points) });
          return;
        }
        // The nearest aim point on the photo, which is what a reader lining up a ladder on one sheet means.
        const aims = [aim, ...otherGroups.map((group) => group.aim)];
        const buckets: Point[][] = aims.map(() => []);
        for (const point of points.filter(isFinitePoint)) {
          let nearest = 0;
          aims.forEach((candidate, index) => {
            const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
            const best = aims[nearest] as Point;
            if (distance < Math.hypot(point.x - best.x, point.y - best.y)) nearest = index;
          });
          buckets[nearest]?.push(point);
        }
        set({
          impacts: toImpacts(buckets[0] ?? []),
          otherGroups: otherGroups.map((group, index) => ({ ...group, impacts: toImpacts(buckets[index + 1] ?? []) })),
        });
      },
      removeImpact: (id) => set((state) => ({ impacts: state.impacts.filter((impact) => impact.id !== id) })),
      undoImpact: () => set((state) => ({ impacts: state.impacts.slice(0, -1) })),
      clearImpacts: () => set({ impacts: [] }),
      startNextGroup: () =>
        set((state) => {
          const others = [...state.otherGroups];
          const index = Math.min(state.groupIndex, others.length);
          others.splice(index, 0, { id: crypto.randomUUID(), aim: state.aim, impacts: state.impacts });
          return { otherGroups: others, groupIndex: index + 1, impacts: [] };
        }),
      selectGroup: (id) =>
        set((state) => {
          const target = state.otherGroups.findIndex((group) => group.id === id);
          const chosen = state.otherGroups[target];
          if (!chosen) return state;
          // The group being edited goes back into its place, and the chosen one comes out of its own.
          const all = selectPhotoGroups(state).map((group) =>
            group.current ? { id: crypto.randomUUID(), aim: group.aim, impacts: group.impacts } : group,
          );
          const position = all.findIndex((group) => group.id === id);
          return {
            aim: chosen.aim,
            impacts: chosen.impacts,
            otherGroups: all
              .filter((group) => group.id !== id)
              .map(({ id: groupId, aim, impacts }) => ({ id: groupId, aim, impacts })),
            groupIndex: position,
          };
        }),
      removeGroup: (id) =>
        set((state) => {
          const index = state.otherGroups.findIndex((group) => group.id === id);
          if (index < 0) return state;
          return {
            otherGroups: state.otherGroups.filter((group) => group.id !== id),
            groupIndex: index < state.groupIndex ? state.groupIndex - 1 : state.groupIndex,
          };
        }),
      setNote: (note) => set({ note }),
      saveRecord: (name) => {
        const state = get();
        const frame = selectFrame(state);
        const trimmed = name.trim();
        if (frame === null || !trimmed || state.records.some((record) => record.name === trimmed)) return false;
        const impacts = state.impacts.map((impact) => measureImpact(impact, state.aim, frame));
        if (impacts.some((impact) => impact === null)) return false;
        const record = groupRecordSchema.safeParse({
          id: crypto.randomUUID(),
          name: trimmed,
          savedAt: new Date().toISOString(),
          distance: state.distance,
          bulletDiameterMm: selectBulletDiameterMm(state),
          note: state.note,
          impacts,
        });
        if (!record.success) return false;
        set({ records: [...state.records, record.data] });
        return true;
      },
      loadRecord: (id) => {
        const state = get();
        const record = state.records.find((item) => item.id === id);
        const frame = selectFrame(state);
        if (!record || frame === null) return false;
        const points = record.impacts.map((impact) => placeImpact(impact, state.aim, frame));
        if (points.some((point) => point === null)) return false;
        // The diameter is stored in millimetres; it is read back in the unit the field is showing.
        const bulletDiameterValue =
          record.bulletDiameterMm === null
            ? null
            : readable(fromMillimeters(record.bulletDiameterMm, state.bulletDiameter.unit));
        set({
          distance: record.distance,
          lastValidDistanceValue: record.distance.value,
          bulletDiameter: { value: bulletDiameterValue, unit: state.bulletDiameter.unit },
          lastValidBulletDiameter: bulletDiameterValue,
          note: record.note,
          impacts: toImpacts(points as Point[]),
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
      // The photo never leaves the page, so only the reusable setup and the saved groups are stored.
      partialize: (state) => ({
        reference: { value: state.lastValidReferenceValue, unit: state.calibration.unit },
        distance: { value: state.lastValidDistanceValue, unit: state.distance.unit },
        offsetUnit: state.offsetUnit,
        bulletDiameter: { value: state.lastValidBulletDiameter, unit: state.bulletDiameter.unit },
        targetPrecision: { value: state.lastValidTargetPrecision, unit: state.targetPrecision.unit },
        sheet: { mode: state.calibrationMode, spacing: state.lastValidMarkerSpacing },
        records: state.records,
      }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        // An empty storage also reaches merge, and a first visit is not a save that could not be read.
        if (!parsed.success && saved !== undefined) reportDiscardedSave(storageKey);
        return parsed.success
          ? {
              ...current,
              calibration: { ...current.calibration, ...parsed.data.reference },
              lastValidReferenceValue: parsed.data.reference.value,
              distance: parsed.data.distance,
              lastValidDistanceValue: parsed.data.distance.value,
              offsetUnit: parsed.data.offsetUnit,
              bulletDiameter: parsed.data.bulletDiameter,
              lastValidBulletDiameter: parsed.data.bulletDiameter.value,
              // A save from before the statistics existed keeps the opening target rather than
              // clearing the field, while a save that cleared it on purpose comes back cleared.
              targetPrecision: parsed.data.targetPrecision ?? current.targetPrecision,
              lastValidTargetPrecision:
                parsed.data.targetPrecision === undefined
                  ? current.lastValidTargetPrecision
                  : parsed.data.targetPrecision.value,
              // A save from before the corner marks opens on the two-point scale it was made with.
              calibrationMode: parsed.data.sheet?.mode ?? current.calibrationMode,
              markerSpacing: parsed.data.sheet?.spacing ?? current.markerSpacing,
              lastValidMarkerSpacing: parsed.data.sheet?.spacing ?? current.lastValidMarkerSpacing,
              records: parsed.data.records,
            }
          : current;
      },
    },
  ),
);
