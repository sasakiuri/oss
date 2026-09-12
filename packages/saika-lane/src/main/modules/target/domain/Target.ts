// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Target identity, scoring design, and Lane assignment. */
export class Target {
  /** UUID. */
  readonly id: string;

  readonly discipline: Discipline;

  readonly design: TargetDesign;

  /**
   * Lane number (1 to N)
   */
  readonly laneNumber: number;

  private constructor(id: string, discipline: Discipline, design: TargetDesign, laneNumber: number) {
    this.id = id;
    this.discipline = discipline;
    this.design = design;
    this.laneNumber = laneNumber;

    Object.freeze(this);
  }

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

  /** Compares target IDs. */
  equals(other: Target): boolean {
    return this.id === other.id;
  }

  calculateScore(impactPoint: ImpactPoint): Score {
    return this.design.calculateScore(impactPoint);
  }
}
