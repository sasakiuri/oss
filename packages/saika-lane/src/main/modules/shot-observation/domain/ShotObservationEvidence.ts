// SPDX-License-Identifier: MIT

import type { Phase } from '@/main/modules/competition/domain/Phase';
import { parseShotTimestampSource, type ShotTimestampSource } from '@/shared/types/ShotTimestampSource';

import type { ShotObservation, ShotObservationOutcome, ShotObservationOutcomeType } from './ShotObservation';

export interface ShotObservationCompetitionContext {
  readonly competitionId: string;
  readonly phase: Phase;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly stageScored: boolean;
}

/** Durable transport-neutral evidence created after an observation is routed. */
export interface ShotObservationEvidence {
  readonly evidenceId: string;
  readonly observationId: string;
  readonly outcomeId: string;
  readonly outcome: ShotObservationOutcomeType;
  readonly x: number | null;
  readonly y: number | null;
  readonly deviceScoreX10: number | null;
  readonly firedAt: Date;
  readonly timestampSource: ShotTimestampSource;
  readonly receivedAt: Date;
  readonly reportedMode: 'SIGHTING' | 'MATCH' | null;
  readonly rawFrameHex: string | null;
  readonly decidedAt: Date;
  readonly sessionId: string | null;
  readonly detail: string | null;
  readonly competition: ShotObservationCompetitionContext | null;
}

export function createShotObservationEvidence(
  observation: ShotObservation,
  outcome: ShotObservationOutcome,
  competition: ShotObservationCompetitionContext | null,
): ShotObservationEvidence {
  if (outcome.observationId !== observation.id) throw new Error('Observation outcome does not match its evidence');
  return freezeEvidence({
    evidenceId: outcome.id,
    observationId: observation.id,
    outcomeId: outcome.id,
    outcome: outcome.type,
    x: observation.x,
    y: observation.y,
    deviceScoreX10: observation.deviceScoreX10,
    firedAt: observation.firedAt,
    timestampSource: observation.timestampSource,
    receivedAt: observation.receivedAt,
    reportedMode: observation.reportedMode,
    rawFrameHex: observation.rawFrameHex,
    decidedAt: outcome.decidedAt,
    sessionId: outcome.sessionId,
    detail: outcome.detail,
    competition,
  });
}

export function serializeShotObservationEvidence(evidence: ShotObservationEvidence): string {
  return JSON.stringify({
    ...evidence,
    firedAt: evidence.firedAt.toISOString(),
    receivedAt: evidence.receivedAt.toISOString(),
    decidedAt: evidence.decidedAt.toISOString(),
  });
}

export function parseShotObservationEvidence(payloadJson: string): ShotObservationEvidence {
  const value = JSON.parse(payloadJson) as Record<string, unknown>;
  const competition = value.competition as ShotObservationCompetitionContext | null;
  return freezeEvidence({
    evidenceId: requiredString(value.evidenceId, 'evidenceId'),
    observationId: requiredString(value.observationId, 'observationId'),
    outcomeId: requiredString(value.outcomeId, 'outcomeId'),
    outcome: value.outcome as ShotObservationOutcomeType,
    x: nullableNumber(value.x, 'x'),
    y: nullableNumber(value.y, 'y'),
    deviceScoreX10: nullableNumber(value.deviceScoreX10, 'deviceScoreX10'),
    firedAt: requiredDate(value.firedAt, 'firedAt'),
    timestampSource: parseShotTimestampSource(value.timestampSource),
    receivedAt: requiredDate(value.receivedAt, 'receivedAt'),
    reportedMode: value.reportedMode as 'SIGHTING' | 'MATCH' | null,
    rawFrameHex: nullableString(value.rawFrameHex, 'rawFrameHex'),
    decidedAt: requiredDate(value.decidedAt, 'decidedAt'),
    sessionId: nullableString(value.sessionId, 'sessionId'),
    detail: nullableString(value.detail, 'detail'),
    competition,
  });
}

function freezeEvidence(input: ShotObservationEvidence): ShotObservationEvidence {
  return Object.freeze({
    ...input,
    firedAt: new Date(input.firedAt.getTime()),
    receivedAt: new Date(input.receivedAt.getTime()),
    decidedAt: new Date(input.decidedAt.getTime()),
    competition: input.competition === null ? null : Object.freeze({ ...input.competition }),
  });
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} is invalid`);
  return value;
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${name} is invalid`);
  return value;
}

function nullableNumber(value: unknown, name: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} is invalid`);
  return value;
}

function requiredDate(value: unknown, name: string): Date {
  const date = new Date(requiredString(value, name));
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} is invalid`);
  return date;
}
