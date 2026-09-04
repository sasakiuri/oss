// SPDX-License-Identifier: MIT

export const EST_COMPLAINT_ISSUES = [
  'SHOT_VALUE',
  'SHOT_NOT_REGISTERED',
  'TARGET_FAILURE',
  'TARGET_MEDIA_ADVANCE',
  'OTHER',
] as const;

export type EstComplaintIssue = (typeof EST_COMPLAINT_ISSUES)[number];
export type EstComplaintSignalStatus = 'ACTIVE' | 'CLEARED';
export type EstComplaintSignalPhase = 'SIGHTING' | 'MATCH';

export interface EstComplaintLastShotSnapshot {
  readonly shotId: string;
  readonly shotNumberInSeries: number;
  readonly firedAt: string;
  readonly receivedAt: string;
}

export interface EstComplaintSignalContext {
  readonly competitionId: string;
  readonly sessionId: string;
  readonly participantId: string;
  readonly participantName: string;
  readonly startNumber: string | null;
  readonly phase: EstComplaintSignalPhase;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly seriesShotLimit: number | null;
  readonly recordedShots: number;
  readonly timedTargetProgramId: string | null;
  readonly exposureIndex: number | null;
  readonly lastShot: EstComplaintLastShotSnapshot | null;
}

export interface EstComplaintSignalStateProps {
  readonly signalId: string;
  readonly status: EstComplaintSignalStatus;
  readonly issue: EstComplaintIssue;
  readonly context: EstComplaintSignalContext;
  readonly message?: string | null;
  readonly signalledAt: Date;
  readonly clearedAt?: Date | null;
  readonly clearedBy?: string | null;
}

/**
 * Lane-owned observation that an electronic scoring target complaint needs official review.
 *
 * This state preserves the circumstances of the complaint. It does not decide whether
 * the complaint is timely or valid, change a score, or open an official examination.
 */
export class EstComplaintSignalState {
  private constructor(
    readonly signalId: string,
    readonly status: EstComplaintSignalStatus,
    readonly issue: EstComplaintIssue,
    readonly context: EstComplaintSignalContext,
    readonly message: string | null,
    readonly signalledAt: Date,
    readonly clearedAt: Date | null,
    readonly clearedBy: string | null,
  ) {
    Object.freeze(this);
  }

  static signal(input: {
    signalId?: string;
    issue: EstComplaintIssue;
    context: EstComplaintSignalContext;
    message?: string | null;
    signalledAt?: Date;
  }): EstComplaintSignalState {
    return EstComplaintSignalState.create({
      signalId: input.signalId ?? crypto.randomUUID(),
      status: 'ACTIVE',
      issue: input.issue,
      context: input.context,
      message: input.message,
      signalledAt: input.signalledAt ?? new Date(),
    });
  }

  static create(props: EstComplaintSignalStateProps): EstComplaintSignalState {
    const context = copyContext(props.context);
    const signalledAt = validDate(props.signalledAt, 'signalledAt');
    const clearedAt = props.clearedAt ? validDate(props.clearedAt, 'clearedAt') : null;
    const clearedBy = optionalText(props.clearedBy);

    if (props.status === 'ACTIVE' && (clearedAt || clearedBy)) {
      throw new Error('An active EST complaint signal cannot contain clearance data');
    }
    if (props.status === 'CLEARED' && (!clearedAt || !clearedBy)) {
      throw new Error('A cleared EST complaint signal requires clearedAt and clearedBy');
    }
    if (clearedAt && clearedAt < signalledAt) throw new Error('clearedAt cannot precede signalledAt');

    const message = optionalText(props.message);
    if (message && message.length > 500) throw new Error('message must be at most 500 characters');

    return new EstComplaintSignalState(
      requiredText(props.signalId, 'signalId'),
      props.status,
      complaintIssue(props.issue),
      context,
      message,
      signalledAt,
      clearedAt,
      clearedBy,
    );
  }

  clear(clearedBy: string, clearedAt = new Date()): EstComplaintSignalState {
    if (this.status !== 'ACTIVE') throw new Error('No active EST complaint signal to clear');
    return EstComplaintSignalState.create({ ...this, status: 'CLEARED', clearedBy, clearedAt });
  }
}

function copyContext(context: EstComplaintSignalContext): EstComplaintSignalContext {
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
    phase: complaintPhase(context.phase),
    stageIndex: nonNegativeInteger(context.stageIndex, 'stageIndex'),
    seriesIndex: nonNegativeInteger(context.seriesIndex, 'seriesIndex'),
    seriesShotLimit,
    recordedShots,
    timedTargetProgramId,
    exposureIndex,
    lastShot: context.lastShot ? copyLastShot(context.lastShot) : null,
  });
}

function copyLastShot(snapshot: EstComplaintLastShotSnapshot): EstComplaintLastShotSnapshot {
  return Object.freeze({
    shotId: requiredText(snapshot.shotId, 'lastShot.shotId'),
    shotNumberInSeries: positiveInteger(snapshot.shotNumberInSeries, 'lastShot.shotNumberInSeries'),
    firedAt: validIsoDate(snapshot.firedAt, 'lastShot.firedAt'),
    receivedAt: validIsoDate(snapshot.receivedAt, 'lastShot.receivedAt'),
  });
}

function complaintIssue(value: string): EstComplaintIssue {
  if (!EST_COMPLAINT_ISSUES.includes(value as EstComplaintIssue)) throw new Error('Unknown EST complaint issue');
  return value as EstComplaintIssue;
}

function complaintPhase(value: string): EstComplaintSignalPhase {
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

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function optionalPositiveInteger(value: number | null | undefined, name: string): number | null {
  if (value === null || value === undefined) return null;
  return positiveInteger(value, name);
}

function optionalNonNegativeInteger(value: number | null | undefined, name: string): number | null {
  if (value === null || value === undefined) return null;
  return nonNegativeInteger(value, name);
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}

function validIsoDate(value: string, name: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${name} must be a valid timestamp`);
  return parsed.toISOString();
}
