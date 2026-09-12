// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { ScoreCalculationService } from '@/main/modules/session/domain/ScoreCalculationService';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import {
  DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE,
  getTargetScoringProfile,
  type ScoringGaugeProfileId,
  type TargetScoringProfileId,
} from '@/shared/target';

/** Caches target designs for coordinate scoring. */
export class ScoreCalculationServiceImpl implements ScoreCalculationService {
  private readonly targetDesignCache: Map<string, TargetDesign>;

  constructor() {
    this.targetDesignCache = new Map();
  }

  calculateScore(
    impactPoint: ImpactPoint,
    discipline: Discipline,
    profileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
  ): Score {
    const targetDesign = this.getTargetDesign(discipline, profileId, scoringGaugeProfileId);
    return targetDesign.calculateScore(impactPoint);
  }

  isInnerTen(
    impactPoint: ImpactPoint | null,
    discipline: Discipline,
    profileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
  ): boolean {
    const targetDesign = this.getTargetDesign(discipline, profileId, scoringGaugeProfileId);
    return targetDesign.isInnerTen(impactPoint);
  }

  getTargetDesign(
    discipline: Discipline,
    profileId?: TargetScoringProfileId,
    scoringGaugeProfileId?: ScoringGaugeProfileId,
  ): TargetDesign {
    const effectiveProfileId = profileId ?? DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE[discipline.value];
    const effectiveGaugeId =
      scoringGaugeProfileId ?? getTargetScoringProfile(effectiveProfileId).defaultScoringGaugeProfileId;
    const cacheKey = `${discipline.value}:${effectiveProfileId}:${effectiveGaugeId}`;

    const cachedDesign = this.targetDesignCache.get(cacheKey);
    if (cachedDesign !== undefined) {
      return cachedDesign;
    }

    const targetDesign = TargetDesign.forDiscipline(discipline, effectiveProfileId, effectiveGaugeId);

    this.targetDesignCache.set(cacheKey, targetDesign);

    return targetDesign;
  }
}
