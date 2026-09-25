/**
 * The owner's guns, chokes and cartridges, and the combinations they shoot together.
 *
 * Nothing here is a recommendation: the registry only holds what the owner typed in, so that the
 * score sheet, the pattern board, the pellet calculator and the lead calculator can be filled from
 * one entry instead of the same numbers typed four times.
 */

import type { Cartridge, Choke, GearSetup, Gun, GunBarrel, ShotgunGear, ShotMaterial } from './schemas/shotgun-gear';
import { MATERIAL_DENSITIES } from './shot-pellets';
import { sphereMassKg } from './sphere-drag';

export type { Cartridge, Choke, GearSetup, Gun, GunBarrel, ShotgunGear, ShotMaterial } from './schemas/shotgun-gear';

export const emptyGear = (): ShotgunGear => ({ guns: [], chokes: [], cartridges: [], setups: [] });

/** The density a material fills in, which the owner can overwrite; "other" has none to offer. */
export function materialDensity(material: ShotMaterial): number | null {
  return material === 'other' ? null : MATERIAL_DENSITIES[material];
}

export interface ResolvedSetup {
  setup: GearSetup;
  gun: Gun;
  barrel: GunBarrel;
  choke: Choke | null;
  cartridge: Cartridge | null;
}

export function resolveSetup(gear: ShotgunGear, setupId: string): ResolvedSetup | null {
  const setup = gear.setups.find((item) => item.id === setupId);
  if (!setup) return null;
  const gun = gear.guns.find((item) => item.id === setup.gunId);
  const barrel = gun?.barrels.find((item) => item.id === setup.barrelId);
  if (!gun || !barrel) return null;
  return {
    setup,
    gun,
    barrel,
    choke: gear.chokes.find((item) => item.id === setup.chokeId) ?? null,
    cartridge: gear.cartridges.find((item) => item.id === setup.cartridgeId) ?? null,
  };
}

/** The gun, the barrel and the choke in one line, as a score sheet or a pattern record names them. */
export function gunLabel({ gun, barrel, choke }: Pick<ResolvedSetup, 'gun' | 'barrel' | 'choke'>): string {
  const parts = [gun.barrels.length > 1 ? barrel.label : null, choke?.name ?? null].filter(Boolean);
  return parts.length > 0 ? `${gun.name}（${parts.join('・')}）` : gun.name;
}

export function setupLabel(resolved: ResolvedSetup): string {
  return resolved.cartridge ? `${gunLabel(resolved)} ／ ${resolved.cartridge.name}` : gunLabel(resolved);
}

/**
 * Pellets in the charge if every one were a sphere of the stated diameter and density, which is the
 * same estimate the pellet calculator makes. It is not a count from the box.
 */
export function estimatedPelletCount(cartridge: Cartridge): number {
  const massKg = sphereMassKg(cartridge.diameterMm / 1000, cartridge.densityGcm3 * 1000);
  return cartridge.chargeG / 1000 / massKg;
}

/** Removing a gun, choke or cartridge also removes every setup that names it, so no setup points at nothing. */
export function removeGear(gear: ShotgunGear, kind: 'guns' | 'chokes' | 'cartridges', id: string): ShotgunGear {
  const setups = gear.setups.filter((setup) =>
    kind === 'guns' ? setup.gunId !== id : kind === 'chokes' ? setup.chokeId !== id : setup.cartridgeId !== id,
  );
  return { ...gear, [kind]: gear[kind].filter((item) => item.id !== id), setups };
}

/** Removing one barrel from a gun drops the setups that used it; a gun keeps at least one barrel. */
export function removeBarrel(gear: ShotgunGear, gunId: string, barrelId: string): ShotgunGear {
  const gun = gear.guns.find((item) => item.id === gunId);
  if (!gun || gun.barrels.length <= 1) return gear;
  return {
    ...gear,
    guns: gear.guns.map((item) =>
      item.id === gunId ? { ...item, barrels: item.barrels.filter((barrel) => barrel.id !== barrelId) } : item,
    ),
    setups: gear.setups.filter((setup) => setup.barrelId !== barrelId),
  };
}
