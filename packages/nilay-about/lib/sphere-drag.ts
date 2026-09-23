/**
 * Drag coefficient of a sphere against Mach number, and the geometry of a spherical
 * projectile: what a shot pellet or a round ball needs on top of the standard projectile
 * tables in trajectory-drag.ts.
 *
 * Transcribed from the tabulation JBM Ballistics distributes as `mcgs.txt`
 * (https://jbmballistics.com/downloads.html, retrieved 2026-09-22), listed there as the
 * sphere of 9/16 inch, where the site states of these files: "I obtained the G functions
 * and sphere from BRL", the US Army Ballistic Research Laboratory that measured them.
 * Every value below is that file's value: none was interpolated, rounded or invented.
 * The table is read exactly as the G1 and G7 tables are, through drag-table.ts.
 *
 * Two limits come with it, and both have to reach the screen of any tool that uses it.
 *
 * The coefficient is referred to the frontal area of the sphere, so a calculation has to
 * divide by that area rather than by a ballistic coefficient: sphereFrontalAreaM2 and
 * sphereMassKg below are what turn a pellet diameter and a material density into the two
 * quantities the equation of motion needs. No ballistic coefficient enters anywhere.
 *
 * The measurement is of one sphere, 9/16 of an inch across - 14.3 mm, about the size of a
 * musket ball. The drag of a sphere depends on the Reynolds number as well as on the Mach
 * number, and a 2 to 4 mm shot pellet flies at a Reynolds number several times smaller
 * than the sphere these coefficients were measured on. Using the table for a pellet is
 * therefore an approximation, not a measurement of that pellet, and it is the largest
 * single assumption in anything built on this file. The alternative - a coefficient
 * invented for the pellet size at hand - would be worse, because it could not be checked
 * against anything published.
 */

import { dragFromTable, dragTableRange, type DragTable } from './drag-table';

// prettier-ignore
const SPHERE_TABLE: DragTable = [
  [0.0, 0.4662], [0.05, 0.4689], [0.1, 0.4717], [0.15, 0.4745], [0.2, 0.4772],
  [0.25, 0.48], [0.3, 0.4827], [0.35, 0.4852], [0.4, 0.4882], [0.45, 0.492],
  [0.5, 0.497], [0.55, 0.508], [0.6, 0.526], [0.65, 0.559], [0.7, 0.592],
  [0.75, 0.6258], [0.8, 0.661], [0.85, 0.6985], [0.9, 0.737], [0.95, 0.7757],
  [1.0, 0.814], [1.05, 0.8512], [1.1, 0.887], [1.15, 0.921], [1.2, 0.951],
  [1.25, 0.974], [1.3, 0.991], [1.35, 0.999], [1.4, 1.003], [1.45, 1.006],
  [1.5, 1.008], [1.55, 1.009], [1.6, 1.009], [1.65, 1.009], [1.7, 1.009],
  [1.75, 1.008], [1.8, 1.007], [1.85, 1.006], [1.9, 1.004], [1.95, 1.0025],
  [2.0, 1.001], [2.05, 0.999], [2.1, 0.997], [2.15, 0.9956], [2.2, 0.994],
  [2.25, 0.9916], [2.3, 0.989], [2.35, 0.9869], [2.4, 0.985], [2.45, 0.983],
  [2.5, 0.981], [2.55, 0.979], [2.6, 0.977], [2.65, 0.975], [2.7, 0.973],
  [2.75, 0.971], [2.8, 0.969], [2.85, 0.967], [2.9, 0.965], [2.95, 0.963],
  [3.0, 0.961], [3.05, 0.9589], [3.1, 0.957], [3.15, 0.9555], [3.2, 0.954],
  [3.25, 0.952], [3.3, 0.95], [3.35, 0.9485], [3.4, 0.947], [3.45, 0.945],
  [3.5, 0.943], [3.55, 0.9414], [3.6, 0.94], [3.65, 0.9385], [3.7, 0.937],
  [3.75, 0.9355], [3.8, 0.934], [3.85, 0.9325], [3.9, 0.931], [3.95, 0.9295],
  [4.0, 0.928],
];

/** The published table runs from Mach 0 to Mach 4. Outside that the end value is held. */
export const SPHERE_DRAG_TABLE_RANGE = dragTableRange(SPHERE_TABLE);

/** Drag coefficient of a sphere at a Mach number, referred to its frontal area. */
export function sphereDragCoefficient(mach: number): number {
  return dragFromTable(SPHERE_TABLE, mach);
}

/** Frontal area of a sphere, πd²/4, which is the area the coefficient above is referred to. */
export function sphereFrontalAreaM2(diameterMeters: number): number {
  if (!Number.isFinite(diameterMeters) || diameterMeters <= 0) return NaN;
  return (Math.PI * diameterMeters ** 2) / 4;
}

/**
 * Mass of a solid sphere, πd³/6 times the density of the material.
 *
 * Densities are properties of the material rather than figures from a firearms source, and
 * an alloy is not the pure metal: hardened lead shot carries antimony, and the tungsten
 * shot sold for waterfowl is a composite whose density depends on the maker. A tool using
 * this should let the density be entered rather than fix it.
 */
export function sphereMassKg(diameterMeters: number, densityKgPerM3: number): number {
  if (!Number.isFinite(diameterMeters) || diameterMeters <= 0) return NaN;
  if (!Number.isFinite(densityKgPerM3) || densityKgPerM3 <= 0) return NaN;
  return ((Math.PI * diameterMeters ** 3) / 6) * densityKgPerM3;
}
