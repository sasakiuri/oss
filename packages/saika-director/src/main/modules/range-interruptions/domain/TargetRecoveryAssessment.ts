export interface CreateTargetRecoveryAssessmentProps {
  id?: string;
  caseId: string;
  repairCompletedAt?: Date;
  movedToReserveFiringPoint: boolean;
  reserveFiringPointNumber?: number;
  statement: string;
  officialName: string;
  assessedAt?: Date;
}

/**
 * Append-only facts used to decide whether ISSF 6.10.9.2 applies.
 *
 * This is separate from the interruption entry stream: recording
 * equipment recovery never grants time and can be replaced by a later
 * assessment without rewriting earlier evidence.
 */
export class TargetRecoveryAssessment {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly repairCompletedAt: Date | null,
    readonly movedToReserveFiringPoint: boolean,
    readonly reserveFiringPointNumber: number | null,
    readonly statement: string,
    readonly officialName: string,
    readonly assessedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateTargetRecoveryAssessmentProps): TargetRecoveryAssessment {
    return new TargetRecoveryAssessment(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.repairCompletedAt ? validDate(props.repairCompletedAt, 'repairCompletedAt') : null,
      props.movedToReserveFiringPoint,
      validPositiveInteger(props.reserveFiringPointNumber, 'reserveFiringPointNumber'),
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      validDate(props.assessedAt ?? new Date(), 'assessedAt'),
    );
  }

  static reconstruct(props: {
    id: string;
    caseId: string;
    repairCompletedAt: Date | null;
    movedToReserveFiringPoint: boolean;
    reserveFiringPointNumber: number | null;
    statement: string;
    officialName: string;
    assessedAt: Date;
  }): TargetRecoveryAssessment {
    return new TargetRecoveryAssessment(
      requiredText(props.id, 'id'),
      requiredText(props.caseId, 'caseId'),
      props.repairCompletedAt ? validDate(props.repairCompletedAt, 'repairCompletedAt') : null,
      props.movedToReserveFiringPoint,
      validPositiveInteger(props.reserveFiringPointNumber ?? undefined, 'reserveFiringPointNumber'),
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      validDate(props.assessedAt, 'assessedAt'),
    );
  }
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}

function validPositiveInteger(value: number | undefined, name: string): number | null {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be positive`);
  return value;
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}
