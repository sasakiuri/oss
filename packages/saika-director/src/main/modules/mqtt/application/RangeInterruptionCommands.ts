// SPDX-License-Identifier: MIT
import {
  PauseTimerCommandSchema,
  ResumeMatchCommandSchema,
  ResumeTimerCommandSchema,
  type MqttCommandActionOf,
} from '@sasakiuri/saika-protocol/commands';
import type { CompetitionStatePayload } from '@sasakiuri/saika-protocol/CompetitionState';

import { createLaneCommandFailure, fanOutLaneCommands } from './laneCommandBatch';
import type { DirectorCommandPort } from './DirectorCommandPort';
import type { CommandBatchResult, CommandExecutionResult } from './DirectorMqttTypes';

export interface RangeInterruptionContext {
  requireCompetition(competitionId: string): CompetitionStatePayload;
  requireCompetitionLane(competitionId: string, laneId: string): void;
  assertSafetyCleared(laneIds: readonly string[], operation: string): void;
  assertTimedCommandReadiness(laneIds: readonly string[]): void;
  onResult(result: CommandExecutionResult): void;
  log(message: string): void;
}

/** Lane-addressed interruption commands, executed inside the shared competition queue. */
export class RangeInterruptionCommands {
  constructor(
    private readonly commands: DirectorCommandPort,
    private readonly context: RangeInterruptionContext,
    private readonly startDelayMs: number,
  ) {}

  async pauseLaneTimer(competitionId: string, laneId: string, interruptionId: string): Promise<CommandExecutionResult> {
    const state = this.requireActiveFiringPhase(competitionId, 'pause a Lane timer');
    this.context.requireCompetitionLane(competitionId, laneId);
    const pausedAt = new Date().toISOString();
    const command = PauseTimerCommandSchema.parse(this.commands.commandBase({ interruptionId, pausedAt }));
    return this.commands.publishCompetitionLaneCommand(competitionId, laneId, 'pause-timer', command, () =>
      this.context.log(`Lane-specific STOP published for ${laneId} during ${state.phase} (${interruptionId})`),
    );
  }

  async pauseRangeTimers(
    competitionId: string,
    laneIds: string[],
    interruptionId: string,
  ): Promise<CommandBatchResult> {
    return fanOutLaneCommands(
      this.requireRangeOperationLanes(competitionId, laneIds),
      (laneId) => this.pauseLaneTimer(competitionId, laneId, interruptionId),
      (laneId, error) => this.interruptionCommandFailure('pause-timer', laneId, error),
    );
  }

  async resumeLaneTimer(
    competitionId: string,
    laneId: string,
    interruptionId: string,
    authorizedRemainingSeconds: number,
    unlimitedSightingShots: boolean,
  ): Promise<CommandExecutionResult> {
    return this.resumeLaneTimerNow(
      competitionId,
      laneId,
      interruptionId,
      authorizedRemainingSeconds,
      unlimitedSightingShots,
    );
  }

  private async resumeLaneTimerNow(
    competitionId: string,
    laneId: string,
    interruptionId: string,
    authorizedRemainingSeconds: number,
    unlimitedSightingShots: boolean,
    clockQualityAlreadyChecked = false,
    sharedTimerStartAt?: string,
  ): Promise<CommandExecutionResult> {
    this.requireActiveFiringPhase(competitionId, 'resume a Lane timer');
    this.context.requireCompetitionLane(competitionId, laneId);
    this.context.assertSafetyCleared([laneId], 'resume a Lane timer');
    if (!clockQualityAlreadyChecked) this.context.assertTimedCommandReadiness([laneId]);
    const command = ResumeTimerCommandSchema.parse(
      this.commands.commandBase({
        interruptionId,
        timerStartAt: sharedTimerStartAt ?? new Date(Date.now() + this.startDelayMs).toISOString(),
        authorizedRemainingSeconds,
        unlimitedSightingShots,
      }),
    );
    return this.commands.publishCompetitionLaneCommand(competitionId, laneId, 'resume-timer', command);
  }

  async resumeRangeTimers(
    competitionId: string,
    laneIds: string[],
    interruptionId: string,
    authorizedRemainingSeconds: number,
    unlimitedSightingShots: boolean,
  ): Promise<CommandBatchResult> {
    const uniqueLaneIds = this.requireRangeOperationLanes(competitionId, laneIds);
    this.context.assertTimedCommandReadiness(uniqueLaneIds);
    const timerStartAt = new Date(Date.now() + this.startDelayMs).toISOString();
    return fanOutLaneCommands(
      uniqueLaneIds,
      (laneId) =>
        this.resumeLaneTimerNow(
          competitionId,
          laneId,
          interruptionId,
          authorizedRemainingSeconds,
          unlimitedSightingShots,
          true,
          timerStartAt,
        ),
      (laneId, error) => this.interruptionCommandFailure('resume-timer', laneId, error),
    );
  }

  async resumeLaneMatch(
    competitionId: string,
    laneId: string,
    interruptionId: string,
  ): Promise<CommandExecutionResult> {
    this.requireActiveFiringPhase(competitionId, 'resume MATCH fire on a Lane');
    this.context.requireCompetitionLane(competitionId, laneId);
    this.context.assertSafetyCleared([laneId], 'resume MATCH fire on a Lane');
    const command = ResumeMatchCommandSchema.parse(this.commands.commandBase({ interruptionId }));
    return this.commands.publishCompetitionLaneCommand(competitionId, laneId, 'resume-match', command);
  }

  async resumeRangeMatch(
    competitionId: string,
    laneIds: string[],
    interruptionId: string,
  ): Promise<CommandBatchResult> {
    return fanOutLaneCommands(
      this.requireRangeOperationLanes(competitionId, laneIds),
      (laneId) => this.resumeLaneMatch(competitionId, laneId, interruptionId),
      (laneId, error) => this.interruptionCommandFailure('resume-match', laneId, error),
    );
  }

  private requireActiveFiringPhase(competitionId: string, operation: string): CompetitionStatePayload {
    const state = this.context.requireCompetition(competitionId);
    if (state.phase !== 'SIGHTING' && state.phase !== 'MATCH') {
      throw new Error(`Cannot ${operation} while competition ${competitionId} is in phase ${state.phase}`);
    }
    return state;
  }

  private requireRangeOperationLanes(competitionId: string, laneIds: readonly string[]): string[] {
    const uniqueLaneIds = [...new Set(laneIds)];
    if (uniqueLaneIds.length === 0) throw new Error('A range operation requires at least one Lane');
    this.requireActiveFiringPhase(competitionId, 'operate range interruption timers');
    uniqueLaneIds.forEach((laneId) => this.context.requireCompetitionLane(competitionId, laneId));
    return uniqueLaneIds;
  }

  private interruptionCommandFailure(
    action: Extract<MqttCommandActionOf<'competition-lane'>, 'pause-timer' | 'resume-timer' | 'resume-match'>,
    laneId: string,
    error: unknown,
  ): CommandExecutionResult {
    const result = createLaneCommandFailure({ action, laneId, code: 'RANGE_COMMAND_FAILED', error });
    this.context.onResult(result);
    return result;
  }
}
