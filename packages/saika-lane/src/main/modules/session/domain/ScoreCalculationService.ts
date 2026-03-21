// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';

/**
 * ScoreCalculationService interface
 *
 * Interface for the domain service that calculates scores from impact points.
 * Uses different target designs per discipline to calculate accurate scores.
 */
export interface ScoreCalculationService {
  /**
   * Calculates a score from an impact point
   *
   * @param impactPoint - Impact point coordinates
   * @param discipline - Discipline
   * @returns Calculated score
   */
  calculateScore(impactPoint: ImpactPoint, discipline: Discipline): Score;

  /**
   * Determines whether an impact point is within the X ring (inner ten)
   *
   * Inner ten determination is based on physical geometry:
   * distance from bullet hole center to target center <= xRingRadius
   *
   * @param impactPoint - Impact point (returns false as a miss shot if null)
   * @param discipline - Discipline
   * @returns true if within the X ring, false otherwise
   */
  isInnerTen(impactPoint: ImpactPoint | null, discipline: Discipline): boolean;

  /**
   * Retrieves the target design for the given discipline
   *
   * @param discipline - Discipline
   * @returns Target design corresponding to the discipline
   */
  getTargetDesign(discipline: Discipline): TargetDesign;
}
