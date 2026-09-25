import { describe, expect, it } from 'vitest';

import { shotgunGearSchema } from '@/lib/schemas/shotgun-gear';
import {
  estimatedPelletCount,
  gunLabel,
  materialDensity,
  removeBarrel,
  removeGear,
  resolveSetup,
  setupLabel,
  type ShotgunGear,
} from '@/lib/shotgun-gear';

const gear: ShotgunGear = {
  guns: [
    {
      id: 'g1',
      name: 'O/U',
      gauge: '12',
      barrels: [
        { id: 'over', label: '上', lengthCm: 76 },
        { id: 'under', label: '下', lengthCm: 76 },
      ],
    },
    { id: 'g2', name: 'Auto', gauge: '12', barrels: [{ id: 'only', label: '1', lengthCm: null }] },
  ],
  chokes: [{ id: 'c1', name: 'IC', constrictionMm: 0.25 }],
  cartridges: [
    {
      id: 'k1',
      name: 'Trap 24 g',
      material: 'lead',
      diameterMm: 2.41,
      densityGcm3: 11.3,
      chargeG: 24,
      muzzleSpeedMps: 400,
    },
  ],
  setups: [
    { id: 's1', gunId: 'g1', barrelId: 'under', chokeId: 'c1', cartridgeId: 'k1' },
    { id: 's2', gunId: 'g2', barrelId: 'only', chokeId: null, cartridgeId: null },
  ],
};

describe('shotgun gear', () => {
  it('names a setup by gun, the barrel when there are several, the choke and the cartridge', () => {
    const under = resolveSetup(gear, 's1')!;
    expect(gunLabel(under)).toBe('O/U（下・IC）');
    expect(setupLabel(under)).toBe('O/U（下・IC） ／ Trap 24 g');
    expect(setupLabel(resolveSetup(gear, 's2')!)).toBe('Auto');
    expect(resolveSetup(gear, 'missing')).toBeNull();
  });

  it('estimates the pellets in the charge from sphere weight', () => {
    // A 2.41 mm lead sphere is (π/6)·0.241³·11.3 g = 0.0829 g, so 24 g holds about 290.
    expect(estimatedPelletCount(gear.cartridges[0]!)).toBeCloseTo(24 / ((Math.PI / 6) * 0.241 ** 3 * 11.3), 6);
    expect(estimatedPelletCount(gear.cartridges[0]!)).toBeCloseTo(289.6, 0);
  });

  it('offers a density for each named material, including the maker figure for TSS', () => {
    expect(materialDensity('lead')).toBe(11.3);
    expect(materialDensity('tss')).toBe(18);
    expect(materialDensity('other')).toBeNull();
  });

  it('drops the setups that name removed gear, so the registry stays valid', () => {
    const withoutChoke = removeGear(gear, 'chokes', 'c1');
    expect(withoutChoke.setups.map((setup) => setup.id)).toEqual(['s2']);
    expect(shotgunGearSchema.safeParse(withoutChoke).success).toBe(true);
    const withoutUnder = removeBarrel(gear, 'g1', 'under');
    expect(withoutUnder.guns[0]!.barrels.map((barrel) => barrel.id)).toEqual(['over']);
    expect(withoutUnder.setups.map((setup) => setup.id)).toEqual(['s2']);
    // A gun keeps its last barrel.
    expect(removeBarrel(gear, 'g2', 'only')).toBe(gear);
  });

  it('rejects a setup that names gear that is not registered', () => {
    const broken = { ...gear, setups: [{ ...gear.setups[0]!, cartridgeId: 'gone' }] };
    expect(shotgunGearSchema.safeParse(broken).success).toBe(false);
  });
});
