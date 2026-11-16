// SPDX-License-Identifier: MIT
import {
  CancelTimedTargetCommandSchema,
  RecordTimedTargetUnloadCommandSchema,
  StartTimedTargetCommandSchema,
} from '@sasakiuri/saika-protocol/commands';
import type { CompetitionPhase, CompetitionStatePayload } from '@sasakiuri/saika-protocol/CompetitionState';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { DirectorCommandPort } from './DirectorCommandPort';
import type { CommandExecutionResult, DirectorLaneSnapshot } from './DirectorMqttTypes';

export interface StartTimedTargetInput {
  competitionId: string;
  programId: string;
  purpose: 'SIGHTING' | 'MATCH';
  stageIndex: number;
  seriesIndex: number;
  targetLaneIds?: readonly string[];
}

export interface RecordTimedTargetUnloadInput {
  competitionId: string;
  sequenceId: string;
  observedAt: string;
  officialName: string;
  targetLaneIds: readonly string[];
}

export interface CancelTimedTargetInput {
  competitionId: string;
  sequenceId: string;
  reason: string;
  targetLaneIds?: readonly string[];
}

export interface TimedTargetContext {
  requireCompetition(competitionId: string): CompetitionStatePayload;
  requireCompetitionPhase(competitionId: string, phase: CompetitionPhase, operation: string): CompetitionStatePayload;
  requireCompetitionLane(competitionId: string, laneId: string): void;
  getLane(laneId: string): DirectorLaneSnapshot | undefined;
  /** Resolves with the Lanes that did not reach the series before the wait ended. */
  waitForTimedTargetLaneReadiness(
    competitionId: string,
    laneIds: readonly string[],
    stageIndex: number,
    seriesIndex: number,
  ): Promise<string[]>;
  assertPhaseStartAllowed(scope: {
    readonly competitionId: string;
    readonly phase: 'SIGHTING' | 'MATCH';
    readonly laneIds: readonly string[];
  }): void;
  assertSafetyCleared(laneIds: readonly string[], operation: string): void;
  assertTimedCommandReadiness(laneIds: readonly string[]): void;
  assertTimedTargetReadiness(laneIds: readonly string[]): void;
}

/** Timed target LOAD, UNLOAD and cancellation; the coordinator runs each in the competition operation queue. */
export class TimedTargetCommands {
  constructor(
    private readonly commands: DirectorCommandPort,
    private readonly context: TimedTargetContext,
    private readonly startDelayMs: number,
  ) {}

  async startTimedTarget(input: StartTimedTargetInput): Promise<CommandExecutionResult> {
    const competition = this.context.requireCompetitionPhase(
      input.competitionId,
      'MATCH',
      'start a timed target sequence',
    );
    const targetLaneIds = [...new Set(input.targetLaneIds ?? competition.laneIds)];
    if (targetLaneIds.length === 0) throw new Error('A timed target sequence requires at least one Lane');
    targetLaneIds.forEach((laneId) => this.context.requireCompetitionLane(input.competitionId, laneId));
    this.context.assertSafetyCleared(targetLaneIds, 'start a timed target sequence');
    this.context.assertTimedCommandReadiness(targetLaneIds);
    this.context.assertTimedTargetReadiness(targetLaneIds);

    const notReady = await this.context.waitForTimedTargetLaneReadiness(
      input.competitionId,
      targetLaneIds,
      input.stageIndex,
      input.seriesIndex,
    );
    if (notReady.length > 0) {
      throw new Error(
        `Timed target Lanes are not ready at ${input.stageIndex}:${input.seriesIndex}: ${notReady.join(', ')}`,
      );
    }

    const stillActive = targetLaneIds.filter((laneId) => {
      const state = this.context.getLane(laneId)?.timedTargetState;
      return state && state.phase !== 'COMPLETE' && state.phase !== 'CANCELLED';
    });
    if (stillActive.length > 0) {
      throw new Error(`A timed target sequence is already active on Lane(s): ${stillActive.join(', ')}`);
    }

    const awaitingUnload = targetLaneIds.filter((laneId) => {
      const pause = this.context.getLane(laneId)?.timedTargetState?.commandPause;
      return pause?.mode === 'REQUIRED' && !pause.unloadAt;
    });
    if (awaitingUnload.length) throw new Error(`Record UNLOAD before LOAD on Lane(s): ${awaitingUnload.join(', ')}`);
    this.context.assertPhaseStartAllowed({
      competitionId: input.competitionId,
      phase: input.purpose,
      laneIds: targetLaneIds,
    });
    this.context.assertSafetyCleared(targetLaneIds, 'start a timed target sequence');
    this.context.assertTimedCommandReadiness(targetLaneIds);
    this.context.assertTimedTargetReadiness(targetLaneIds);
    const earliestLoadMs = targetLaneIds.reduce((latest, laneId) => {
      const nextLoad = this.context.getLane(laneId)?.timedTargetState?.nextLoadAllowedAt;
      return nextLoad ? Math.max(latest, Date.parse(nextLoad)) : latest;
    }, Date.now() + this.startDelayMs);
    const command = StartTimedTargetCommandSchema.parse(
      this.commands.commandBase({
        programId: input.programId,
        purpose: input.purpose,
        stageIndex: input.stageIndex,
        seriesIndex: input.seriesIndex,
        loadAt: new Date(earliestLoadMs).toISOString(),
        targetLaneIds,
      }),
    );
    return this.commands.publishCommand({
      action: 'start-timed-target',
      topic: mqttTopics.competitionCommand(input.competitionId, 'start-timed-target'),
      acknowledgementTopic: (laneId) =>
        mqttTopics.competitionCommandAcknowledgement(input.competitionId, 'start-timed-target', laneId),
      payload: command,
      expectedLaneIds: targetLaneIds,
    });
  }

