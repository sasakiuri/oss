// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import type { Discipline as DisciplineCode } from '@/shared/ipc/schemas/common';
import {
  DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE,
  TARGET_SCORING_PROFILES,
  getDefaultTargetScoringProfile,
  getTargetScoringProfile,
  type TargetScoringProfile,
  type TargetScoringProfileId,
} from '@/shared/target';

/**
 * RingDefinition type
 *
 * Type defining a target ring (score band).
 */
export interface RingDefinition {
  /**
   * Score (×10 integer: 109, 108, ... 10, 0)
   */
  score: number;

  /**
   * Ring radius (in mm)
   */
  radius: number;

  /**
   * Squared ring radius (in mm²) — for distance² comparison
   */
  radiusSq: number;
}

/**
 * TargetDesign value object
 *
 * An immutable value object representing the target design for each shooting discipline.
 * Holds ring definitions for calculating scores from impact points.
 *
 * Algorithmically generates ring definitions based on the formula in TARGET_SPEC.md:
 *   band width = (N-1)-point ring radius - N-point ring radius
 *   step = band width / 10
 *   radius of N.k = N-point ring radius + (9 - k) * step
 *
 * Score is represented as a ×10 integer; distance comparison is done using distance².
 */
export class TargetDesign {
  /** Backward-compatible default projectile radius lookup, derived from the profile registry. */
  static readonly SHOT_RADIUS: Readonly<Record<DisciplineCode, number>> = Object.freeze(
    Object.fromEntries(
      Object.entries(DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE).map(([discipline, profileId]) => [
        discipline,
        TARGET_SCORING_PROFILES[profileId].projectileRadiusMm,
      ]),
    ) as Record<DisciplineCode, number>,
  );

  /**
   * Discipline (read-only)
   */
  readonly discipline: Discipline;

  /** Target-face and gauge profile used to build this design. */
  readonly profileId: TargetScoringProfileId;

  /**
   * Array of ring definitions (read-only)
   * Sorted in ascending order of radius
   */
  readonly rings: readonly RingDefinition[];

  /**
   * X ring (inner ten) radius (from bullet-hole center to target center, in mm)
   */
  readonly xRingRadius: number;

  /**
   * Squared X ring radius (for distance² comparison)
   */
  readonly xRingRadiusSq: number;

