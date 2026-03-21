// SPDX-License-Identifier: MIT
/**
 * CQRS token definitions
 *
 * Defines all command/query tokens and their input types.
 * Tokens use phantom types to guarantee type-safe dispatch.
 */

import type { CompetitionStateDto, CompetitionTypeDto } from '@/main/modules/competition/application/dto';
import type { ScoreSheetDto } from '@/main/modules/report/application/dto';
import type { SessionScoreDto, ShotHistoryDto } from '@/main/modules/session/application/dto';
import type { Discipline } from '@/main/modules/session/domain/Discipline';
import type { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { Mode } from '@/main/modules/session/domain/Mode';
import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';
import { defineQuery } from '@/main/shared-infra/cqrs/QueryBus';

// ---------------------------------------------------------------------------
// Command Input Interfaces
// ---------------------------------------------------------------------------

/** Input for the session start command */
export interface StartSessionInput {
  discipline: Discipline;
}

/** Input for the record impact point command */
export interface RecordShotInput {
  sessionId: string;
  impactPoint: ImpactPoint | null;
  timestamp: Date;
  deviceScore?: number;
  /** Mode reported by the device (if omitted, the Session's mode is used) */
  mode?: Mode;
}

/** Input for the mode switch command */
export interface SwitchModeInput {
  sessionId: string;
  mode: Mode;
}

/** Input for the session reset command */
export interface ResetSessionInput {
  sessionId: string;
}

/** Input for the target connection command */
export interface ConnectToTargetInput {
  portName: string;
  manufacturer: TargetManufacturer;
  baudRate?: number;
  deviceId?: string;
}

/** Input for the target disconnection command */
export interface DisconnectFromTargetInput {
  connectionId: string;
}

// ---------------------------------------------------------------------------
// Query Input Interfaces
// ---------------------------------------------------------------------------

/** Input for the session score query */
export interface GetSessionScoreInput {
  sessionId: string;
}

/** Input for the shot history query */
export interface GetShotHistoryInput {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Command Tokens
// ---------------------------------------------------------------------------

export const StartSessionToken = defineCommand<StartSessionInput>('StartSession');

export const RecordShotToken = defineCommand<RecordShotInput>('RecordShot');

export const SwitchModeToken = defineCommand<SwitchModeInput>('SwitchMode');

export const ResetSessionToken = defineCommand<ResetSessionInput>('ResetSession');

export const ConnectToTargetToken = defineCommand<ConnectToTargetInput>('ConnectToTarget');

export const DisconnectFromTargetToken = defineCommand<DisconnectFromTargetInput>('DisconnectFromTarget');

// ---------------------------------------------------------------------------
// Query Tokens
// ---------------------------------------------------------------------------

export const GetSessionScoreToken = defineQuery<GetSessionScoreInput, SessionScoreDto>('GetSessionScore');

export const GetShotHistoryToken = defineQuery<GetShotHistoryInput, ShotHistoryDto>('GetShotHistory');

// ---------------------------------------------------------------------------
// Report Command Input Interfaces
// ---------------------------------------------------------------------------

/** Input for the open print window command */
export interface OpenPrintWindowInput {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Report Query Input Interfaces
// ---------------------------------------------------------------------------

/** Input for the score sheet retrieval query */
export interface GetScoreSheetInput {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Competition Command Input Interfaces
// ---------------------------------------------------------------------------

/** Input for the start competition command */
export interface StartCompetitionInput {
  competitionTypeId: string;
}

/** Input for the start stage command */
export interface StartStageInput {
  competitionId: string;
}

/** Input for the start next series command */
export interface StartNextSeriesInput {
  competitionId: string;
}

/** Input for the advance stage command */
export interface AdvanceStageInput {
  competitionId: string;
}

/** Input for the finish competition command */
export interface FinishCompetitionInput {
  competitionId: string;
}

/** Input for the end stage command */
export interface EndStageInput {
  competitionId: string;
}

/** Input for the assign athlete command */
export interface AssignAthleteInput {
  competitionId: string;
  /** Athlete name (null to unassign) */
  athleteName: string | null;
}

// ---------------------------------------------------------------------------
// Competition Query Input Interfaces
// ---------------------------------------------------------------------------

/** Input for the competition state query */
export interface GetCompetitionStateInput {
  competitionId: string;
}

// ---------------------------------------------------------------------------
// Competition Command Tokens
// ---------------------------------------------------------------------------

/** Return value of the start competition command */
export interface StartCompetitionResult {
  competitionId: string;
  sessionId: string;
}

export const StartCompetitionToken = defineCommand<StartCompetitionInput, StartCompetitionResult>('StartCompetition');

/** Return value of the start stage command */
export interface StartStageResult {
  sessionId: string;
}

export const StartStageToken = defineCommand<StartStageInput, StartStageResult>('StartStage');

export const StartNextSeriesToken = defineCommand<StartNextSeriesInput>('StartNextSeries');

export const AdvanceStageToken = defineCommand<AdvanceStageInput>('AdvanceStage');

export const FinishCompetitionToken = defineCommand<FinishCompetitionInput>('FinishCompetition');

export const EndStageToken = defineCommand<EndStageInput>('EndStage');

export const AssignAthleteToken = defineCommand<AssignAthleteInput>('AssignAthlete');

// ---------------------------------------------------------------------------
// Competition Query Tokens
// ---------------------------------------------------------------------------

export const GetCompetitionStateToken = defineQuery<GetCompetitionStateInput, CompetitionStateDto>(
  'GetCompetitionState',
);

export const GetCompetitionTypesToken = defineQuery<void, CompetitionTypeDto[]>('GetCompetitionTypes');

// ---------------------------------------------------------------------------
// Report Command Tokens
// ---------------------------------------------------------------------------

export const OpenPrintWindowToken = defineCommand<OpenPrintWindowInput>('OpenPrintWindow');

// ---------------------------------------------------------------------------
// Report Query Tokens
// ---------------------------------------------------------------------------

export const GetScoreSheetToken = defineQuery<GetScoreSheetInput, ScoreSheetDto>('GetScoreSheet');
