import { create } from 'zustand';

import { reportDiscardedSave } from '@/lib/browser-storage';
import type { Model, Projection } from '@/lib/hunter-map';
import {
  clearSavedMap,
  hunterMapDatabaseName,
  readImageSize,
  readSavedMap,
  writeMapImage,
  writeMapSetup,
} from '@/lib/hunter-map-storage';
import {
  hunterMapSetupSchema,
  maxReferencePoints,
  savedMapImageSchema,
  type HunterMapSetup,
  type ReferencePoint,
  type SavedMapImage,
} from '@/lib/schemas/hunter-map';

/** The IndexedDB database's name doubles as the key the shared notice of lost saves is filed under. */
export const storageKey = hunterMapDatabaseName;

/** `unavailable`: nothing can be read or written. `write-failed`: the last change was not saved (a full disk). */
export type StorageFault = 'unavailable' | 'write-failed' | null;

interface HunterMapState {
  image: SavedMapImage | null;
  points: ReferencePoint[];
  model: Model;
  projection: Projection;
  storageFault: StorageFault;
  hydrate: () => Promise<void>;
  setImage: (image: SavedMapImage | null) => void;
  addPoint: () => string | null;
  updatePoint: (id: string, changes: Partial<Omit<ReferencePoint, 'id'>>) => void;
  removePoint: (id: string) => void;
  setModel: (model: Model) => void;
  setProjection: (projection: Projection) => void;
  reset: () => void;
}

const initialSetup = {
  points: [] as ReferencePoint[],
  model: 'affine' as Model,
  projection: 'transverse-mercator' as Projection,
};

let pointCounter = 0;
const newId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}-${(pointCounter += 1)}`;

export const newImageId = () => newId('map');

export const useHunterMapStore = create<HunterMapState>()((set, get) => {
  const setupOf = (): HunterMapSetup => {
    const { image, points, model, projection } = get();
    return { imageId: image?.id ?? null, points, model, projection };
  };
  const report = (write: Promise<void>) =>
    write.then(
      () => {
        if (get().storageFault === 'write-failed') set({ storageFault: null });
      },
      () => set((state) => ({ storageFault: state.storageFault ?? 'write-failed' })),
    );
  const saveSetup = () => {
    // Nothing is written while storage could not even be opened: the notice already says so.
    if (get().storageFault !== 'unavailable') void report(writeMapSetup(setupOf()));
  };
  const editSetup = (changes: Partial<Pick<HunterMapState, 'points' | 'model' | 'projection'>>) => {
    set(changes);
    saveSetup();
  };

  return {
    image: null,
    ...initialSetup,
    storageFault: null,
    hydrate: async () => {
      let saved: { image: unknown; setup: unknown };
      try {
        saved = await readSavedMap();
      } catch {
        set({ storageFault: 'unavailable' });
        return;
      }
      let discarded = false;
      const image = savedMapImageSchema.safeParse(saved.image);
      if (saved.image !== undefined && !image.success) discarded = true;
      const setup = hunterMapSetupSchema.safeParse(saved.setup);
      if (saved.setup !== undefined && !setup.success) discarded = true;
      let imageData = image.success ? image.data : null;
      // A record can pass its schema and still hold a picture the browser cannot draw, or one whose size
      // no longer matches the size the points were placed against, so the picture is decoded again.
      if (imageData) {
        const size = await readImageSize(new Blob([imageData.data], { type: imageData.type }));
        if (!size || size.width !== imageData.width || size.height !== imageData.height) {
          imageData = null;
          discarded = true;
        }
      }
      // Points placed on another picture would be read against this one, so they are dropped with a notice.
      const setupData = setup.success && setup.data.imageId === (imageData?.id ?? null) ? setup.data : null;
      if (setup.success && !setupData && setup.data.points.length > 0) discarded = true;
      if (discarded) reportDiscardedSave(storageKey);
      const next = {
        image: imageData,
        ...(setupData
          ? { points: setupData.points, model: setupData.model, projection: setupData.projection }
          : {
              points: [],
              model: setup.success ? setup.data.model : initialSetup.model,
              projection: setup.success ? setup.data.projection : initialSetup.projection,
            }),
      };
      set(next);
      // What could not be used is deleted, so the same notice is not raised again on every visit.
      if (discarded) {
        const cleanup = imageData ? writeMapSetup(setupOf()) : writeMapImage(null, setupOf());
        void report(cleanup);
      }
    },
    setImage: (image) => {
      // Reference points belong to the picture they were placed on, so a new picture starts them over.
      set({ image, points: [] });
      if (get().storageFault !== 'unavailable') void report(writeMapImage(image, setupOf()));
    },
    addPoint: () => {
      const { points } = get();
      if (points.length >= maxReferencePoints) return null;
      const id = newId('point');
      editSetup({ points: [...points, { id, x: null, y: null, latitude: '', longitude: '', accuracy: null }] });
      return id;
    },
    updatePoint: (id, changes) =>
      editSetup({ points: get().points.map((point) => (point.id === id ? { ...point, ...changes } : point)) }),
    removePoint: (id) => editSetup({ points: get().points.filter((point) => point.id !== id) }),
    setModel: (model) => editSetup({ model }),
    setProjection: (projection) => editSetup({ projection }),
    reset: () => {
      set({ image: null, ...initialSetup });
      if (get().storageFault !== 'unavailable') void report(clearSavedMap());
    },
  };
});
