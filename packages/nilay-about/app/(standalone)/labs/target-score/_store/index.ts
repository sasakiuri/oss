import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import { getMarkerLayout } from '@/lib/home-target';
import type { Quad } from '@/lib/homography';
import { issfTarget, type IssfTargetKey, type ScoredShot } from '@/lib/issf-target';
import {
  issfTargetKeySchema,
  scoreSessionSchema,
  scoredShotSchema,
  type ScoreSession,
} from '@/lib/schemas/target-score';
import { distanceBetween, sheetFrame, type PhotoFrame, type Point } from '@/lib/shot-group';

export const storageKey = 'nilay-labs-target-score-v1';

export interface ImageSize {
  width: number;
  height: number;
}
export interface Shot extends ScoredShot {
  id: string;
}
/** How the photo is lined up with the target: its centre and the edge of the black, or the printed corner marks. */
export type AlignMode = 'black-edge' | 'corners';

/** Without a photo the target is drawn on a square this many pixels across. */
export const drawnSize = 1000;
const drawnSizeOf: ImageSize = { width: drawnSize, height: drawnSize };

const defaultCorners = ({ width, height }: ImageSize): Quad => [
  { x: width * 0.1, y: height * 0.1 },
  { x: width * 0.9, y: height * 0.1 },
  { x: width * 0.9, y: height * 0.9 },
  { x: width * 0.1, y: height * 0.9 },
];

const savedSchema = z.object({
  target: issfTargetKeySchema,
  decimal: z.boolean(),
  shots: z.array(scoredShotSchema),
  sessions: z.array(scoreSessionSchema),
});
type SavedState = z.infer<typeof savedSchema>;

interface TargetScoreStore {
  target: IssfTargetKey;
  decimal: boolean;
  /** Whether the next shots are sighters. */
  sighting: boolean;
  shots: Shot[];
  sessions: ScoreSession[];
  deletedSession: { session: ScoreSession; index: number } | null;
  /** The photo, if one is loaded. Its alignment belongs to the photo and is never saved. */
  photoSize: ImageSize | null;
  alignMode: AlignMode;
  centre: Point;
  edge: Point;
  corners: Quad;
  markerSpacing: { width: number; height: number };
  setTarget: (target: IssfTargetKey) => void;
  setDecimal: (decimal: boolean) => void;
  setSighting: (sighting: boolean) => void;
  addShot: (shot: { x: number; y: number }) => void;
  replaceShots: (shots: readonly { x: number; y: number }[]) => void;
  removeShot: (id: string) => void;
  undoShot: () => void;
  clearShots: () => void;
  setPhoto: (size: ImageSize | null) => void;
  setAlignMode: (mode: AlignMode) => void;
  setCentre: (point: Point) => void;
  setEdge: (point: Point) => void;
  setCorner: (index: 0 | 1 | 2 | 3, point: Point) => void;
  setMarkerSpacing: (spacing: { width: number; height: number }) => void;
  saveSession: (name: string) => boolean;
  loadSession: (id: string) => boolean;
  deleteSession: (id: string) => void;
  undoDelete: () => void;
  reset: () => void;
}

const initialState = {
  target: 'AR10' as IssfTargetKey,
  decimal: true,
  sighting: false,
  shots: [] as Shot[],
  sessions: [] as ScoreSession[],
  deletedSession: null as { session: ScoreSession; index: number } | null,
  photoSize: null as ImageSize | null,
  alignMode: 'black-edge' as AlignMode,
  centre: { x: drawnSize / 2, y: drawnSize / 2 },
  edge: { x: drawnSize * 0.75, y: drawnSize / 2 },
  corners: defaultCorners(drawnSizeOf),
  markerSpacing: getMarkerLayout(210, 297).spacing,
};

export const selectImageSize = (state: Pick<TargetScoreStore, 'photoSize'>): ImageSize =>
  state.photoSize ?? drawnSizeOf;

/**
 * How image pixels read as millimetres. Without a photo the target is drawn so its 1 ring and a
 * margin fill the square; with a photo the scale comes from the black's known diameter or the marks.
 */
export const selectFrame = (
  state: Pick<TargetScoreStore, 'target' | 'photoSize' | 'alignMode' | 'centre' | 'edge' | 'corners' | 'markerSpacing'>,
): PhotoFrame | null => {
  const target = issfTarget(state.target);
  if (state.photoSize === null)
    return { kind: 'scale', mmPerPixel: ((target.ringDiametersMm[0] as number) * 1.15) / drawnSize };
  if (state.alignMode === 'corners') return sheetFrame(state.corners, state.markerSpacing);
  const pixels = distanceBetween(state.centre, state.edge);
  return Number.isFinite(pixels) && pixels > 0 ? { kind: 'scale', mmPerPixel: target.blackMm / 2 / pixels } : null;
};

