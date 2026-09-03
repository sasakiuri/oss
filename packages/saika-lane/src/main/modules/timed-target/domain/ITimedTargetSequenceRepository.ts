// SPDX-License-Identifier: MIT
import type { TimedTargetSchedule } from './TimedTargetSchedule';

export type TimedTargetTerminalStatus = 'COMPLETED' | 'CANCELLED';

export interface TimedTargetAcceptedShot {
  readonly id: string;
  readonly sequenceId: string;
  readonly observationId: string;
  readonly exposureIndex: number;
  readonly firedAt: Date;
  readonly recordedAt: Date;
}

export interface TimedTargetSequenceRecord {
  readonly schedule: TimedTargetSchedule;
  readonly startedAt: Date;
  readonly terminalStatus: TimedTargetTerminalStatus | null;
  readonly terminalReason: string | null;
  readonly terminalAt: Date | null;
  readonly acceptedShots: readonly TimedTargetAcceptedShot[];
}

export interface ITimedTargetSequenceRepository {
  appendStarted(schedule: TimedTargetSchedule, recordedAt: Date): void;
  appendAcceptedShot(shot: TimedTargetAcceptedShot): void;
  appendTerminal(input: {
    sequenceId: string;
    status: TimedTargetTerminalStatus;
    reason: string;
    occurredAt: Date;
    recordedAt: Date;
  }): void;
  findBySequenceId(sequenceId: string): TimedTargetSequenceRecord | null;
  findLatest(competitionId?: string): TimedTargetSequenceRecord | null;
}
