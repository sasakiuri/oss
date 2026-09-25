import { create } from 'zustand';

import { reportDiscardedSave } from '@/lib/browser-storage';
import type { Model, Projection } from '@/lib/hunter-map';
import {
  clearSavedMaps,
  deleteSavedMap,
  hunterMapDatabaseName,
  readCatalog,
  readImageSize,
  readMapImage,
  writeActiveMap,
  writeMapSetup,
  writeNewMap,
} from '@/lib/hunter-map-storage';
import {
  hunterMapSetupSchema,
  maxReferencePoints,
  maxZones,
  savedMapImageSchema,
  type HunterMapSetup,
  type ReferencePoint,
  type SavedMapImage,
  type Zone,
} from '@/lib/schemas/hunter-map';

/** The IndexedDB database's name doubles as the key the shared notice of lost saves is filed under. */
export const storageKey = hunterMapDatabaseName;

/** `unavailable`: nothing can be read or written. `write-failed`: the last change was not saved (a full disk). */
export type StorageFault = 'unavailable' | 'write-failed' | null;

interface HunterMapState {
  /** Every saved map's setup, in the order the maps were added. They are small; pictures are not held. */
  setups: HunterMapSetup[];
  /** The open map, whose picture is `image`; null while none is open. */
  activeId: string | null;
  image: SavedMapImage | null;
  storageFault: StorageFault;
  hydrate: () => Promise<void>;
  addMap: (image: SavedMapImage, name: string) => void;
  openMap: (id: string) => Promise<void>;
  deleteMap: (id: string) => Promise<void>;
  renameMap: (name: string) => void;
  setFiscalYear: (fiscalYear: number | null) => void;
  addPoint: () => string | null;
  updatePoint: (id: string, changes: Partial<Omit<ReferencePoint, 'id'>>) => void;
  removePoint: (id: string) => void;
  setModel: (model: Model) => void;
  setProjection: (projection: Projection) => void;
  addZone: (zone: Omit<Zone, 'id'>) => string | null;
  renameZone: (id: string, name: string) => void;
  removeZone: (id: string) => void;
  /** Deletes every saved map. */
  reset: () => void;
}

/** The open map's setup. */
export const selectSetup = (state: Pick<HunterMapState, 'setups' | 'activeId'>): HunterMapSetup | null =>
  state.setups.find((setup) => setup.id === state.activeId) ?? null;

