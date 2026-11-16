// SPDX-License-Identifier: MIT
import type { MqttCommandAction } from '@sasakiuri/saika-protocol/commands';
import type { CompetitionStartScope } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import type { CompetitionShootOffShotPayload } from '@sasakiuri/saika-protocol/CompetitionShootOffShot';
import type { CompetitionStatePayload } from '@sasakiuri/saika-protocol/CompetitionState';
import type { EstComplaintSignalPayload } from '@sasakiuri/saika-protocol/EstComplaintSignal';
import type { LaneAssignmentPayload } from '@sasakiuri/saika-protocol/LaneAssignment';
import type { LaneScorePayload } from '@sasakiuri/saika-protocol/LaneScore';
import type {
  HardwareStatePayload,
  LaneCompetitionStatePayload,
  LaneSafetyStatePayload,
} from '@sasakiuri/saika-protocol/LaneState';
import type { QualificationMalfunctionSignalPayload } from '@sasakiuri/saika-protocol/QualificationMalfunctionSignal';
import type {
  QualificationRecoveryFiringAuthorizationPayload,
  QualificationRecoveryShotPayload,
  QualificationRecoveryStatePayload,
} from '@sasakiuri/saika-protocol/QualificationRecovery';
import type { RangeOfficerRequestPayload } from '@sasakiuri/saika-protocol/RangeOfficerRequest';
import type {
  CompetitionShotPayload,
  RawShotPayload,
  ShotObservationEvidencePayload,
} from '@sasakiuri/saika-protocol/Shots';
import type { TimedTargetStatePayload } from '@sasakiuri/saika-protocol/TimedTargetState';
import { type ClockQualityAssessment } from '../domain/ClockQualityPolicy';
import type { FiringBoundarySignal } from '../domain/IFiringWindowJournal';
import { type MqttCredentials } from '../domain/IMqttTransport';

export type ShootOffTiming =
  | { readonly type: 'GENERIC'; readonly durationSeconds: number }
  | {
      readonly type: 'TIMED_TARGET';
      readonly programId: string;
      readonly participantExecution: 'SIMULTANEOUS' | 'SEQUENTIAL';
    };

export interface DirectorLaneSnapshot {
  laneId: string;
  laneAlias: string;
  hardware: HardwareStatePayload | null;
  safetyState: LaneSafetyStatePayload | null;
  rangeOfficerRequest?: RangeOfficerRequestPayload | null;
  qualificationMalfunctionSignal?: QualificationMalfunctionSignalPayload | null;
  estComplaintSignal?: EstComplaintSignalPayload | null;
  timedTargetState?: TimedTargetStatePayload | null;
  qualificationRecoveryState?: QualificationRecoveryStatePayload | null;
  competitionState: LaneCompetitionStatePayload | null;
  assignment: LaneAssignmentPayload | null;
  score: LaneScorePayload | null;
  lastRawShot: RawShotPayload | null;
  lastCompetitionShot: CompetitionShotPayload | null;
  lastQualificationRecoveryShot?: QualificationRecoveryShotPayload | null;
  lastSeenAt: string;
}

export interface LaneCommandResult {
  laneId: string;
  status: 'done' | 'error' | 'timeout';
  error?: { code: string; message: string };
  warning?: string;
  acknowledgedAt?: string;
  data?: Record<string, unknown>;
}

export interface CommandExecutionResult {
  /** Source scope for observers of competition-specific command outcomes. */
  competitionId?: string;
  commandId: string;
  action: MqttCommandAction;
  success: boolean;
  lanes: LaneCommandResult[];
}

export interface CommandBatchResult {
  success: boolean;
  commands: CommandExecutionResult[];
}

export interface LaneClockProbeResult {
  command: CommandExecutionResult;
  assessment: ClockQualityAssessment;
}

export interface MqttControlSnapshot {
  connected: boolean;
  brokerUrl: string | null;
  activeCompetitionId: string | null;
  lanes: DirectorLaneSnapshot[];
  competitions: CompetitionStatePayload[];
  lastCommand: CommandExecutionResult | null;
}

export interface CreateCompetitionInput {
  competitionId?: string;
  competitionTypeId: string;
  competitionTypeName: string;
  discipline: string;
  roundName: string;
  competitionUnit?: 'INDIVIDUAL' | 'MIXED_TEAM';
  definitionBinding?: CompetitionStatePayload['definitionBinding'];
  acc: 'RING' | 'DECIMAL';
  shotsPerSeries: number;
  totalSeries: number;
  totalShots: number;
  laneIds: string[];
}

export interface DirectorMqttCallbacks {
  assertPhaseStartAllowed?: (scope: CompetitionStartScope) => void;
  assertCompetitionFinishAllowed?: (competitionId: string) => void;
  onStateChanged?: (snapshot: MqttControlSnapshot) => void;
  /** Called for every valid delivery, including duplicates and replay deliveries. */
  onCompetitionShotObserved?: (shot: CompetitionShotPayload, payloadJson: string) => void;
  /** Called for every valid one-shot Final tie-break delivery; persistence handles replay idempotence. */
  onCompetitionShootOffShotObserved?: (shot: CompetitionShootOffShotPayload, payloadJson: string) => void;
  /** Called for every isolated Qualification recovery shot; persistence must handle QoS replay idempotently. */
  onQualificationRecoveryShotObserved?: (shot: QualificationRecoveryShotPayload, payloadJson: string) => void;
  /** Called for every valid retained Qualification recovery state publication. */
  onQualificationRecoveryStateObserved?: (state: QualificationRecoveryStatePayload, payloadJson: string) => void;
  onCompetitionShot?: (shot: CompetitionShotPayload) => void;
  /** Called for every durable Lane observation outcome; duplicates are journal-safe by evidenceId. */
  onShotObservationEvidenceObserved?: (evidence: ShotObservationEvidencePayload, payloadJson: string) => void;
  /** Called once the broker has accepted a command that opens or closes firing. */
  onFiringBoundary?: (boundary: FiringBoundarySignal) => void;
  onSessionReset?: () => void;
  onError?: (message: string) => void;
}

export interface CompetitionResultLane {
  laneId: string;
  assignment: LaneAssignmentPayload | null;
  score: LaneScorePayload | null;
  shots: CompetitionShotPayload[];
}

export interface DirectorMqttOptions {
  directorId: string;
  commandTimeoutMs?: number;
  startDelayMs?: number;
  resubscribeRetryMs?: number;
  credentials?: MqttCredentials;
}

export interface StartQualificationRecoveryInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly runId: string;
  readonly decisionId: string;
  readonly interruptionId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly authorization: QualificationRecoveryFiringAuthorizationPayload;
  readonly officialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: string;
}

export interface CancelQualificationRecoveryInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly runId: string;
  readonly reason: string;
}

export interface ApplyQualificationRecoveryInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly runId: string;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: string;
}

export interface SettleQualificationRecoveryInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly decisionId: string;
  readonly interruptionId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly treatment: 'KEEP_RECORDED_SERIES';
  readonly decisionOfficialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: string;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: string;
}

export interface CompetitionLaneData {
  competitionState: LaneCompetitionStatePayload | null;
  assignment: LaneAssignmentPayload | null;
  score: LaneScorePayload | null;
  lastCompetitionShot: CompetitionShotPayload | null;
  timedTargetState: TimedTargetStatePayload | null;
  qualificationRecoveryState: QualificationRecoveryStatePayload | null;
  lastQualificationRecoveryShot: QualificationRecoveryShotPayload | null;
}
