import type { FiringWindowTimestampSource, FiringWindowViolationKind } from '@/shared/competitionTypes';

export type FiringCommandPhase = 'SIGHTING' | 'MATCH';
export type FiringBoundaryTransition = 'OPEN' | 'CLOSE';
export type FiringBoundarySourceAction =
  'start-sighting' | 'end-sighting' | 'start-match' | 'timer-started' | 'timer-expired' | 'finish-competition';

/** Transport-neutral evidence emitted when a firing command is published. */
export interface FiringBoundarySignal {
  competitionId: string;
  phase: FiringCommandPhase;
  transition: FiringBoundaryTransition;
  occurredAt: Date;
  commandId: string;
  commandIssuedAt: Date;
  sourceAction: FiringBoundarySourceAction;
}

/** Persisted append-only command boundary. */
export interface FiringCommandBoundary extends FiringBoundarySignal {
  id: string;
  recordedAt: Date;
}

/** Review-only detection evidence. It never changes a score or classification. */
export interface FiringWindowViolation {
  id: string;
  competitionId: string;
  laneId: string;
  sessionId: string;
  shotId: string;
  observationId: string;
  shotMode: 'SIGHTING' | 'MATCH';
  policyRuleId: string;
  kind: FiringWindowViolationKind;
  ruleReference: string;
  reviewGuidance: string;
  timestampSource: FiringWindowTimestampSource;
  clockToleranceMilliseconds: number;
  evaluatedShotAt: Date;
  firedAt: Date;
  receivedAt: Date;
  observedAt: Date;
  decisiveBoundaryId: string;
  detectedAt: Date;
}

export interface IFiringWindowJournal {
  appendBoundary(boundary: FiringCommandBoundary): boolean;
  findBoundariesByCompetition(competitionId: string): FiringCommandBoundary[];
  appendViolation(violation: FiringWindowViolation): boolean;
  findViolationsByCompetition(competitionId: string): FiringWindowViolation[];
}
