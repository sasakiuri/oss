import type { FinalCommandScriptCapability, RuleCommandScriptStep } from '@sasakiuri/saika-rules';

export interface FinalOperationRun {
  readonly id: string;
  readonly competitionId: string;
  readonly eventId: string | null;
  readonly competitionTypeId: string;
  readonly rulePackId: string;
  readonly scriptVersion: string;
  readonly script: FinalCommandScriptCapability;
  readonly scheduledStartAt: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export type FinalOperationEntryType =
  'STEP_CONFIRMED' | 'STEP_SKIPPED' | 'EXECUTION_RESULT' | 'SHOOT_OFF_STARTED' | 'SHOOT_OFF_ROUND_CLOSED' | 'ABORTED';
export type FinalOperationExecutionStatus = 'DONE' | 'ERROR' | 'TIMEOUT';
export type FinalOperationBranch = 'MAIN' | 'SHOOT_OFF';

export interface FinalOperationEntry {
  readonly id: string;
  readonly runId: string;
  readonly entryType: FinalOperationEntryType;
  readonly branch: FinalOperationBranch;
  readonly iteration: number;
  readonly stepId: string | null;
  readonly stepSnapshot: RuleCommandScriptStep | null;
  readonly confirmationEntryId: string | null;
  readonly executionStatus: FinalOperationExecutionStatus | null;
  readonly commandId: string | null;
  readonly eligibleLaneIds: readonly string[];
  readonly statement: string;
  readonly officialName: string;
  readonly recordedAt: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
}

export interface FinalOperationShootOffShot {
  readonly id: string;
  readonly runId: string;
  readonly iteration: number;
  readonly laneId: string;
  readonly shotId: string;
  /** Competition-result score; may be HIT/MISS projected. */
  readonly scoreX10: number;
  /** Original effective source score retained for review. */
  readonly sourceScoreX10: number;
  readonly x: number | null;
  readonly y: number | null;
  readonly firedAt: string;
  readonly observedAt: string;
}

export interface IFinalOperationRepository {
  insertRun(run: FinalOperationRun): void;
  appendEntry(entry: FinalOperationEntry): void;
  findRunById(id: string): FinalOperationRun | null;
  findLatestRunByCompetition(competitionId: string): FinalOperationRun | null;
  findEntriesByRun(runId: string): FinalOperationEntry[];
  appendShootOffShot(shot: FinalOperationShootOffShot): void;
  findShootOffShotsByRun(runId: string): FinalOperationShootOffShot[];
}
