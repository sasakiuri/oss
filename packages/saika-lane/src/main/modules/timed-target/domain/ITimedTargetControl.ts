// SPDX-License-Identifier: MIT
import type { TimedTargetProgram, TimedTargetPurpose } from '@sasakiuri/saika-rules';

import type { TimedTargetTimingSettings } from '@/shared/mqtt/TimedTargetTimingSettings';
import type { ShotTimestampSource } from '@/shared/types/ShotTimestampSource';

import type { CommandPauseAssessment, UnloadObservationInput } from './ITimedTargetCommandPause';
import type { TimedTargetExecutionContext } from './TimedTargetExecutionContext';
import type { TimedTargetSequencePhase, TimedTargetSignal } from './TimedTargetSchedule';

export type TimedTargetEnforcementMode = 'DISABLED' | 'ADVISORY' | 'REQUIRED';

export interface TimedTargetState {
  readonly sequenceId: string;
  readonly competitionId: string;
  readonly programId: string;
  readonly programLabel: string;
  readonly purpose: TimedTargetPurpose;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly targetProfileId: string;
  readonly ruleReference: string;
  readonly phase: TimedTargetSequencePhase;
  readonly signal: TimedTargetSignal;
  readonly shotWindowOpen: boolean;
  readonly exposureIndex: number | null;
  readonly exposureCount: number;
  readonly acceptedShotsInExposure: number;
  readonly loadAt: Date;
  readonly attentionAt: Date;
  readonly completesAt: Date;
  readonly nextLoadAllowedAt: Date;
  readonly nextTransitionAt: Date | null;
  readonly terminalReason: string | null;
  readonly commandPause?: CommandPauseAssessment;
  readonly executionContext?: TimedTargetExecutionContext;
  readonly timingSettings?: TimedTargetTimingSettings;
}

export interface TimedTargetShotDecision {
  readonly timingReviewRequired?: boolean;
  readonly timingEvidence?: string;
  readonly governed: true;
  readonly allowed: boolean;
  readonly purpose: TimedTargetPurpose;
  readonly targetProfileId: string;
  readonly sequenceId: string | null;
  readonly exposureIndex: number | null;
  readonly warning: string | null;
  readonly reason: string;
  readonly executionContext?: TimedTargetExecutionContext;
}

export interface ITimedTargetControl {
  readonly enforcementMode: TimedTargetEnforcementMode;
  readonly timingSettings?: TimedTargetTimingSettings;
  start(input: {
    sequenceId: string;
    competitionId: string;
    program: TimedTargetProgram;
    stageIndex: number;
    seriesIndex: number;
    targetProfileId: string;
    loadAt: Date;
    executionContext?: TimedTargetExecutionContext;
  }): TimedTargetState;
  cancel(input: { sequenceId: string; reason: string; cancelledAt?: Date }): TimedTargetState;
  getState(competitionId?: string): TimedTargetState | null;
  tryAcceptShot(input: {
    competitionId: string;
    stageIndex: number;
    seriesIndex: number;
    expectedMatchProgramId?: string;
    expectedSightingProgramId?: string;
    expectedShootOffProgramId?: string;
    targetProfileId: string;
    observationId: string;
    firedAt: Date;
    timestampSource?: ShotTimestampSource;
  }): TimedTargetShotDecision;
  recordUnload?(input: UnloadObservationInput): TimedTargetState;
  restore(): void;
  dispose(): void;
}

export interface ITimedTargetStateSink {
  publish(state: TimedTargetState): void;
}
