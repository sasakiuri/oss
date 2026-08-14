// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

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
 * DisciplineRingSpec interface
 *
 * Inner-edge radius definitions for integer score rings based on TARGET_SPEC.md.
 * ringInnerEdgeRadii is an array of 10 elements: [10-point ring, 9-point ring, ..., 1-point ring].
 * xRingRadius is the radius of the X ring (inner ten) from the bullet-hole center to the target center, in mm.
 */
interface DisciplineRingSpec {
  ringInnerEdgeRadii: readonly number[]; // [10-point ring, 9-point ring, ..., 1-point ring] = 10 elements
  xRingRadius: number; // X ring radius (from bullet-hole center to target center, in mm)
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
  /** Bullet radius per discipline (mm) — per TARGET_SPEC.md */
  static readonly SHOT_RADIUS: Record<string, number> = {
    BEAM_RIFLE_10M: 3.0, // Beam diameter 6.0mm
    BEAM_PISTOL_10M: 2.25, // Virtual projectile diameter 4.5mm
    AIR_RIFLE_10M: 2.25, // Bullet diameter 4.5mm
    AIR_PISTOL_10M: 2.25, // Bullet diameter 4.5mm
    RIFLE_50M: 2.8, // Bullet diameter 5.6mm
    PISTOL_25M: 4.5, // Bullet diameter 9.0mm
  };

  // --- Ring specifications per discipline (per TARGET_SPEC.md) ---

  private static readonly BEAM_RIFLE_SPEC: DisciplineRingSpec = {
    ringInnerEdgeRadii: [0.5, 3.0, 5.5, 8.0, 10.5, 13.0, 15.5, 18.0, 20.5, 23.0],
    xRingRadius: 2.25, // X ring radius for BEAM_RIFLE_10M (mm)
  };

  private static readonly AIR_RIFLE_SPEC: DisciplineRingSpec = {
    ringInnerEdgeRadii: [0.25, 2.75, 5.25, 7.75, 10.25, 12.75, 15.25, 17.75, 20.25, 22.75],
    xRingRadius: 2.0, // X ring radius for AIR_RIFLE_10M (mm)
  };

  private static readonly AIR_PISTOL_SPEC: DisciplineRingSpec = {
    ringInnerEdgeRadii: [5.75, 13.75, 21.75, 29.75, 37.75, 45.75, 53.75, 61.75, 69.75, 77.75],
    xRingRadius: 5.0, // X ring radius for AIR_PISTOL_10M (mm)
  };

  private static readonly RIFLE_50M_SPEC: DisciplineRingSpec = {
    ringInnerEdgeRadii: [5.2, 13.2, 21.2, 29.2, 37.2, 45.2, 53.2, 61.2, 69.2, 77.2],
    xRingRadius: 5.0, // X ring radius for RIFLE_50M (mm)
  };