  /**
   * Private constructor.
   * Prevents direct instantiation from outside and enforces creation via static factory methods.
   *
   * @param discipline - Discipline
   * @param rings - Array of ring definitions
   * @param xRingRadius - X ring radius (mm)
   * @throws {Error} If an invariant is violated
   */
  private constructor(
    discipline: Discipline,
    profileId: TargetScoringProfileId,
    rings: readonly RingDefinition[],
    xRingRadius: number,
  ) {
    if (rings.length === 0) {
      throw ErrorCatalog.createError('INVALID_TARGET_DESIGN', { detail: 'Target design must have at least one ring' });
    }

    // Invariant check: rings are sorted in ascending order of radius
    for (let i = 1; i < rings.length; i++) {
      const currentRing = rings[i];
      const prevRing = rings[i - 1];
      if (!currentRing || !prevRing || currentRing.radius <= prevRing.radius) {
        throw ErrorCatalog.createError('INVALID_TARGET_DESIGN', {
          detail: 'Rings must be sorted by radius in ascending order',
        });
      }
    }

    this.discipline = discipline;
    this.profileId = profileId;
    // Freeze each ring definition, then freeze the entire array
    this.rings = Object.freeze(rings.map((ring) => Object.freeze({ ...ring })));
    this.xRingRadius = xRingRadius;
    this.xRingRadiusSq = xRingRadius * xRingRadius;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Calculates score from an impact point (distance² comparison).
   *
   * @param impactPoint - Impact point
   * @returns Calculated score (Score, ×10 integer)
   */
  calculateScore(impactPoint: ImpactPoint): Score {
    const distSq = impactPoint.distanceSquared();

    // Search rings in ascending order of radius (descending score order)
    for (const ring of this.rings) {
      if (distSq <= ring.radiusSq) {
        return new Score(ring.score);
      }
    }

    // Outside all rings is a miss (0 points)
    return Score.miss();
  }

  /**
   * Determines whether an impact point is within the X ring (inner ten) (distance² comparison).
   *
   * X ring determination is based on physical geometry:
   * distance² from bullet-hole center to target center <= xRingRadius²
   *
   * @param impactPoint - Impact point (if null, returns false as a miss shot)
   * @returns true if within the X ring, false otherwise
   */
  isInnerTen(impactPoint: ImpactPoint | null): boolean {
    if (impactPoint === null) return false;
    return impactPoint.distanceSquared() <= this.xRingRadiusSq;
  }

  /**
   * Checks equality with another TargetDesign.
   *
   * @param other - TargetDesign to compare against
   * @returns true if equal, false otherwise
   */
  equals(other: TargetDesign): boolean {
    if (!this.discipline.equals(other.discipline) || this.profileId !== other.profileId) {
      return false;
    }
    if (this.rings.length !== other.rings.length) {
      return false;
    }
    return this.rings.every((ring, index) => {
      const otherRing = other.rings[index];
      return otherRing !== undefined && ring.score === otherRing.score && ring.radius === otherRing.radius;
    });
  }

  /**
   * Creates a target design based on the discipline (static factory method).
   *
   * @param discipline - Discipline
   * @returns TargetDesign instance for the given discipline
   */
  static forDiscipline(discipline: Discipline, profileId?: TargetScoringProfileId): TargetDesign {
    const profile = profileId ? getTargetScoringProfile(profileId) : getDefaultTargetScoringProfile(discipline.value);
    if (profile.discipline !== discipline.value) {
      throw ErrorCatalog.createError('INVALID_TARGET_DESIGN', {
        detail: `Target profile ${profile.id} is for ${profile.discipline}, not ${discipline.value}`,
      });
    }
    return this.fromProfile(discipline, profile);
  }

  /** Creates a design directly from a target-face profile. */
  static forProfile(profileId: TargetScoringProfileId): TargetDesign {
    const profile = getTargetScoringProfile(profileId);
    return this.fromProfile(Discipline.fromValue(profile.discipline), profile);
  }

  private static fromProfile(discipline: Discipline, profile: TargetScoringProfile): TargetDesign {
    const rings =
      profile.granularity === 'DECIMAL' ? this.generateDecimalRings(profile) : this.generateIntegerRings(profile);
    return new TargetDesign(discipline, profile.id, rings, profile.innerTenCenterRadiusMm);
  }

  /**
   * Generates decimal ring definitions based on the formula in TARGET_SPEC.md (with shotRadius incorporated).
   *
   * Each band's innerEdge/outerEdge is calculated as the inner-edge radius of the integer score ring + shotRadius,
   * and the range is divided into 10 equal parts to assign decimal scores.
   * Scores are ×10 integers (109, 108, ... 10).
   *
   * @param profile - Target scoring profile
   * @returns 100 ring definitions (109 to 10)
   */
  private static generateDecimalRings(profile: TargetScoringProfile): RingDefinition[] {
    const ringLines = profile.ringLines;
    const shotRadius = profile.projectileRadiusMm;
    const rings: RingDefinition[] = [];

    for (let band = 0; band < ringLines.length; band++) {
      const ringLine = ringLines[band]!;
      const integerScore = ringLine.score;

      // innerEdge: for band 0, starts from center (0); for others, uses the previous band's outer edge
      const innerEdge = band === 0 ? 0 : ringLines[band - 1]!.radiusMm + shotRadius;
      // outerEdge: inner-edge of this band's integer ring + shotRadius
      const outerEdge = ringLine.radiusMm + shotRadius;

      const step = (outerEdge - innerEdge) / 10;

      for (let k = 9; k >= 0; k--) {
        const score = integerScore * 10 + k; // 109, 108, ..., 100, 99, ..., 10
        const radius = Math.round((innerEdge + (10 - k) * step) * 10000) / 10000;
        const radiusSq = radius * radius;
        rings.push({ score, radius, radiusSq });
      }
    }

    return rings;
  }

  private static generateIntegerRings(profile: TargetScoringProfile): RingDefinition[] {
    return profile.ringLines.map((ringLine) => {
      const radius = ringLine.radiusMm + profile.projectileRadiusMm;
      return { score: ringLine.score * 10, radius, radiusSq: radius * radius };
    });
  }
}