  async recordTimedTargetUnload(input: RecordTimedTargetUnloadInput): Promise<CommandExecutionResult> {
    this.context.requireCompetition(input.competitionId);
    const targetLaneIds = [...new Set(input.targetLaneIds)];
    if (!targetLaneIds.length) throw new Error('UNLOAD requires at least one Lane');
    for (const laneId of targetLaneIds) {
      this.context.requireCompetitionLane(input.competitionId, laneId);
      const state = this.context.getLane(laneId)?.timedTargetState;
      if (!state || state.sequenceId !== input.sequenceId || !['COMPLETE', 'CANCELLED'].includes(state.phase)) {
        throw new Error(`UNLOAD sequence is not completed or cancelled on Lane ${laneId}`);
      }
    }
    const command = RecordTimedTargetUnloadCommandSchema.parse(
      this.commands.commandBase({
        sequenceId: input.sequenceId,
        observedAt: input.observedAt,
        officialName: input.officialName,
        targetLaneIds,
      }),
    );
    return this.commands.publishCommand({
      action: 'record-timed-target-unload',
      topic: mqttTopics.competitionCommand(input.competitionId, 'record-timed-target-unload'),
      acknowledgementTopic: (laneId) =>
        mqttTopics.competitionCommandAcknowledgement(input.competitionId, 'record-timed-target-unload', laneId),
      payload: command,
      expectedLaneIds: targetLaneIds,
    });
  }

  async cancelTimedTarget(input: CancelTimedTargetInput): Promise<CommandExecutionResult> {
    const competition = this.context.requireCompetition(input.competitionId);
    const targetLaneIds = [...new Set(input.targetLaneIds ?? competition.laneIds)];
    if (targetLaneIds.length === 0) throw new Error('Timed target cancellation requires at least one Lane');
    targetLaneIds.forEach((laneId) => this.context.requireCompetitionLane(input.competitionId, laneId));
    const command = CancelTimedTargetCommandSchema.parse(
      this.commands.commandBase({ sequenceId: input.sequenceId, reason: input.reason, targetLaneIds }),
    );
    return this.commands.publishCommand({
      action: 'cancel-timed-target',
      topic: mqttTopics.competitionCommand(input.competitionId, 'cancel-timed-target'),
      acknowledgementTopic: (laneId) =>
        mqttTopics.competitionCommandAcknowledgement(input.competitionId, 'cancel-timed-target', laneId),
      payload: command,
      expectedLaneIds: targetLaneIds,
    });
  }
}
