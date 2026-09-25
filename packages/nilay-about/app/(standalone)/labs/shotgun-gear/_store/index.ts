import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';
import {
  cartridgeSchema,
  chokeSchema,
  gearSetupSchema,
  gunSchema,
  shotgunGearSchema,
  type Cartridge,
  type Choke,
  type GearSetup,
  type Gun,
  type ShotgunGear,
} from '@/lib/schemas/shotgun-gear';
import { emptyGear, removeBarrel, removeGear } from '@/lib/shotgun-gear';

/**
 * The registry is its own saved key, read by this page and by every tool that offers a choice from
 * it, so each of them rehydrates this store alongside its own.
 */
export const gearStorageKey = 'nilay-labs-shotgun-gear-v1';

type Draft<T> = Omit<T, 'id'>;

interface GearStore extends ShotgunGear {
  /** Each returns false when the entry does not pass the schema, and changes nothing. */
  addGun: (gun: Omit<Gun, 'id' | 'barrels'> & { barrels: Omit<Gun['barrels'][number], 'id'>[] }) => boolean;
  updateGun: (gun: Gun) => boolean;
  removeGun: (id: string) => void;
  removeBarrel: (gunId: string, barrelId: string) => void;
  addChoke: (choke: Draft<Choke>) => boolean;
  updateChoke: (choke: Choke) => boolean;
  removeChoke: (id: string) => void;
  addCartridge: (cartridge: Draft<Cartridge>) => boolean;
  updateCartridge: (cartridge: Cartridge) => boolean;
  removeCartridge: (id: string) => void;
  addSetup: (setup: Draft<GearSetup>) => boolean;
  removeSetup: (id: string) => void;
}

/** Replaces the entry with the same id, or appends a new one. */
const upsert = <T extends { id: string }>(items: readonly T[], item: T) =>
  items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [...items, item];

export const useGearStore = create<GearStore>()(
  persist(
    (set, get) => {
      /** Every change is checked as a whole, so a setup can never name a gun or barrel that is gone. */
      const commit = (next: ShotgunGear) => {
        const parsed = shotgunGearSchema.safeParse(next);
        if (!parsed.success) return false;
        set(parsed.data);
        return true;
      };
      const current = (): ShotgunGear => {
        const { guns, chokes, cartridges, setups } = get();
        return { guns, chokes, cartridges, setups };
      };
      return {
        ...emptyGear(),
        addGun: ({ barrels, ...gun }) => {
          const parsed = gunSchema.safeParse({
            ...gun,
            id: crypto.randomUUID(),
            barrels: barrels.map((barrel) => ({ ...barrel, id: crypto.randomUUID() })),
          });
          return parsed.success && commit({ ...current(), guns: [...get().guns, parsed.data] });
        },
        updateGun: (gun) => {
          const parsed = gunSchema.safeParse(gun);
          if (!parsed.success) return false;
          // Barrels dropped in the edit take their setups with them.
          const kept = new Set(parsed.data.barrels.map((barrel) => barrel.id));
          const setups = get().setups.filter((setup) => setup.gunId !== gun.id || kept.has(setup.barrelId));
          return commit({ ...current(), guns: upsert(get().guns, parsed.data), setups });
        },
        removeGun: (id) => void commit(removeGear(current(), 'guns', id)),
        removeBarrel: (gunId, barrelId) => void commit(removeBarrel(current(), gunId, barrelId)),
        addChoke: (choke) => {
          const parsed = chokeSchema.safeParse({ ...choke, id: crypto.randomUUID() });
          return parsed.success && commit({ ...current(), chokes: [...get().chokes, parsed.data] });
        },
        updateChoke: (choke) => {
          const parsed = chokeSchema.safeParse(choke);
          return parsed.success && commit({ ...current(), chokes: upsert(get().chokes, parsed.data) });
        },
        removeChoke: (id) => void commit(removeGear(current(), 'chokes', id)),
        addCartridge: (cartridge) => {
          const parsed = cartridgeSchema.safeParse({ ...cartridge, id: crypto.randomUUID() });
          return parsed.success && commit({ ...current(), cartridges: [...get().cartridges, parsed.data] });
        },
        updateCartridge: (cartridge) => {
          const parsed = cartridgeSchema.safeParse(cartridge);
          return parsed.success && commit({ ...current(), cartridges: upsert(get().cartridges, parsed.data) });
        },
        removeCartridge: (id) => void commit(removeGear(current(), 'cartridges', id)),
        addSetup: (setup) => {
          const parsed = gearSetupSchema.safeParse({ ...setup, id: crypto.randomUUID() });
          if (!parsed.success) return false;
          // The same combination twice would only be two lines saying the same thing.
          const duplicate = get().setups.some(
            (item) =>
              item.gunId === setup.gunId &&
              item.barrelId === setup.barrelId &&
              item.chokeId === setup.chokeId &&
              item.cartridgeId === setup.cartridgeId,
          );
          return !duplicate && commit({ ...current(), setups: [...get().setups, parsed.data] });
        },
        removeSetup: (id) => void commit({ ...current(), setups: get().setups.filter((setup) => setup.id !== id) }),
      };
    },
    {
      name: gearStorageKey,
      storage: browserStorage as PersistStorage<ShotgunGear>,
      skipHydration: true,
      partialize: ({ guns, chokes, cartridges, setups }) => ({ guns, chokes, cartridges, setups }),
      merge: (saved, current) => {
        const parsed = shotgunGearSchema.safeParse(saved);
        if (parsed.success) return { ...current, ...parsed.data };
        if (saved !== undefined) reportDiscardedSave(gearStorageKey);
        return current;
      },
    },
  ),
);

/** For the tools that read the registry: resolves once the saved registry has been read. */
export const rehydrateGear = () => useGearStore.persist.rehydrate();
