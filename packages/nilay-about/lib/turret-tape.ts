/**
 * The turret tape: distances marked round an elevation turret at the click each one needs.
 *
 * The tape is the turret's circumference laid flat. A click moves the turret by the
 * circumference over the clicks in one turn, so the distance that needs n clicks is marked n of
 * those steps from zero. A distance that needs more than one turn lands on the same strip again,
 * a turn further on, and is labelled with the turn it belongs to.
 *
 * Like the ballistics card it is printed by the browser in millimetres, at real size, and a tape
 * that would not fit the sheet, or whose clicks would print closer than a printer can separate,
 * is reported instead of being shrunk.
 */

import { A4_WIDTH_MM } from './trajectory-card';

/** Paper either side of the strip. */
export const TAPE_MARGIN_MM = 10;
export const MAX_TAPE_LENGTH_MM = A4_WIDTH_MM - 2 * TAPE_MARGIN_MM;
/** Ticks closer than this run together on paper, so ticks are thinned to every 2, 5 or 10 clicks. */
export const MIN_TICK_SPACING_MM = 0.5;

export type TapeDirection = 'left-to-right' | 'right-to-left';

export interface TapeMarkInput {
  distanceLabel: string;
  /** Whole clicks up from the zero. */
  clicks: number;
}

export interface TapeTick {
  positionMm: number;
  clicks: number;
  major: boolean;
}

export interface TapeMark {
  distanceLabel: string;
  clicks: number;
  /** 0 on the first turn, 1 on the second. */
  turn: number;
  positionMm: number;
}

export interface TurretTapeLayout {
  lengthMm: number;
  clickSpacingMm: number;
  /** A tick every this many clicks. */
  tickEvery: number;
  ticks: TapeTick[];
  marks: TapeMark[];
  overflow: 'length' | 'spacing' | null;
}

const TICK_STEPS = [1, 2, 5, 10] as const;

export function layoutTurretTape(parts: {
  circumferenceMm: number;
  clicksPerRevolution: number;
  direction: TapeDirection;
  marks: readonly TapeMarkInput[];
}): TurretTapeLayout | null {
  const { circumferenceMm, clicksPerRevolution, direction } = parts;
  if (!(circumferenceMm > 0) || !Number.isInteger(clicksPerRevolution) || clicksPerRevolution <= 0) return null;
  const clickSpacingMm = circumferenceMm / clicksPerRevolution;
  const tickEvery = TICK_STEPS.find((every) => every * clickSpacingMm >= MIN_TICK_SPACING_MM) ?? null;
  const place = (clicks: number) => {
    const along = (clicks % clicksPerRevolution) * clickSpacingMm;
    return direction === 'left-to-right' ? along : circumferenceMm - along;
  };
  const ticks: TapeTick[] = [];
  if (tickEvery !== null)
    for (let clicks = 0; clicks < clicksPerRevolution; clicks += tickEvery)
      ticks.push({ positionMm: place(clicks), clicks, major: clicks % 10 === 0 });
  const marks = parts.marks
    .filter((mark) => Number.isInteger(mark.clicks) && mark.clicks >= 0)
    .map((mark) => ({
      distanceLabel: mark.distanceLabel,
      clicks: mark.clicks,
      turn: Math.floor(mark.clicks / clicksPerRevolution),
      positionMm: place(mark.clicks),
    }));
  return {
    lengthMm: circumferenceMm,
    clickSpacingMm,
    tickEvery: tickEvery ?? 0,
    ticks,
    marks,
    overflow: circumferenceMm > MAX_TAPE_LENGTH_MM ? 'length' : tickEvery === null ? 'spacing' : null,
  };
}
