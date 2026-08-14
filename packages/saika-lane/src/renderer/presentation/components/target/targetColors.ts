// SPDX-License-Identifier: MIT
import type { Discipline } from '@/shared/ipc/contracts';

/** Zone color scheme */
export type ZoneColors = {
  readonly fill: string;
  readonly stroke: string;
  readonly labelText: string;
};

/** 10-point ring color scheme */
export type InnerTenColors = {
  readonly fill: string;
  readonly stroke: string;
};

/** Target color palette (common across all disciplines) */
export type TargetColorPalette = {
  readonly outerRings: ZoneColors;
  readonly innerRings: ZoneColors;
  readonly innerTen: InnerTenColors;
};

/** Per-discipline zone configuration */
export type TargetZoneConfig = {
  readonly innerZoneStartScore: 4 | 7;
  readonly maxLabelScore: 8;
  readonly colors: TargetColorPalette;
};

/** Color palette common to all disciplines */
const DEFAULT_COLORS: TargetColorPalette = {
  outerRings: { fill: '#E0E0E0', stroke: '#2D2D2D', labelText: '#2D2D2D' },
  innerRings: { fill: '#02C38D', stroke: '#FFFFFF', labelText: '#FFFFFF' },
  innerTen: { fill: '#FFFFFF', stroke: '#FFFFFF' },
};

/** Per-discipline zone configuration map */
const TARGET_ZONE_CONFIG: Record<Discipline, TargetZoneConfig> = {
  BEAM_RIFLE_10M: { innerZoneStartScore: 4, maxLabelScore: 8, colors: DEFAULT_COLORS },
  AIR_RIFLE_10M: { innerZoneStartScore: 4, maxLabelScore: 8, colors: DEFAULT_COLORS },
  AIR_PISTOL_10M: { innerZoneStartScore: 7, maxLabelScore: 8, colors: DEFAULT_COLORS },
  BEAM_PISTOL_10M: { innerZoneStartScore: 7, maxLabelScore: 8, colors: DEFAULT_COLORS },
  RIFLE_50M: { innerZoneStartScore: 4, maxLabelScore: 8, colors: DEFAULT_COLORS },
  PISTOL_25M: { innerZoneStartScore: 7, maxLabelScore: 8, colors: DEFAULT_COLORS },
};

/**
 * Get zone configuration for a given discipline
 *
 * @param discipline - Shooting discipline
 * @returns Zone configuration
 */
export function getTargetZoneConfig(discipline: Discipline): TargetZoneConfig {
  return TARGET_ZONE_CONFIG[discipline];
}
