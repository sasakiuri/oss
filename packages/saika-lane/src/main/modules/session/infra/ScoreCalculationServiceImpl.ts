// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { ScoreCalculationService } from '@/main/modules/session/domain/ScoreCalculationService';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';

/**
 * ScoreCalculationServiceImpl (score calculation service implementation)
 *
 * Implementation class of the domain service that calculates scores from impact points.
 * Uses different target designs per discipline to calculate accurate scores.
 * Caches target designs to improve performance.
 */
export class ScoreCalculationServiceImpl implements ScoreCalculationService {
  /**
   * Target design cache
   * Key: Discipline.value (discipline string value)
   * Value: TargetDesign instance
   */
  private readonly targetDesignCache: Map<string, TargetDesign>;

  /**
   * Constructor
   *
   * Initializes the target design cache.
   */
  constructor() {
    this.targetDesignCache = new Map();
  }

  /**
   * Calculates a score from an impact point
   *
   * Retrieves the target design for the discipline and calculates the score from the impact point.
   * Target designs are cached, so subsequent calls for the same discipline are faster.
   *
   * @param impactPoint - Impact point coordinates
   * @param discipline - Discipline
   * @returns Calculated score
   *
   * @example
   * ```typescript
   * const service = new ScoreCalculationServiceImpl();
   * const impactPoint = new ImpactPoint(0, 0);
   * const discipline = Discipline.airRifle10m();
   * const score = service.calculateScore(impactPoint, discipline);
   * console.log(score.value); // 109
   * ```
   */
  calculateScore(impactPoint: ImpactPoint, discipline: Discipline): Score {
    const targetDesign = this.getTargetDesign(discipline);
    return targetDesign.calculateScore(impactPoint);
  }

  /**
   * Determines whether an impact point is within the X ring (inner ten)
   *
   * @param impactPoint - Impact point (returns false as a miss shot if null)
   * @param discipline - Discipline
   * @returns true if within the X ring, false otherwise
   */
  isInnerTen(impactPoint: ImpactPoint | null, discipline: Discipline): boolean {
    const targetDesign = this.getTargetDesign(discipline);
    return targetDesign.isInnerTen(impactPoint);
  }

  /**
   * Retrieves the target design for the given discipline
   *
   * Retrieves the target design for the discipline from the cache.
   * If not in the cache, creates a new one and saves it to the cache.
   *
   * The cache key uses the discipline string value (discipline.value).
   * This allows the cache to work even with different Discipline instances for the same discipline.
   *
   * @param discipline - Discipline
   * @returns Target design corresponding to the discipline
   *
   * @example
   * ```typescript
   * const service = new ScoreCalculationServiceImpl();
   * const discipline = Discipline.airRifle10m();
   * const targetDesign = service.getTargetDesign(discipline);
   * console.log(targetDesign.rings.length); // 97
   * ```
   */
  getTargetDesign(discipline: Discipline): TargetDesign {
    const cacheKey = discipline.value;

    // Try to retrieve from cache
    const cachedDesign = this.targetDesignCache.get(cacheKey);
    if (cachedDesign !== undefined) {
      return cachedDesign;
    }

    // Not in cache; create a new one
    const targetDesign = TargetDesign.forDiscipline(discipline);

    // Save to cache
    this.targetDesignCache.set(cacheKey, targetDesign);

    return targetDesign;
  }
}
