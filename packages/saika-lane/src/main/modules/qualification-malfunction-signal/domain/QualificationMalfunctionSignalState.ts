// SPDX-License-Identifier: MIT

export type QualificationMalfunctionSignalStatus = 'ACTIVE' | 'CLEARED';
export type QualificationMalfunctionSignalPhase = 'SIGHTING' | 'MATCH';

export interface QualificationMalfunctionSignalContext {
  readonly competitionId: string;
  readonly sessionId: string;
  readonly participantId: string;
  readonly participantName: string;
  readonly startNumber: string | null;
  readonly phase: QualificationMalfunctionSignalPhase;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly seriesShotLimit: number | null;
  readonly recordedShots: number;
  readonly timedTargetProgramId: string | null;
  readonly exposureIndex: number | null;
}

export interface QualificationMalfunctionSignalStateProps {
  readonly signalId: string;
  readonly status: QualificationMalfunctionSignalStatus;
  readonly context: QualificationMalfunctionSignalContext;
  readonly message?: string | null;
  readonly signalledAt: Date;
  readonly clearedAt?: Date | null;
  readonly clearedBy?: string | null;
}

/**
 * Lane-owned declaration that a possible firearm malfunction needs official attention.
 *
 * This state records only what the Lane observed when the athlete signalled. It does
 * not classify the malfunction, award a claim, stop firing, or change a timer.
 */
export class QualificationMalfunctionSignalState {
  private constructor(
    readonly signalId: string,
    readonly status: QualificationMalfunctionSignalStatus,
    readonly context: QualificationMalfunctionSignalContext,
    readonly message: string | null,
    readonly signalledAt: Date,
    readonly clearedAt: Date | null,
    readonly clearedBy: string | null,
  ) {
    Object.freeze(this);
  }

  static signal(input: {
    signalId?: string;
    context: QualificationMalfunctionSignalContext;
    message?: string | null;
    signalledAt?: Date;
  }): QualificationMalfunctionSignalState {
    return QualificationMalfunctionSignalState.create({
      signalId: input.signalId ?? crypto.randomUUID(),
      status: 'ACTIVE',
      context: input.context,
      message: input.message,
      signalledAt: input.signalledAt ?? new Date(),
    });
  }

  static create(props: QualificationMalfunctionSignalStateProps): QualificationMalfunctionSignalState {
    const context = copyContext(props.context);
    const signalledAt = validDate(props.signalledAt, 'signalledAt');
    const clearedAt = props.clearedAt ? validDate(props.clearedAt, 'clearedAt') : null;
    const clearedBy = optionalText(props.clearedBy);

    if (props.status === 'ACTIVE' && (clearedAt || clearedBy)) {
      throw new Error('An active qualification malfunction signal cannot contain clearance data');
    }
    if (props.status === 'CLEARED' && (!clearedAt || !clearedBy)) {
      throw new Error('A cleared qualification malfunction signal requires clearedAt and clearedBy');
    }
    if (clearedAt && clearedAt < signalledAt) {
      throw new Error('clearedAt cannot precede signalledAt');
    }

    const message = optionalText(props.message);
    if (message && message.length > 500) throw new Error('message must be at most 500 characters');

    return new QualificationMalfunctionSignalState(
      requiredText(props.signalId, 'signalId'),
      props.status,
      context,
      message,
      signalledAt,
      clearedAt,
      clearedBy,
    );
  }

  clear(clearedBy: string, clearedAt = new Date()): QualificationMalfunctionSignalState {
    if (this.status !== 'ACTIVE') throw new Error('No active qualification malfunction signal to clear');
    return QualificationMalfunctionSignalState.create({ ...this, status: 'CLEARED', clearedBy, clearedAt });
  }
}

function copyContext(context: QualificationMalfunctionSignalContext): QualificationMalfunctionSignalContext {
  const seriesShotLimit = optionalPositiveInteger(context.seriesShotLimit, 'seriesShotLimit');
  const recordedShots = nonNegativeInteger(context.recordedShots, 'recordedShots');
  if (seriesShotLimit !== null && recordedShots > seriesShotLimit) {
    throw new Error('recordedShots cannot exceed seriesShotLimit');
  }

  const timedTargetProgramId = optionalText(context.timedTargetProgramId);
  const exposureIndex = optionalNonNegativeInteger(context.exposureIndex, 'exposureIndex');
  if (exposureIndex !== null && !timedTargetProgramId) {
    throw new Error('An exposure index requires a timed-target program');
  }

  return Object.freeze({
    competitionId: requiredText(context.competitionId, 'competitionId'),
    sessionId: requiredText(context.sessionId, 'sessionId'),
    participantId: requiredText(context.participantId, 'participantId'),
    participantName: requiredText(context.participantName, 'participantName'),
    startNumber: optionalText(context.startNumber),
    phase: qualificationPhase(context.phase),
    stageIndex: nonNegativeInteger(context.stageIndex, 'stageIndex'),
    seriesIndex: nonNegativeInteger(context.seriesIndex, 'seriesIndex'),
    seriesShotLimit,
    recordedShots,
    timedTargetProgramId,
    exposureIndex,
  });
}

function qualificationPhase(value: string): QualificationMalfunctionSignalPhase {
  if (value !== 'SIGHTING' && value !== 'MATCH') throw new Error('phase must be SIGHTING or MATCH');
  return value;
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function optionalNonNegativeInteger(value: number | null | undefined, name: string): number | null {
  if (value === null || value === undefined) return null;
  return nonNegativeInteger(value, name);
}

function optionalPositiveInteger(value: number | null | undefined, name: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
