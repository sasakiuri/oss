// SPDX-License-Identifier: MIT

import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { parseShotTimestampSource, type ShotTimestampSource } from '@/shared/types/ShotTimestampSource';

export const SHOT_OBSERVATION_OUTCOMES = [
  'RECORDED',
  'REJECTED_COMPETITION_PHASE',
  'REJECTED_TIMED_TARGET_WINDOW',
  'QUARANTINED_TIMING_REVIEW',
  'QUARANTINED_SAFETY_STOP',
  'NO_ACTIVE_SESSION',
  'PROCESSING_FAILED',
] as const;

export type ShotObservationOutcomeType = (typeof SHOT_OBSERVATION_OUTCOMES)[number];

/** Immutable representation of what arrived from a target before competition rules are applied. */
export class ShotObservation {
  private constructor(
    readonly id: string,
    readonly x: number | null,
    readonly y: number | null,
    readonly deviceScoreX10: number | null,
    readonly firedAt: Date,
    readonly receivedAt: Date,
    readonly reportedMode: 'SIGHTING' | 'MATCH' | null,
    readonly rawFrameHex: string | null,
    readonly timestampSource: ShotTimestampSource,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    x: number | null;
    y: number | null;
    deviceScoreX10?: number;
    firedAt: Date;
    receivedAt?: Date;
    reportedMode?: 'SIGHTING' | 'MATCH';
    rawFrameHex?: string;
    timestampSource?: ShotTimestampSource;
  }): ShotObservation {
    const receivedAt = props.receivedAt ?? new Date();
    if (!Number.isFinite(props.firedAt.getTime()) || !Number.isFinite(receivedAt.getTime())) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'Observation timestamps must be valid' });
    }
    if (props.deviceScoreX10 !== undefined && !Number.isFinite(props.deviceScoreX10)) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'deviceScoreX10 must be finite' });
    }

    return new ShotObservation(
      crypto.randomUUID(),
      props.x,
      props.y,
      props.deviceScoreX10 ?? null,
      new Date(props.firedAt.getTime()),
      new Date(receivedAt.getTime()),
      props.reportedMode ?? null,
      props.rawFrameHex ?? null,
      parseShotTimestampSource(props.timestampSource),
    );
  }

  static reconstruct(props: {
    id: string;
    x: number | null;
    y: number | null;
    deviceScoreX10: number | null;
    firedAt: Date;
    receivedAt: Date;
    reportedMode: 'SIGHTING' | 'MATCH' | null;
    rawFrameHex: string | null;
    timestampSource?: ShotTimestampSource;
  }): ShotObservation {
    return new ShotObservation(
      props.id,
      props.x,
      props.y,
      props.deviceScoreX10,
      props.firedAt,
      props.receivedAt,
      props.reportedMode,
      props.rawFrameHex,
      parseShotTimestampSource(props.timestampSource),
    );
  }
}

/** Append-only routing result for an observation. */
export interface ShotObservationOutcome {
  readonly id: string;
  readonly observationId: string;
  readonly type: ShotObservationOutcomeType;
  readonly decidedAt: Date;
  readonly sessionId: string | null;
  readonly detail: string | null;
}

export function createShotObservationOutcome(props: {
  observationId: string;
  type: ShotObservationOutcomeType;
  sessionId?: string;
  detail?: string;
  decidedAt?: Date;
}): ShotObservationOutcome {
  return Object.freeze({
    id: crypto.randomUUID(),
    observationId: props.observationId,
    type: props.type,
    decidedAt: props.decidedAt ?? new Date(),
    sessionId: props.sessionId ?? null,
    detail: props.detail ?? null,
  });
}
