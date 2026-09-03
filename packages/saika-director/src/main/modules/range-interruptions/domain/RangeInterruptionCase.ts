import {
  createQualificationTimedTargetInterruptionContext,
  type QualificationTimedTargetInterruptionContext,
} from './QualificationTimedTargetInterruptionContext';

export const RANGE_INTERRUPTION_CAUSES = [
  'ATHLETE_NON_FAULT',
  'ALL_TARGET_FAILURE',
  'SINGLE_TARGET_FAILURE',
  'FIRING_POINT_MOVE',
  'OTHER',
] as const;

export const RANGE_INTERRUPTION_PHASES = ['SIGHTING', 'MATCH'] as const;

export type RangeInterruptionCause = (typeof RANGE_INTERRUPTION_CAUSES)[number];
export type RangeInterruptionPhase = (typeof RANGE_INTERRUPTION_PHASES)[number];

export interface CreateRangeInterruptionCaseProps {
  id?: string;
  cause: RangeInterruptionCause;
  phase: RangeInterruptionPhase;
  startedAt: Date;
  remainingSecondsAtStart: number;
  laneId?: string;
  firingPointNumber?: number;
  athleteName?: string;
  summary: string;
  details: string;
  openedBy: string;
  qualificationTimedTargetContext?: QualificationTimedTargetInterruptionContext;
  createdAt?: Date;
}

/** Immutable facts captured at the start of an ISSF range interruption. */
export class RangeInterruptionCase {
  private constructor(
    readonly id: string,
    readonly cause: RangeInterruptionCause,
    readonly phase: RangeInterruptionPhase,
    readonly startedAt: Date,
    readonly remainingSecondsAtStart: number,
    readonly laneId: string | null,
    readonly firingPointNumber: number | null,
    readonly athleteName: string | null,
    readonly summary: string,
    readonly details: string,
    readonly openedBy: string,
    readonly qualificationTimedTargetContext: QualificationTimedTargetInterruptionContext | null,
    readonly createdAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateRangeInterruptionCaseProps): RangeInterruptionCase {
    validateCause(props.cause);
    validatePhase(props.phase);
    validNonNegativeInteger(props.remainingSecondsAtStart, 'remainingSecondsAtStart');
    validPositiveInteger(props.firingPointNumber, 'firingPointNumber');

    return new RangeInterruptionCase(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      props.cause,
      props.phase,
      validDate(props.startedAt, 'startedAt'),
      props.remainingSecondsAtStart,
      normalizeOptional(props.laneId),
      props.firingPointNumber ?? null,
      normalizeOptional(props.athleteName),
      requiredText(props.summary, 'summary'),
      requiredText(props.details, 'details'),
      requiredText(props.openedBy, 'openedBy'),
      props.qualificationTimedTargetContext
        ? createQualificationTimedTargetInterruptionContext(props.qualificationTimedTargetContext)
        : null,
      validDate(props.createdAt ?? new Date(), 'createdAt'),
    );
  }

  static reconstruct(props: {
    id: string;
    cause: RangeInterruptionCause;
    phase: RangeInterruptionPhase;
    startedAt: Date;
    remainingSecondsAtStart: number;
    laneId: string | null;
    firingPointNumber: number | null;
    athleteName: string | null;
    summary: string;
    details: string;
    openedBy: string;
    qualificationTimedTargetContext: QualificationTimedTargetInterruptionContext | null;
    createdAt: Date;
  }): RangeInterruptionCase {
    validateCause(props.cause);
    validatePhase(props.phase);
    validNonNegativeInteger(props.remainingSecondsAtStart, 'remainingSecondsAtStart');
    return new RangeInterruptionCase(
      requiredText(props.id, 'id'),
      props.cause,
      props.phase,
      validDate(props.startedAt, 'startedAt'),
      props.remainingSecondsAtStart,
      props.laneId,
      props.firingPointNumber,
      props.athleteName,
      props.summary,
      props.details,
      props.openedBy,
      props.qualificationTimedTargetContext
        ? createQualificationTimedTargetInterruptionContext(props.qualificationTimedTargetContext)
        : null,
      validDate(props.createdAt, 'createdAt'),
    );
  }
}

function validateCause(value: RangeInterruptionCause): void {
  if (!RANGE_INTERRUPTION_CAUSES.includes(value)) throw new Error('cause is invalid');
}

function validatePhase(value: RangeInterruptionPhase): void {
  if (!RANGE_INTERRUPTION_PHASES.includes(value)) throw new Error('phase is invalid');
}

function validPositiveInteger(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) throw new Error(`${name} must be positive`);
}

function validNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be non-negative`);
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
