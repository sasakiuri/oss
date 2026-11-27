// SPDX-License-Identifier: MIT
import type {
  AdjudicateQualificationRecoveryExecutionPayload,
  AppendRangeInterruptionEntryPayload,
  ApplyQualificationRecoverySettlementPayload,
  CancelQualificationRecoveryExecutionPayload,
  CreateRangeInterruptionCasePayload,
  LinkCaseScopePayload,
  RangeInterruptionCaseDto,
  RecordQualificationTimedTargetRecoveryDecisionPayload,
  RecordTargetRecoveryAssessmentPayload,
  StartQualificationRecoveryExecutionPayload,
} from '@/shared/ipc/contracts';

import type { applyLaneMatchResume, applyLanePause, applyLaneResume } from './rangeInterruptionLaneWorkflow';
import type { applyRangeMatchResume, applyRangePause, applyRangeResume } from './rangeInterruptionRangeWorkflow';

export interface RangeInterruptionLaneOption {
  laneId: string;
  label: string;
  firingPointNumber: number | null;
  athleteName?: string;
  interruption?: {
    interruptionId: string;
    status: 'PAUSED' | 'RESUME_PENDING' | 'SIGHTING' | 'RUNNING_MATCH';
  };
  seriesSnapshot?: {
    stageIndex: number;
    seriesIndex: number;
    recordedShots: number;
    maxShots: number;
    seriesComplete: boolean;
    capturedAt: string;
  };
}

export type DetailAction =
  'pause' | 'end' | 'recovery' | 'grant' | 'qualification-decision' | 'resume' | 'match' | 'entry' | null;

/** A true result means the command succeeded in the current workspace visit. */
export interface RangeInterruptionCommands {
  create: (input: CreateRangeInterruptionCasePayload) => Promise<boolean>;
  appendEntry: (input: AppendRangeInterruptionEntryPayload) => Promise<boolean>;
  linkScope: (input: LinkCaseScopePayload) => Promise<boolean>;
  recordTargetRecovery: (input: RecordTargetRecoveryAssessmentPayload) => Promise<boolean>;
  recordQualificationDecision: (input: RecordQualificationTimedTargetRecoveryDecisionPayload) => Promise<boolean>;
  startQualificationRecovery: (input: StartQualificationRecoveryExecutionPayload) => Promise<boolean>;
  cancelQualificationRecovery: (input: CancelQualificationRecoveryExecutionPayload) => Promise<boolean>;
  adjudicateQualificationRecovery: (input: AdjudicateQualificationRecoveryExecutionPayload) => Promise<boolean>;
  applyQualificationSettlement: (input: ApplyQualificationRecoverySettlementPayload) => Promise<boolean>;
  /** Lane and range commands: the Lane applies the operation, then the ledger records its acknowledgement. */
  pauseLane: (context: Parameters<typeof applyLanePause>[0]) => Promise<boolean>;
  resumeLane: (context: Parameters<typeof applyLaneResume>[0]) => Promise<boolean>;
  resumeLaneMatch: (context: Parameters<typeof applyLaneMatchResume>[0]) => Promise<boolean>;
  pauseRange: (context: Parameters<typeof applyRangePause>[0]) => Promise<boolean>;
  resumeRange: (context: Parameters<typeof applyRangeResume>[0]) => Promise<boolean>;
  resumeRangeMatch: (context: Parameters<typeof applyRangeMatchResume>[0]) => Promise<boolean>;
}

/** A form of one interruption record that submits one command and closes when it succeeded. */
export interface FormProps<K extends keyof RangeInterruptionCommands> {
  interruption: RangeInterruptionCaseDto;
  saving: boolean;
  onCancel: () => void;
  onSubmitCommand: RangeInterruptionCommands[K];
}
