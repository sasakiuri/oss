/**
 * Reading a tabulated drag function.
 *
 * A drag function is published as a list of Mach numbers against the drag coefficient
 * measured there, on a grid that is dense where the curve turns and sparse where it is
 * nearly flat. Every table in this package - the standard projectiles G1 and G7 in
 * trajectory-drag.ts and the sphere in sphere-drag.ts - is read the same way, so the
 * reading lives here rather than beside one of them.
 *
 * Neighbouring points are joined with a straight line rather than a spline. A spline
 * through a transonic rise overshoots between closely spaced points, which would put
 * drag where the published measurements say there is none; a straight line only ever
 * stays between two published values.
 *
 * Outside the published range the end value is held. Holding the low end costs nothing
 * because a projectile that slow carries no useful energy, and the high end is above
 * anything a shoulder arm fires.
 */

export type DragTable = readonly (readonly [mach: number, dragCoefficient: number])[];

/** The Mach numbers the table was measured across. Outside it, dragFromTable holds the end value. */
export function dragTableRange(table: DragTable): { min: number; max: number } {
  const first = table[0];
  const last = table[table.length - 1];
  if (first === undefined || last === undefined) return { min: NaN, max: NaN };
  return { min: first[0], max: last[0] };
}

/** Drag coefficient at a Mach number, interpolated between the two published points around it. */
export function dragFromTable(table: DragTable, mach: number): number {
  const first = table[0];
  const last = table[table.length - 1];
  if (first === undefined || last === undefined || !Number.isFinite(mach)) return NaN;
  if (mach <= first[0]) return first[1];
  if (mach >= last[0]) return last[1];
  let lowIndex = 0;
  let highIndex = table.length - 1;
  while (highIndex - lowIndex > 1) {
    const middle = (lowIndex + highIndex) >> 1;
    const point = table[middle];
    if (point === undefined) return NaN;
    if (point[0] <= mach) lowIndex = middle;
    else highIndex = middle;
  }
  const low = table[lowIndex];
  const high = table[highIndex];
  if (low === undefined || high === undefined) return NaN;
  return low[1] + ((high[1] - low[1]) * (mach - low[0])) / (high[0] - low[0]);
}
