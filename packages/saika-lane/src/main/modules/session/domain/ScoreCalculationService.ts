// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import type { ScoringGaugeProfileId, TargetScoringProfileId } from '@/shared/target';

/** Calculates coordinate scores using the selected target face and scoring gauge. */
export interface ScoreCalculationService {
  calculateScore(
    impactPoint: ImpactPoint,
    discipline: Discipline,
    profileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
  ): Score;

  /** Tests the impact centre against the target's inner-ten radius. Null returns false. */
  isInnerTen(
    impactPoint: ImpactPoint | null,
    discipline: Discipline,
    profileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
  ): boolean;

  getTargetDesign(
    discipline: Discipline,
    profileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
  ): TargetDesign;
}
