// SPDX-License-Identifier: MIT
import type { FinalFiringTransportInput } from '@/main/modules/final-recovery-firing';
import {
  RetireFinalistCommandSchema,
  StartShootOffCommandSchema,
  StopShootOffCommandSchema,
} from '@sasakiuri/saika-protocol/commands';
import type { CompetitionPhase, CompetitionStatePayload } from '@sasakiuri/saika-protocol/CompetitionState';
import { MalfunctionFiringEvidenceSchema } from '@sasakiuri/saika-protocol/MalfunctionFiring';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { DirectorCommandPort } from './DirectorCommandPort';
import type { CommandExecutionResult, DirectorLaneSnapshot, ShootOffTiming } from './DirectorMqttTypes';

export interface FinalCompetitionContext {
  requireCompetitionPhase(competitionId: string, phase: CompetitionPhase, operation: string): CompetitionStatePayload;
  requireCompetitionLane(competitionId: string, laneId: string): void;
  getLane(laneId: string): DirectorLaneSnapshot | undefined;
  assertSafetyCleared(laneIds: readonly string[], operation: string): void;
  assertTimedCommandReadiness(laneIds: readonly string[]): void;
  assertTimedTargetReadiness(laneIds: readonly string[]): void;
}

/**
 * Final-only commands: retiring a finalist, shoot-off start and stop, and Final recovery firing. The
 * coordinator runs each command in the competition operation queue.
 */
export class FinalCompetitionCommands {
  constructor(
    private readonly commands: DirectorCommandPort,
    private readonly context: FinalCompetitionContext,
    private readonly startDelayMs: number,
  ) {}

