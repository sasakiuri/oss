// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * Target entity - aggregate root
 *
 * An entity representing a target used in shooting. It has a discipline, target design, and lane number.
 * Entity identity is determined by ID.
 */
export class Target {
  /**
   * Unique identifier (UUID)
   */
  readonly id: string;

  /**
   * Discipline
   */
  readonly discipline: Discipline;

  /**
   * Target design
   */
  readonly design: TargetDesign;

  /**
   * Lane number (1 to N)
   */
  readonly laneNumber: number;

  /**
   * Private constructor.
   * Prevents direct instantiation from outside and enforces creation via static factory methods.
   *
   * @param id - Unique identifier
   * @param discipline - Discipline
   * @param design - Target design
   * @param laneNumber - Lane number
   */
  private constructor(id: string, discipline: Discipline, design: TargetDesign, laneNumber: number) {
    this.id = id;
    this.discipline = discipline;
    this.design = design;
    this.laneNumber = laneNumber;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Creates a new Target (static factory method).
   *
   * @param props - Target properties
   * @returns New Target instance
   * @throws {Error} If an invariant is violated
   */
  static create(props: { discipline: Discipline; laneNumber: number }): Target {
    // Invariant: laneNumber must be an integer of 1 or greater
    if (props.laneNumber < 1) {
      throw ErrorCatalog.createError('INVALID_TARGET', { detail: 'laneNumber must be an integer of 1 or greater' });
    }
    if (!Number.isInteger(props.laneNumber)) {
      throw ErrorCatalog.createError('INVALID_TARGET', { detail: 'laneNumber must be an integer' });
    }

    // Auto-generate ID (UUID v4)
    const id = crypto.randomUUID();

    // Auto-generate target design based on discipline
    const design = TargetDesign.forDiscipline(props.discipline);

    // Invariant: design must match the discipline
    if (!design.discipline.equals(props.discipline)) {
      throw ErrorCatalog.createError('INVALID_TARGET', { detail: 'design must match the discipline' });
    }

    return new Target(id, props.discipline, design, props.laneNumber);
  }

  /**
   * Checks equality with another Target (determined by ID).
   *
   * @param other - Target to compare against
   * @returns true if IDs are equal, false otherwise
   */
  equals(other: Target): boolean {
    return this.id === other.id;
  }

  /**
   * Calculates score from an impact point (delegates to design).
   *
   * @param impactPoint - Impact point
   * @returns Calculated score (Score)
   */
  calculateScore(impactPoint: ImpactPoint): Score {
    return this.design.calculateScore(impactPoint);
  }
}