const isFinitePoint = (point: { x: number; y: number }) => Number.isFinite(point.x) && Number.isFinite(point.y);

export const useTargetScoreStore = create<TargetScoreStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      // A card belongs to one target, so changing the target starts a new card after the screen asks.
      setTarget: (target) =>
        set((state) => ({
          target,
          shots: [],
          decimal: issfTarget(target).decimal ? state.decimal : false,
        })),
      setDecimal: (decimal) => set((state) => ({ decimal: decimal && issfTarget(state.target).decimal })),
      setSighting: (sighting) => set({ sighting }),
      addShot: (shot) => {
        if (!isFinitePoint(shot)) return;
        set((state) => ({ shots: [...state.shots, { id: crypto.randomUUID(), ...shot, sighter: state.sighting }] }));
      },
      replaceShots: (shots) =>
        set((state) => ({
          shots: shots
            .filter(isFinitePoint)
            .map((shot) => ({ id: crypto.randomUUID(), x: shot.x, y: shot.y, sighter: state.sighting })),
        })),
      removeShot: (id) => set((state) => ({ shots: state.shots.filter((shot) => shot.id !== id) })),
      undoShot: () => set((state) => ({ shots: state.shots.slice(0, -1) })),
      clearShots: () => set({ shots: [] }),
      setPhoto: (size) => {
        const photoSize = size && size.width > 0 && size.height > 0 ? size : null;
        const frame = photoSize ?? drawnSizeOf;
        set({
          photoSize,
          centre: { x: frame.width / 2, y: frame.height / 2 },
          edge: { x: frame.width * 0.7, y: frame.height / 2 },
          corners: defaultCorners(frame),
        });
      },
      setAlignMode: (alignMode) => set({ alignMode }),
      setCentre: (centre) => set({ centre }),
      setEdge: (edge) => set({ edge }),
      setCorner: (index, point) =>
        set((state) => {
          const corners = [...state.corners] as [Point, Point, Point, Point];
          corners[index] = point;
          return { corners };
        }),
      setMarkerSpacing: (markerSpacing) => set({ markerSpacing }),
      saveSession: (name) => {
        const state = get();
        const trimmed = name.trim();
        if (!trimmed || state.shots.length === 0 || state.sessions.some((session) => session.name === trimmed))
          return false;
        const session = scoreSessionSchema.safeParse({
          id: crypto.randomUUID(),
          name: trimmed,
          savedAt: new Date().toISOString(),
          target: state.target,
          decimal: state.decimal,
          shots: state.shots.map(({ x, y, sighter }) => ({ x, y, sighter })),
        });
        if (!session.success) return false;
        set({ sessions: [...state.sessions, session.data] });
        return true;
      },
      loadSession: (id) => {
        const session = get().sessions.find((item) => item.id === id);
        if (!session) return false;
        set({
          target: session.target,
          decimal: session.decimal,
          shots: session.shots.map((shot) => ({ id: crypto.randomUUID(), ...shot })),
        });
        return true;
      },
      deleteSession: (id) => {
        const index = get().sessions.findIndex((item) => item.id === id);
        const session = get().sessions[index];
        if (!session) return;
        set((state) => ({
          deletedSession: { session, index },
          sessions: state.sessions.filter((item) => item.id !== id),
        }));
      },
      undoDelete: () => {
        const deleted = get().deletedSession;
        if (!deleted) return;
        const sessions = [...get().sessions];
        let name = deleted.session.name;
        let suffix = 2;
        while (sessions.some((item) => item.name === name)) name = `${deleted.session.name} (${suffix++})`;
        sessions.splice(deleted.index, 0, { ...deleted.session, name });
        set({ sessions, deletedSession: null });
      },
      reset: () => set({ ...initialState, sessions: get().sessions, deletedSession: get().deletedSession }),
    }),
    {
      name: storageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      // The card in progress is kept like a paper card on the bench; the photo and its alignment are not.
      partialize: (state) => ({
        target: state.target,
        decimal: state.decimal,
        shots: state.shots.map(({ x, y, sighter }) => ({ x, y, sighter })),
        sessions: state.sessions,
      }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (!parsed.success) {
          if (saved !== undefined) reportDiscardedSave(storageKey);
          return current;
        }
        return {
          ...current,
          target: parsed.data.target,
          decimal: parsed.data.decimal && issfTarget(parsed.data.target).decimal,
          shots: parsed.data.shots.map((shot) => ({ id: crypto.randomUUID(), ...shot })),
          sessions: parsed.data.sessions,
        };
      },
    },
  ),
);