let counter = 0;
const newId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now().toString(36)}-${(counter += 1)}`;

export const newImageId = () => newId('map');

export const newSetup = (id: string, name: string): HunterMapSetup => ({
  id,
  name,
  fiscalYear: null,
  points: [],
  model: 'affine',
  projection: 'transverse-mercator',
  zones: [],
});

/**
 * A saved picture that passes its schema can still be one the browser cannot draw, or one whose size
 * no longer matches what its points were placed against, so it is decoded again before use.
 */
async function usableImage(raw: unknown, id: string): Promise<SavedMapImage | null> {
  const parsed = savedMapImageSchema.safeParse(raw);
  if (!parsed.success || parsed.data.id !== id) return null;
  const size = await readImageSize(new Blob([parsed.data.data], { type: parsed.data.type }));
  return size && size.width === parsed.data.width && size.height === parsed.data.height ? parsed.data : null;
}

export const useHunterMapStore = create<HunterMapState>()((set, get) => {
  const report = (write: Promise<void>) =>
    write.then(
      () => {
        if (get().storageFault === 'write-failed') set({ storageFault: null });
      },
      () => set((state) => ({ storageFault: state.storageFault ?? 'write-failed' })),
    );
  const canWrite = () => get().storageFault !== 'unavailable';

  /** Applies a change to the open map's setup, and saves it. */
  const editSetup = (change: (setup: HunterMapSetup) => HunterMapSetup) => {
    const current = selectSetup(get());
    if (!current) return;
    const setup = change(current);
    set((state) => ({ setups: state.setups.map((entry) => (entry.id === setup.id ? setup : entry)) }));
    if (canWrite()) void report(writeMapSetup(setup.id, setup));
  };

  /** Opens a saved map, deleting it with a notice if its picture can no longer be used. */
  const load = async (id: string): Promise<boolean> => {
    if (!get().setups.some((setup) => setup.id === id)) return false;
    let raw: unknown;
    try {
      raw = await readMapImage(id);
    } catch {
      set({ storageFault: 'unavailable' });
      return false;
    }
    const image = await usableImage(raw, id);
    if (!image) {
      reportDiscardedSave(storageKey);
      set((state) => ({ setups: state.setups.filter((setup) => setup.id !== id) }));
      if (canWrite()) void report(deleteSavedMap(id, null));
      return false;
    }
    set({ image, activeId: id });
    return true;
  };

  return {
    setups: [],
    activeId: null,
    image: null,
    storageFault: null,
    hydrate: async () => {
      let catalog;
      try {
        catalog = await readCatalog();
      } catch {
        set({ storageFault: 'unavailable' });
        return;
      }
      const setups: HunterMapSetup[] = [];
      let discarded = catalog.droppedLegacy;
      for (const raw of catalog.setups) {
        const parsed = hunterMapSetupSchema.safeParse(raw);
        if (parsed.success) setups.push(parsed.data);
        else {
          discarded = true;
          // What cannot be read is deleted, so the same notice is not raised on every visit.
          const id = typeof raw === 'object' && raw !== null && 'id' in raw ? raw.id : null;
          if (typeof id === 'string') void report(deleteSavedMap(id, null));
        }
      }
      if (discarded) reportDiscardedSave(storageKey);
      set({ setups });
      const activeId = typeof catalog.activeId === 'string' ? catalog.activeId : null;
      let opened = activeId !== null && (await load(activeId));
      // The open map was lost: open the first that still works.
      for (const setup of get().setups) {
        if (opened) break;
        opened = await load(setup.id);
      }
      if (canWrite() && get().activeId !== activeId) void report(writeActiveMap(get().activeId));
    },
    addMap: (image, name) => {
      const setup = newSetup(image.id, name);
      set((state) => ({ image, activeId: image.id, setups: [...state.setups, setup] }));
      if (canWrite()) void report(writeNewMap(image.id, image, setup));
    },
    openMap: async (id) => {
      if (get().activeId === id) return;
      if ((await load(id)) && canWrite()) void report(writeActiveMap(id));
    },
    deleteMap: async (id) => {
      const wasOpen = get().activeId === id;
      const setups = get().setups.filter((setup) => setup.id !== id);
      set({ setups, ...(wasOpen ? { image: null, activeId: null } : {}) });
      const next = wasOpen ? (setups[0]?.id ?? null) : get().activeId;
      if (canWrite()) void report(deleteSavedMap(id, next));
      if (wasOpen && next) await load(next);
    },
    renameMap: (name) => editSetup((setup) => ({ ...setup, name })),
    setFiscalYear: (fiscalYear) => editSetup((setup) => ({ ...setup, fiscalYear })),
    addPoint: () => {
      const setup = selectSetup(get());
      if (!setup || setup.points.length >= maxReferencePoints) return null;
      const id = newId('point');
      editSetup((current) => ({
        ...current,
        points: [...current.points, { id, x: null, y: null, latitude: '', longitude: '', accuracy: null }],
      }));
      return id;
    },
    updatePoint: (id, changes) =>
      editSetup((setup) => ({
        ...setup,
        points: setup.points.map((point) => (point.id === id ? { ...point, ...changes } : point)),
      })),
    removePoint: (id) => editSetup((setup) => ({ ...setup, points: setup.points.filter((point) => point.id !== id) })),
    setModel: (model) => editSetup((setup) => ({ ...setup, model })),
    setProjection: (projection) => editSetup((setup) => ({ ...setup, projection })),
    addZone: (zone) => {
      const setup = selectSetup(get());
      if (!setup || setup.zones.length >= maxZones) return null;
      const id = newId('zone');
      editSetup((current) => ({ ...current, zones: [...current.zones, { ...zone, id }] }));
      return id;
    },
    renameZone: (id, name) =>
      editSetup((setup) => ({
        ...setup,
        zones: setup.zones.map((zone) => (zone.id === id ? { ...zone, name } : zone)),
      })),
    removeZone: (id) => editSetup((setup) => ({ ...setup, zones: setup.zones.filter((zone) => zone.id !== id) })),
    reset: () => {
      set({ setups: [], image: null, activeId: null });
      if (canWrite()) void report(clearSavedMaps());
    },
  };
});
