import { describe, expect, it } from 'vitest';

import { UNIT_QUANTITY_IDS, convertUnit, unitsOf, valueAllowed } from '@/lib/unit-converter';

/** Relative agreement with a factor printed to seven significant figures. */
const near = (value: number, expected: number) => expect(Math.abs(value - expected) / expected).toBeLessThan(5e-7);

describe('conversion factors', () => {
  it('matches NIST Special Publication 811, Appendix B.8', () => {
    // pound-force per square inch (psi) = 6.894 757 E+03 Pa
    near(convertUnit('pressure', 1, 'psi', 'bar') * 1e5, 6894.757);
    // kilogram-force per square centimetre = 9.806 65 E+04 Pa
    near(convertUnit('pressure', 1, 'kgf-cm2', 'mpa') * 1e6, 98066.5);
    // atmosphere, standard = 1.013 25 E+05 Pa
    near(convertUnit('pressure', 1, 'atm', 'bar'), 1.01325);
    // pound-force inch = 1.129 848 E-01 N·m; pound-force foot = 1.355 818 E+00 N·m
    near(convertUnit('torque', 1, 'in-lb', 'nm'), 0.1129848);
    near(convertUnit('torque', 1, 'ft-lb', 'nm'), 1.355818);
    // kilogram-force meter = 9.806 65 N·m, so a kilogram-force centimetre is a hundredth of it
    near(convertUnit('torque', 100, 'kgf-cm', 'nm'), 9.80665);
    // foot pound-force = 1.355 818 E+00 J
    near(convertUnit('energy', 1, 'ft-lb', 'j'), 1.355818);
    // grain = 6.479 891 E-05 kg; ounce (avoirdupois) = 2.834 952 E-02 kg
    near(convertUnit('mass', 1, 'grain', 'g'), 0.06479891);
    near(convertUnit('mass', 1, 'oz', 'kg'), 0.02834952);
    // foot per second = 3.048 E-01 m/s; mile per hour = 4.4704 E-01 m/s
    near(convertUnit('velocity', 1, 'fps', 'mps'), 0.3048);
    near(convertUnit('velocity', 1, 'mph', 'mps'), 0.44704);
    near(convertUnit('length', 1, 'yd', 'm'), 0.9144);
  });

  it('reads MOA and mil as the lengths a target shows', () => {
    // One MOA subtends 1.047 inches at 100 yards and 2.909 cm at 100 m; one mil 3.6 inches and 10 cm.
    expect(convertUnit('angle', 1, 'moa', 'iphy')).toBeCloseTo(1.0472, 4);
    expect(convertUnit('angle', 1, 'moa', 'cm-100m')).toBeCloseTo(2.9089, 4);
    expect(convertUnit('angle', 1, 'mil', 'iphy')).toBeCloseTo(3.6, 4);
    expect(convertUnit('angle', 1, 'mil', 'cm-100m')).toBeCloseTo(10, 4);
    expect(convertUnit('angle', 1, 'deg', 'moa')).toBeCloseTo(60, 10);
  });

  it('returns every unit to itself on a round trip', () => {
    for (const quantity of UNIT_QUANTITY_IDS)
      for (const from of unitsOf(quantity))
        for (const to of unitsOf(quantity))
          expect(convertUnit(quantity, convertUnit(quantity, 3.7, from, to), to, from)).toBeCloseTo(3.7, 9);
  });

  it('refuses units of another quantity and readings that cannot be', () => {
    expect(convertUnit('pressure', 1, 'nm', 'bar')).toBeNaN();
    expect(convertUnit('pressure', 1, 'toString', 'bar')).toBeNaN();
    expect(valueAllowed('pressure', -1, 'bar')).toBe(false);
    expect(valueAllowed('angle', 6000, 'moa')).toBe(false);
    expect(valueAllowed('angle', -3, 'mil')).toBe(true);
    expect(valueAllowed('energy', NaN, 'j')).toBe(false);
  });
});