  async retireFinalist(
    competitionId: string,
    laneId: string,
    checkpointId: string,
    rank: number,
    afterShot: number,
  ): Promise<CommandExecutionResult> {
    const competition = this.context.requireCompetitionPhase(competitionId, 'MATCH', 'retire a finalist');
    if (competition.roundName !== 'Final') throw new Error('Only a Final competitor can be retired');
    this.context.requireCompetitionLane(competitionId, laneId);
    const command = RetireFinalistCommandSchema.parse(this.commands.commandBase({ checkpointId, rank, afterShot }));
    return this.commands.publishCommand({
      action: 'retire-finalist',
      topic: mqttTopics.laneCompetitionCommand(competitionId, laneId, 'retire-finalist'),
      acknowledgementTopic: () =>
        mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, laneId, 'retire-finalist'),
      payload: command,
      expectedLaneIds: [laneId],
    });
  }

  async startShootOff(
    competitionId: string,
    runId: string,
    iteration: number,
    timing: ShootOffTiming,
    shotsPerLane: number,
    eligibleLaneIds: readonly string[],
  ): Promise<CommandExecutionResult> {
    const state = this.context.requireCompetitionPhase(competitionId, 'MATCH', 'start a Final shoot-off');
    if (state.roundName !== 'Final') throw new Error('A shoot-off can only be started for a Final');
    const targetLaneIds = [...new Set(eligibleLaneIds)];
    if (targetLaneIds.length < 2) throw new Error('A shoot-off requires at least two eligible Lanes');
    targetLaneIds.forEach((laneId) => this.context.requireCompetitionLane(competitionId, laneId));
    const notReady = targetLaneIds.filter((laneId) => {
      const lane = this.context.getLane(laneId)?.competitionState;
      return lane?.competitionId !== competitionId || lane.phase !== 'SERIES_COMPLETE';
    });
    if (notReady.length > 0) {
      throw new Error(`Shoot-off Lanes are not at a completed Final series: ${notReady.join(', ')}`);
    }
    this.context.assertSafetyCleared(targetLaneIds, 'start a Final shoot-off');
    this.context.assertTimedCommandReadiness(targetLaneIds);
    if (timing.type === 'TIMED_TARGET') {
      this.context.assertTimedTargetReadiness(targetLaneIds);
      const stillActive = targetLaneIds.filter((laneId) => {
        const timedState = this.context.getLane(laneId)?.timedTargetState;
        return timedState && timedState.phase !== 'COMPLETE' && timedState.phase !== 'CANCELLED';
      });
      if (stillActive.length > 0) {
        throw new Error(`A timed target sequence is already active on shoot-off Lane(s): ${stillActive.join(', ')}`);
      }
    }
    const earliestStartMs =
      timing.type === 'TIMED_TARGET'
        ? targetLaneIds.reduce((latest, laneId) => {
            const nextLoad = this.context.getLane(laneId)?.timedTargetState?.nextLoadAllowedAt;
            return nextLoad ? Math.max(latest, Date.parse(nextLoad)) : latest;
          }, Date.now() + this.startDelayMs)
        : Date.now() + this.startDelayMs;
    const command = StartShootOffCommandSchema.parse(
      this.commands.commandBase({
        runId,
        iteration,
        timerStartAt: new Date(earliestStartMs).toISOString(),
        ...(timing.type === 'GENERIC'
          ? { timerDurationSeconds: timing.durationSeconds }
          : {
              timedTarget: {
                programId: timing.programId,
                participantExecution: timing.participantExecution,
              },
            }),
        shotsPerLane,
        targetLaneIds,
      }),
    );
    return this.commands.publishCommand({
      action: 'start-shoot-off',
      topic: mqttTopics.competitionCommand(competitionId, 'start-shoot-off'),
      acknowledgementTopic: (laneId) =>
        mqttTopics.competitionCommandAcknowledgement(competitionId, 'start-shoot-off', laneId),
      payload: command,
      expectedLaneIds: targetLaneIds,
    });
  }

  async stopShootOff(
    competitionId: string,
    runId: string,
    iteration: number,
    eligibleLaneIds: readonly string[],
  ): Promise<CommandExecutionResult> {
    const state = this.context.requireCompetitionPhase(competitionId, 'MATCH', 'stop a Final shoot-off');
    if (state.roundName !== 'Final') throw new Error('A shoot-off can only be stopped for a Final');
    const targetLaneIds = [...new Set(eligibleLaneIds)];
    if (targetLaneIds.length < 2) throw new Error('A shoot-off requires at least two eligible Lanes');
    targetLaneIds.forEach((laneId) => this.context.requireCompetitionLane(competitionId, laneId));
    const command = StopShootOffCommandSchema.parse(this.commands.commandBase({ runId, iteration, targetLaneIds }));
    return this.commands.publishCommand({
      action: 'stop-shoot-off',
      topic: mqttTopics.competitionCommand(competitionId, 'stop-shoot-off'),
      acknowledgementTopic: (laneId) =>
        mqttTopics.competitionCommandAcknowledgement(competitionId, 'stop-shoot-off', laneId),
      payload: command,
      expectedLaneIds: targetLaneIds,
    });
  }

  getFinalFiringContext(competitionId: string, laneId: string) {
    const competition = this.context.requireCompetitionPhase(competitionId, 'MATCH', 'prepare Final recovery firing');
    if (competition.roundName !== 'Final') throw new Error('Final recovery requires a Final competition');
    this.context.requireCompetitionLane(competitionId, laneId);
    const lane = this.context.getLane(laneId);
    const state = lane?.competitionState;
    const participantId = lane?.assignment?.athlete?.id;
    const rulePackFingerprint = competition.definitionBinding?.rulePack?.fingerprint.value;
    if (
      !state ||
      state.competitionId !== competitionId ||
      !['MATCH', 'SERIES_COMPLETE'].includes(state.phase) ||
      !state.currentStage.scored ||
      lane?.assignment?.competitionId !== competitionId ||
      !participantId ||
      !rulePackFingerprint
    )
      throw new Error('Current finalist, scored series and exact Rule Pack binding are required');
    return {
      sessionId: state.sessionId,
      participantId,
      rulePackFingerprint,
      stageIndex: state.currentStage.index,
      seriesIndex: state.currentSeries.index,
      recordedShots: state.currentSeries.shotsRecorded,
      seriesShotLimit: state.currentSeries.maxShots,
    };
  }

  async executeFinalFiring(input: FinalFiringTransportInput) {
    const { competitionId } = input.request;
    this.context.requireCompetitionLane(competitionId, input.laneId);
    if (input.request.workflow !== 'FINAL_RECOVERY') throw new Error('Final firing workflow is required');
    if (input.operation === 'START') {
      this.getFinalFiringContext(competitionId, input.laneId);
      this.context.assertTimedCommandReadiness([input.laneId]);
      this.context.assertTimedTargetReadiness([input.laneId]);
      if (this.context.getLane(input.laneId)?.safetyState?.status !== 'CLEAR')
        throw new Error('Clear the Lane safety STOP before authorized recovery firing');
    }
    const action =
      input.operation === 'START'
        ? 'start-malfunction-firing'
        : input.operation === 'READ'
          ? 'read-malfunction-firing'
          : 'cancel-malfunction-firing';
    const command = this.commands.commandBase(
      input.operation === 'START'
        ? { request: input.request }
        : {
            runId: input.request.runId,
            ...(input.operation === 'CANCEL' ? { request: input.request } : {}),
            ...(input.reason ? { reason: input.reason } : {}),
          },
    );
    const result = await this.commands.publishCommand({
      action,
      payload: command,
      topic: mqttTopics.laneCompetitionCommand(competitionId, input.laneId, action),
      acknowledgementTopic: () => mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, input.laneId, action),
      expectedLaneIds: [input.laneId],
    });
    const response = result.lanes.find((lane) => lane.laneId === input.laneId);
    if (!result.success || response?.status !== 'done')
      throw new Error(response?.error?.message ?? 'Final firing was not acknowledged; read or retry the same run');
    return MalfunctionFiringEvidenceSchema.parse(response.data?.evidence);
  }
}