  /**
   * Discipline (read-only)
   */
  readonly discipline: Discipline;

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
  private constructor(discipline: Discipline, rings: readonly RingDefinition[], xRingRadius: number) {
    // Invariant check: at least 10 rings
    if (rings.length < 10) {
      throw ErrorCatalog.createError('INVALID_TARGET_DESIGN', { detail: 'Target design must have at least 10 rings' });
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
    if (!this.discipline.equals(other.discipline)) {
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
  static forDiscipline(discipline: Discipline): TargetDesign {
    const shotRadius = this.SHOT_RADIUS[discipline.value] ?? 0;
    const { rings, xRingRadius } = this.createRingsForDiscipline(discipline, shotRadius);
    return new TargetDesign(discipline, rings, xRingRadius);
  }

  /**
   * Generates decimal ring definitions based on the formula in TARGET_SPEC.md (with shotRadius incorporated).
   *
   * Each band's innerEdge/outerEdge is calculated as the inner-edge radius of the integer score ring + shotRadius,
   * and the range is divided into 10 equal parts to assign decimal scores.
   * Scores are ×10 integers (109, 108, ... 10).
   *
   * @param spec - Discipline ring specification
   * @param shotRadius - Bullet radius (in mm)
   * @returns 100 ring definitions (109 to 10)
   */
  private static generateDecimalRings(spec: DisciplineRingSpec, shotRadius: number): RingDefinition[] {
    const radii = spec.ringInnerEdgeRadii;
    const rings: RingDefinition[] = [];

    for (let band = 0; band < radii.length; band++) {
      const integerScore = 10 - band; // 10, 9, 8, ..., 1

      // innerEdge: for band 0, starts from center (0); for others, uses the previous band's outer edge
      const innerEdge = band === 0 ? 0 : radii[band - 1]! + shotRadius;
      // outerEdge: inner-edge of this band's integer ring + shotRadius
      const outerEdge = radii[band]! + shotRadius;

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

  /**
   * Generates ring definitions and X ring radius for the given discipline (private helper method).
   *
   * @param discipline - Discipline
   * @param shotRadius - Bullet radius (in mm)
   * @returns Array of ring definitions and X ring radius
   */
  private static createRingsForDiscipline(
    discipline: Discipline,
    shotRadius: number,
  ): { rings: RingDefinition[]; xRingRadius: number } {
    const disciplineValue = discipline.value;

    if (disciplineValue === 'AIR_RIFLE_10M') {
      return {
        rings: this.generateDecimalRings(this.AIR_RIFLE_SPEC, shotRadius),
        xRingRadius: this.AIR_RIFLE_SPEC.xRingRadius,
      };
    }

    if (disciplineValue === 'AIR_PISTOL_10M' || disciplineValue === 'BEAM_PISTOL_10M') {
      return {
        rings: this.generateDecimalRings(this.AIR_PISTOL_SPEC, shotRadius),
        xRingRadius: this.AIR_PISTOL_SPEC.xRingRadius,
      };
    }

    if (disciplineValue === 'RIFLE_50M') {
      return {
        rings: this.generateDecimalRings(this.RIFLE_50M_SPEC, shotRadius),
        xRingRadius: this.RIFLE_50M_SPEC.xRingRadius,
      };
    }

    // 25m pistol (not defined in TARGET_SPEC, so integers only are maintained, with shotRadius incorporated)
    // Scores are represented as ×10 integers
    if (disciplineValue === 'PISTOL_25M') {
      const pistolRings: RingDefinition[] = [
        { score: 100, radius: 29.5, radiusSq: 29.5 * 29.5 }, // 25.0 + 4.5
        { score: 100, radius: 54.5, radiusSq: 54.5 * 54.5 }, // 50.0 + 4.5
        { score: 90, radius: 104.5, radiusSq: 104.5 * 104.5 }, // 100.0 + 4.5
        { score: 80, radius: 144.5, radiusSq: 144.5 * 144.5 }, // 140.0 + 4.5
        { score: 70, radius: 184.5, radiusSq: 184.5 * 184.5 }, // 180.0 + 4.5
        { score: 60, radius: 224.5, radiusSq: 224.5 * 224.5 }, // 220.0 + 4.5
        { score: 50, radius: 254.5, radiusSq: 254.5 * 254.5 }, // 250.0 + 4.5
        { score: 40, radius: 284.5, radiusSq: 284.5 * 284.5 }, // 280.0 + 4.5
        { score: 30, radius: 314.5, radiusSq: 314.5 * 314.5 }, // 310.0 + 4.5
        { score: 20, radius: 344.5, radiusSq: 344.5 * 344.5 }, // 340.0 + 4.5
        { score: 10, radius: 374.5, radiusSq: 374.5 * 374.5 }, // 370.0 + 4.5
      ];
      return {
        rings: pistolRings,
        xRingRadius: 5.0, // X ring radius for PISTOL_25M (mm)
      };
    }

    if (disciplineValue === 'BEAM_RIFLE_10M') {
      return {
        rings: this.generateDecimalRings(this.BEAM_RIFLE_SPEC, shotRadius),
        xRingRadius: this.BEAM_RIFLE_SPEC.xRingRadius,
      };
    }

    // Unknown discipline: throw error
    throw ErrorCatalog.createError('UNKNOWN_DISCIPLINE', { detail: `Unknown discipline: ${disciplineValue}` });
  }
}
