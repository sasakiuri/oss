// SPDX-License-Identifier: MIT
import type { Discipline } from '@/shared/ipc/contracts';

/** Per-discipline bullet radius (mm) -- conforms to TARGET_SPEC.md */
export const SHOT_RADIUS_BY_DISCIPLINE: Record<Discipline, number> = {
  BEAM_RIFLE_10M: 3.0, // Beam diameter 6.0mm
  BEAM_PISTOL_10M: 2.25, // Virtual projectile diameter 4.5mm
  AIR_RIFLE_10M: 2.25, // Bullet diameter 4.5mm
  AIR_PISTOL_10M: 2.25, // Bullet diameter 4.5mm
  RIFLE_50M: 2.8, // Bullet diameter 5.6mm
  PISTOL_25M: 4.5, // Bullet diameter 9.0mm
} as const;
