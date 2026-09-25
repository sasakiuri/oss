/**
 * How many times a diving or carbon cylinder fills a pre-charged pneumatic (PCP) air gun.
 *
 * Each fill connects the cylinder, the gun's reservoir and the hose, and the valve is closed when the
 * gun reaches its fill pressure; the hose is then bled to the air. The air is treated as an ideal gas
 * at a constant temperature (Boyle's law), with absolute pressures: the amount of air in a volume is
 * proportional to pressure times volume. A fill is full while the three volumes, balanced, would stand
 * at or above the fill pressure; after that the last fill stops where they balance.
 *
 * Real air is less compressible than an ideal gas at 200 to 300 bar, so a cylinder holds less air than
 * this counts and real fills run out sooner. Filling also warms the air, so gauges read high until it cools.
 */

/** Standard atmosphere, in bar: gauges read pressure above it, and the arithmetic needs absolute pressure. */
export const ATMOSPHERE_BAR = 1.01325;

export type PressureUnit = 'bar' | 'mpa' | 'psi';

/** 1 psi is 6894.757 Pa; 1 MPa is 10 bar. */
const BAR_PER: Record<PressureUnit, number> = { bar: 1, mpa: 10, psi: 0.06894757 };

export function toBar(value: number, unit: PressureUnit): number {
  return value * BAR_PER[unit];
}

export function fromBar(bar: number, unit: PressureUnit): number {
  return bar / BAR_PER[unit];
}

export interface FillInput {
  /** Water capacity of the cylinder, in litres. */
  tankLitres: number;
  /** Gauge pressures, in bar. */
  tankBar: number;
  fillBar: number;
  /** What the gun is down to when it is refilled. */
  refillBar: number;
  /** Reservoir and hose volumes, in cubic centimetres. The hose is bled after every fill. */
  gunCc: number;
  hoseCc: number;
}

export interface FillStep {
  number: number;
  /** Gauge pressure left in the cylinder after this fill. */
  tankAfterBar: number;
  /** Gauge pressure the gun reached: the fill pressure for a full fill. */
  gunBar: number;
  full: boolean;
}

export type FillPlan =
  | { kind: 'ok'; steps: FillStep[]; fullFills: number; tankLeftBar: number; truncated: boolean }
  | { kind: 'invalid'; problem: 'volumes' | 'pressures' | 'order' };

/** A cylinder of a few hundred litres on a gun of a few cubic centimetres would list thousands of fills. */
export const MAX_FILLS = 2000;

export function planFills(input: FillInput): FillPlan {
  const { tankLitres, tankBar, fillBar, refillBar, gunCc, hoseCc } = input;
  if (![tankLitres, gunCc].every((value) => Number.isFinite(value) && value > 0) || !(hoseCc >= 0))
    return { kind: 'invalid', problem: 'volumes' };
  if (![tankBar, fillBar, refillBar].every((value) => Number.isFinite(value) && value >= 0))
    return { kind: 'invalid', problem: 'pressures' };
  if (!(fillBar > refillBar)) return { kind: 'invalid', problem: 'order' };

  // Volumes in litres and pressures absolute from here on.
  const tank = tankLitres;
  const gun = gunCc / 1000;
  const hose = hoseCc / 1000;
  const fill = fillBar + ATMOSPHERE_BAR;
  const low = refillBar + ATMOSPHERE_BAR;
  let pressure = tankBar + ATMOSPHERE_BAR;
  const steps: FillStep[] = [];
  while (steps.length < MAX_FILLS) {
    // Air only flows from the cylinder while it stands above what the gun holds.
    if (pressure <= low) break;
    const balanced = (pressure * tank + low * gun + ATMOSPHERE_BAR * hose) / (tank + gun + hose);
    // A balance that lands exactly on the fill pressure is a full fill, whatever the last bit of the float says.
    if (balanced >= fill - 1e-9) {
      pressure -= ((fill - low) * gun + (fill - ATMOSPHERE_BAR) * hose) / tank;
      steps.push({ number: steps.length + 1, tankAfterBar: pressure - ATMOSPHERE_BAR, gunBar: fillBar, full: true });
      continue;
    }
    steps.push({
      number: steps.length + 1,
      tankAfterBar: balanced - ATMOSPHERE_BAR,
      gunBar: balanced - ATMOSPHERE_BAR,
      full: false,
    });
    pressure = balanced;
    break;
  }
  return {
    kind: 'ok',
    steps,
    fullFills: steps.filter((step) => step.full).length,
    tankLeftBar: pressure - ATMOSPHERE_BAR,
    truncated: steps.length >= MAX_FILLS,
  };
}
