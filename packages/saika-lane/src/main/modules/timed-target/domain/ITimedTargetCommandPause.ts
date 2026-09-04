// SPDX-License-Identifier: MIT
import type { TimedTargetSequenceRecord } from './ITimedTargetSequenceRepository';

export type CommandPauseMode = 'DISABLED' | 'ADVISORY' | 'REQUIRED';

export interface CommandPauseAssessment {
  readonly mode: CommandPauseMode;
  readonly ruleReference: string;
  readonly minimumSeconds: number;
  readonly unloadAt: string | null;
  readonly officialName: string | null;
  readonly nextLoadAllowedAt: string | null;
  readonly blocked: boolean;
}

export interface UnloadObservationInput {
  readonly observationId: string;
  readonly sequenceId: string;
  readonly occurredAt: Date;
  readonly officialName: string;
}

/** Consumer-owned boundary: the firing engine does not own the command journal. */
export interface ITimedTargetCommandPause {
  assess(record: TimedTargetSequenceRecord, at: Date): CommandPauseAssessment | undefined;
  recordUnload(record: TimedTargetSequenceRecord, input: UnloadObservationInput, now: Date): void;
}
