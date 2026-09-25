/**
 * Units a shooter meets on data sheets, turrets and gauges, converted through one base unit each.
 *
 * Every factor is an exact definition or follows from one: the international yard and pound
 * (0.9144 m and 0.45359237 kg exactly, 1959), the grain (1/7000 lb), the standard acceleration
 * of gravity that the kilogram-force and pound-force are defined with (9.80665 m/s²), the bar
 * (10⁵ Pa) and the standard atmosphere (101 325 Pa). NIST Special Publication 811 (2008), Appendix
 * B.8, lists the resulting factors, and the tests check them against it.
 *
 * Angles are not all linear. MOA, mil and degrees are angles and scale by a factor. "cm at 100 m"
 * and "inches at 100 yards" (IPHY) are lengths on a target, so they are converted through the
 * tangent, the same way the sight adjustment tool turns clicks into millimetres.
 */

import { MIL_RADIANS, MOA_RADIANS } from './sight-adjustment';

const POUND_KG = 0.45359237;
const GRAVITY = 9.80665;
const INCH_M = 0.0254;
const FOOT_M = 0.3048;
const YARD_M = 0.9144;
const POUND_FORCE_N = POUND_KG * GRAVITY;

interface UnitDefinition {
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

const linear = (factor: number): UnitDefinition => ({
  toBase: (value) => value * factor,
  fromBase: (value) => value / factor,
});

/** A length on a target at a distance, as the angle it subtends there. */
const onTarget = (lengthM: number, distanceM: number): UnitDefinition => ({
  toBase: (value) => Math.atan((value * lengthM) / distanceM),
  fromBase: (value) => (Math.tan(value) * distanceM) / lengthM,
});

/** Base units: Pa, N·m, m/s, g, J, mm, rad. */
export const UNIT_QUANTITIES = {
  pressure: {
    bar: linear(1e5),
    mpa: linear(1e6),
    psi: linear(POUND_FORCE_N / INCH_M ** 2),
    'kgf-cm2': linear(GRAVITY * 1e4),
    atm: linear(101325),
  },
  torque: {
    nm: linear(1),
    'kgf-cm': linear(GRAVITY / 100),
    'in-lb': linear(POUND_FORCE_N * INCH_M),
    'ft-lb': linear(POUND_FORCE_N * FOOT_M),
  },
  velocity: {
    mps: linear(1),
    kmh: linear(1 / 3.6),
    fps: linear(FOOT_M),
    mph: linear(1609.344 / 3600),
  },
  mass: {
    g: linear(1),
    kg: linear(1000),
    grain: linear((POUND_KG * 1000) / 7000),
    oz: linear((POUND_KG * 1000) / 16),
    lb: linear(POUND_KG * 1000),
  },
  energy: {
    j: linear(1),
    'ft-lb': linear(POUND_FORCE_N * FOOT_M),
    'kgf-m': linear(GRAVITY),
  },
  length: {
    mm: linear(1),
    cm: linear(10),
    m: linear(1000),
    inch: linear(INCH_M * 1000),
    ft: linear(FOOT_M * 1000),
    yd: linear(YARD_M * 1000),
  },
  angle: {
    moa: linear(MOA_RADIANS),
    mil: linear(MIL_RADIANS),
    deg: linear(Math.PI / 180),
    'cm-100m': onTarget(0.01, 100),
    iphy: onTarget(INCH_M, 100 * YARD_M),
  },
} as const satisfies Record<string, Record<string, UnitDefinition>>;

export type UnitQuantity = keyof typeof UNIT_QUANTITIES;
export type UnitOf<Q extends UnitQuantity> = keyof (typeof UNIT_QUANTITIES)[Q] & string;
export type AnyUnit = { [Q in UnitQuantity]: UnitOf<Q> }[UnitQuantity];

export const UNIT_QUANTITY_IDS = Object.keys(UNIT_QUANTITIES) as UnitQuantity[];

export function unitsOf(quantity: UnitQuantity): AnyUnit[] {
  return Object.keys(UNIT_QUANTITIES[quantity]) as AnyUnit[];
}

function definition(quantity: UnitQuantity, unit: string): UnitDefinition | null {
  const units: Record<string, UnitDefinition> = UNIT_QUANTITIES[quantity];
  return Object.hasOwn(units, unit) ? (units[unit] ?? null) : null;
}

/** The value in another unit of the same quantity, or NaN when either unit is not of that quantity. */
export function convertUnit(quantity: UnitQuantity, value: number, from: string, to: string): number {
  const source = definition(quantity, from);
  const target = definition(quantity, to);
  if (source === null || target === null || !Number.isFinite(value)) return NaN;
  return target.fromBase(source.toBase(value));
}

/**
 * An angle on a target has to stay short of a right angle to be a length at all, and a length or a
 * pressure below zero is not a reading, so those are refused. Angles, speeds and energies may be
 * negative in a hold or a correction and are left as typed.
 */
export function valueAllowed(quantity: UnitQuantity, value: number, unit: string): boolean {
  if (!Number.isFinite(value)) return false;
  if (quantity === 'angle') return Math.abs(convertUnit('angle', value, unit, 'deg')) < 90;
  if (quantity === 'pressure' || quantity === 'length' || quantity === 'mass') return value >= 0;
  return true;
}
