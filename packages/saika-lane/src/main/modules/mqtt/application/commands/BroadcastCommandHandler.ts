// SPDX-License-Identifier: MIT
/**
 * BroadcastCommandHandler
 *
 * @description
 * Handler that processes competition-wide broadcast commands.
 * Subscribes to `saika/competition/{competitionId}/command/+` and
 * calls CommandBus / LaneTimerService according to the action.
 * Implements the 2-phase ACK (executing → done/error) pattern.
 */

import type { z } from 'zod';

import {
  AdvanceStageToken,
  EndStageToken,
  FinishCompetitionToken,
  StartNextSeriesToken,
  StartStageToken,
} from '@/main/composition/tokens';
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import {
  CommandAuthorizationPolicy,
  type ICommandAuthorizationPolicy,
} from '@/main/modules/mqtt/domain/CommandAuthorizationPolicy';
import type { CommandAckPayload } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import {
  AdvanceSeriesCmdSchema,
  CancelTimedTargetCmdSchema,
  RecordTimedTargetUnloadCmdSchema,
  EndSightingCmdSchema,
  FinishCompetitionCmdSchema,
  StartMatchCmdSchema,
  StartSightingCmdSchema,
  StartShootOffCmdSchema,
  StartTimedTargetCmdSchema,
  StopShootOffCmdSchema,
  TimerExpiredCmdSchema,
  TimerStartedCmdSchema,
} from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import type { CommandIdempotencyGuard } from '@/main/modules/mqtt/infra/CommandIdempotencyGuard';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ITimedTargetControl } from '@/main/modules/timed-target';
import { timedTargetProgramDurationMilliseconds } from '@/main/modules/timed-target/domain/TimedTargetSchedule';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

type BroadcastAction =
  | 'start-sighting'
  | 'end-sighting'
  | 'start-match'
  | 'advance-series'
  | 'finish-competition'
  | 'timer-started'
  | 'timer-expired'
  | 'start-shoot-off'
  | 'stop-shoot-off'
  | 'start-timed-target'
  | 'cancel-timed-target'
  | 'record-timed-target-unload';

const CLOCK_DRIFT_WARNING_THRESHOLD_MS = 5_000;
const CLOCK_DRIFT_REJECT_THRESHOLD_MS = 30_000;

const TIMER_ACTIONS: ReadonlySet<BroadcastAction> = new Set([
  'start-sighting',
  'start-match',
  'timer-started',
  'start-shoot-off',
  'start-timed-target',
]);

const ACTION_SCHEMAS: Record<BroadcastAction, z.ZodType> = {
  'start-sighting': StartSightingCmdSchema,
  'end-sighting': EndSightingCmdSchema,
  'start-match': StartMatchCmdSchema,
  'advance-series': AdvanceSeriesCmdSchema,
  'finish-competition': FinishCompetitionCmdSchema,
  'timer-started': TimerStartedCmdSchema,
  'timer-expired': TimerExpiredCmdSchema,
  'start-shoot-off': StartShootOffCmdSchema,
  'stop-shoot-off': StopShootOffCmdSchema,
  'start-timed-target': StartTimedTargetCmdSchema,
  'cancel-timed-target': CancelTimedTargetCmdSchema,
  'record-timed-target-unload': RecordTimedTargetUnloadCmdSchema,
};

/** Parsed parts of the topic */
interface ParsedBroadcastTopic {
  competitionId: string;
  action: string;
}

export class BroadcastCommandHandler {
  private subscribedTopic: string | null = null;
  private messageUnsubscribe: (() => void) | null = null;

  constructor(
    private readonly mqttClient: IMqttClientService,
    private readonly commandBus: CommandBus,
    private readonly timerService: LaneTimerService,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly competitionStatePublisher: LaneCompetitionStatePublisher,
    private readonly scorePublisher: LaneScorePublisher,
    private readonly idempotencyGuard: CommandIdempotencyGuard,
    private readonly getLaneId: () => string,
    _competitionId: string,
    private readonly interruptionControl?: ICompetitionInterruptionControl,
    private readonly safetyStopControl?: Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>,
    private readonly shootOffControl?: ICompetitionShootOffControl,
    private readonly commandAuthorization: ICommandAuthorizationPolicy = new CommandAuthorizationPolicy(),
    private readonly timedTargetControl?: ITimedTargetControl,
  ) {}

  /**
   * Subscribes to competition broadcast commands
   */
  async subscribeToCompetition(competitionId: string): Promise<void> {
    await this.unsubscribeFromCompetition();

    const topic = `saika/competition/${competitionId}/command/+`;
    this.subscribedTopic = topic;

    await this.mqttClient.subscribe(topic, 1);

    this.messageUnsubscribe = this.mqttClient.onMessage((msgTopic: string, payload: Buffer) => {
      const parsed = this.parseTopic(msgTopic);
      if (!parsed) return;

      void this.handleCommand(parsed, payload);
    });
  }

  /**
   * Unsubscribes from the competition
   */
  async unsubscribeFromCompetition(): Promise<void> {
    this.messageUnsubscribe?.();
    this.messageUnsubscribe = null;

    if (this.subscribedTopic) {
      try {
        await this.mqttClient.unsubscribe(this.subscribedTopic);
      } catch {
        // Ignore if already disconnected
      }
      this.subscribedTopic = null;
    }
  }

  /**
   * Parses the topic
   * saika/competition/{competitionId}/command/{action}
   */
  private parseTopic(topic: string): ParsedBroadcastTopic | null {
    const segments = topic.split('/');
    if (segments.length !== 5) return null;
    if (segments[0] !== 'saika' || segments[1] !== 'competition') return null;
    if (segments[3] !== 'command') return null;

    return {
      competitionId: segments[2]!,
      action: segments[4]!,
    };
  }

  /**
   * Processes a command
   */
  private async handleCommand(parsed: ParsedBroadcastTopic, payload: Buffer): Promise<void> {
    const logger = getLogger();
    const { action, competitionId } = parsed;
    const ackTopic = `saika/competition/${competitionId}/command/${action}/acknowledgement/${this.getLaneId()}`;

    // JSON parse
    let rawData: unknown;
    try {
      rawData = JSON.parse(payload.toString());
    } catch {
      logger.error('[BroadcastCommandHandler] Failed to parse JSON', 'mqtt', { action });
      return;
    }

    // Action schema validation
    const schema = ACTION_SCHEMAS[action as BroadcastAction];
    if (!schema) {
      const error = ErrorCatalog.createError('MQTT_UNKNOWN_COMMAND_ACTION', { action });
      await this.publishAck(ackTopic, '', 'error', error.code, error.message);
      return;
    }

    const parseResult = schema.safeParse(rawData);
    if (!parseResult.success) {
      const error = ErrorCatalog.createError('MQTT_COMMAND_VALIDATION_FAILED', {
        action,
        detail: parseResult.error.message,
      });
      const commandId = (rawData as { commandId?: string }).commandId ?? '';
      await this.publishAck(ackTopic, commandId, 'error', error.code, error.message);
      return;
    }

    const command = parseResult.data as Record<string, unknown>;
    const commandId = command.commandId as string;
    const authorization = this.commandAuthorization.assess({
      issuedBy: command.issuedBy as string,
      ...(typeof command.issuerId === 'string' ? { issuerId: command.issuerId } : {}),
    });
    if (!authorization.allowed) {
      const error = ErrorCatalog.createError('MQTT_COMMAND_UNAUTHORIZED', { detail: authorization.reason });
      await this.publishAck(ackTopic, commandId, 'error', error.code, error.message);
      return;
    }

    // Idempotency check
    if (this.idempotencyGuard.check(commandId)) {
      logger.info(`[BroadcastCommandHandler] Duplicate command skipped: ${commandId}`, 'mqtt');
      return;
    }

    // Targeted broadcast commands are ACKed only by their intended Lanes.
    if (
      action === 'start-sighting' ||
      action === 'start-shoot-off' ||
      action === 'stop-shoot-off' ||
      action === 'start-timed-target' ||
      action === 'cancel-timed-target' ||
      action === 'record-timed-target-unload'
    ) {
      const targetLaneIds = command.targetLaneIds as string[] | undefined;
      if (targetLaneIds && !targetLaneIds.includes(this.getLaneId())) {
        logger.info(`[BroadcastCommandHandler] Lane ${this.getLaneId()} not in targetLaneIds, skipping`, 'mqtt');
        return;
      }
    }

    // Clock drift check (timer-related actions only)
    let doneWarning = authorization.warning;
    if (TIMER_ACTIONS.has(action as BroadcastAction)) {
      const issuedAt = command.issuedAt as string | undefined;
      if (issuedAt) {
        const drift = Math.abs(Date.now() - new Date(issuedAt).getTime());
        if (drift > CLOCK_DRIFT_REJECT_THRESHOLD_MS) {
          const error = ErrorCatalog.createError('MQTT_CLOCK_OUT_OF_SYNC', { driftMs: drift });
          logger.error(`[BroadcastCommandHandler] Clock out of sync: driftMs=${drift}`, 'mqtt', { commandId, action });
          await this.publishAck(ackTopic, commandId, 'error', error.code, error.message);
          return;
        } else if (drift > CLOCK_DRIFT_WARNING_THRESHOLD_MS) {
          doneWarning = [doneWarning, 'clock_drift_detected'].filter(Boolean).join('; ') || undefined;
          logger.warn(`[BroadcastCommandHandler] Clock drift detected: driftMs=${drift}`, 'mqtt', {
            commandId,
            action,
          });
        }
      }
    }

    // executing ACK
    await this.publishAck(ackTopic, commandId, 'executing');

    try {
      await this.executeAction(action as BroadcastAction, command, competitionId);
      await this.publishAck(ackTopic, commandId, 'done', undefined, undefined, doneWarning);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = (err as { code?: string }).code ?? 'MQTT_COMMAND_EXECUTION_FAILED';
      logger.error(`[BroadcastCommandHandler] Command failed: ${action}`, 'mqtt', {
        error: errorMessage,
        commandId,
      });
      await this.publishAck(ackTopic, commandId, 'error', errorCode, errorMessage);
    }
  }

  /**
   * Executes an action
   */
  private async executeAction(
    action: BroadcastAction,
    command: Record<string, unknown>,
    competitionId: string,
  ): Promise<void> {
    if (this.safetyStopControl?.isStopped() && action === 'timer-expired') return;
    if (
      action !== 'end-sighting' &&
      action !== 'finish-competition' &&
      action !== 'stop-shoot-off' &&
      action !== 'cancel-timed-target' &&
      action !== 'record-timed-target-unload'
    ) {
      this.assertSafetyAllows(action);
    }
    const interruption = this.interruptionControl?.get(competitionId);
    if (interruption) {
      if (action === 'timer-expired') return;
      if (action !== 'stop-shoot-off' && action !== 'cancel-timed-target' && action !== 'record-timed-target-unload') {
        throw laneInterruptedError(interruption.interruptionId, action);
      }
    }

    switch (action) {
      case 'start-sighting': {
        await this.waitUntil(command.timerStartAt as string);
        this.assertSafetyAllows(action);
        const state = await this.requireCompetition(competitionId);
        if (state.phase === 'IDLE') {
          await this.commandBus.execute(StartStageToken, { competitionId });
          await this.startTimer(command, competitionId);
          break;
        }

        // A retry must never invoke StartStage on an ACTIVE competition: that
        // command intentionally rotates the session and resets the Lane to IDLE.
        // Restart the shared sighting timer only while the Lane is still in the
        // sighting stage; later states mean this operation has been superseded.
        if (this.isSightingStage(state) && state.phase === 'ACTIVE') {
          await this.startTimer(command, competitionId);
        }
        break;
      }

      case 'end-sighting': {
        const state = await this.requireCompetition(competitionId);
        if (this.isSightingStage(state) && state.phase === 'ACTIVE') {
          await this.commandBus.execute(EndStageToken, { competitionId });
          break;
        }
        if (state.phase === 'IDLE') {
          throw this.invalidState(action, state, 'an active or completed sighting stage');
        }
        // SERIES_COMPLETE in the sighting stage, or any later scored stage,
        // means the transition was already applied.
        break;
      }

      case 'start-match': {
        await this.waitUntil(command.timerStartAt as string);
        this.assertSafetyAllows(action);
        const state = await this.requireCompetition(competitionId);
        const matchStageIndex = this.firstScoredStageIndex(state);
        if (matchStageIndex < 0) {
          throw this.invalidState(action, state, 'a configured scored stage');
        }
        const matchStage = state.config.stages[matchStageIndex]!;
        const independentlyTimed = matchStage.series.some((series) => series.timedTargetProgramId !== undefined);
        const genericDuration = command.timerDurationSeconds as number | undefined;
        if (independentlyTimed && genericDuration !== undefined) {
          throw new Error('A timed-target match must not use a generic MATCH timer');
        }
        if (!independentlyTimed && genericDuration === undefined) {
          throw new Error('A conventional match requires timerDurationSeconds');
        }

        if (state.currentStageIndex < matchStageIndex) {
          if (!this.isSightingStage(state) || state.phase !== 'SERIES_COMPLETE') {
            throw this.invalidState(action, state, 'a completed sighting stage');
          }
          await this.commandBus.execute(AdvanceStageToken, { competitionId });
          await this.commandBus.execute(StartNextSeriesToken, { competitionId });
          await this.startTimer(command, competitionId);
          break;
        }

        if (
          state.currentStageIndex === matchStageIndex &&
          state.currentSeriesIndex === 0 &&
          (state.phase === 'STAGE_ENTERED' || state.phase === 'SERIES_ENTERED')
        ) {
          // AdvanceStage succeeded but StartNextSeries did not. Resume only the
          // missing half of the transition.
          await this.commandBus.execute(StartNextSeriesToken, { competitionId });
          await this.startTimer(command, competitionId);
          break;
        }

        if (state.currentStageIndex === matchStageIndex && state.currentSeriesIndex === 0 && state.phase === 'ACTIVE') {
          await this.startTimer(command, competitionId);
        }
        // A Lane already beyond the first match series has also completed this
        // operation; do not rewind it or restart its timer.
        break;
      }

      case 'advance-series': {
        const state = await this.requireCompetition(competitionId);
        if (state.phase === 'FINISHED') break;
        const stageIndex = command.stageIndex as number;
        const fromSeriesIndex = command.fromSeriesIndex as number;
        const resumeOnly = command.resumeOnly === true;
        const sourceStage = state.config.stages[stageIndex];
        if (!sourceStage?.series[fromSeriesIndex]) {
          throw this.invalidState(action, state, `existing series ${stageIndex}:${fromSeriesIndex}`);
        }

        const sourceComparison = this.comparePosition(state, stageIndex, fromSeriesIndex);
        if (sourceComparison < 0) {
          throw this.invalidState(action, state, `series ${stageIndex}:${fromSeriesIndex}`);
        }
        if (resumeOnly && sourceComparison > 0) break;
        if (resumeOnly && sourceComparison === 0 && state.phase === 'ACTIVE') break;
        if (sourceComparison === 0 && (state.phase === 'SERIES_ENTERED' || state.phase === 'STAGE_ENTERED')) {
          // Every Lane may already have persisted the destination, including the
          // final series where there is no further position. Resume the missing
          // StartNextSeries step at the current position.
          await this.startNextSeries(command, competitionId);
          break;
        }
        if (resumeOnly) break;

        const nextPosition = this.getNextPosition(state, stageIndex, fromSeriesIndex);
        if (!nextPosition) {
          throw this.invalidState(action, state, `a series after ${stageIndex}:${fromSeriesIndex}`);
        }
        if (sourceComparison > 0) {
          if (
            state.currentStageIndex === nextPosition.stageIndex &&
            state.currentSeriesIndex === nextPosition.seriesIndex &&
            (state.phase === 'SERIES_ENTERED' || state.phase === 'STAGE_ENTERED')
          ) {
            // AdvanceStage persisted, but StartNextSeries failed. Complete the
            // second half without advancing again.
            await this.startNextSeries(command, competitionId);
          }
          // At the expected destination or later, the command is already done.
          break;
        }
        if (state.phase !== 'SERIES_COMPLETE') {
          throw this.invalidState(action, state, `completed series ${stageIndex}:${fromSeriesIndex}`);
        }

        await this.commandBus.execute(AdvanceStageToken, { competitionId });
        await this.startNextSeries(command, competitionId);
        break;
      }

      case 'finish-competition': {
        try {
          await this.commandBus.execute(FinishCompetitionToken, { competitionId });
        } catch (error) {
          if ((error as { code?: string }).code !== 'COMPETITION_ALREADY_FINISHED') throw error;
        }
        // A finished competition is no longer returned by findActive(). Publish
        // by ID and wait for both retained snapshots before acknowledging so the
        // Director cannot save and clear stale result data.
        const finalSnapshotCommandId = command.commandId as string;
        await Promise.all([
          this.competitionStatePublisher.publishCurrentState(competitionId, finalSnapshotCommandId),
          this.scorePublisher.publishCurrentScore(competitionId, finalSnapshotCommandId),
        ]);
        break;
      }

      case 'timer-started':
        if ((await this.requireCompetition(competitionId)).phase === 'FINISHED') break;
        this.assertSafetyAllows(action);
        await this.timerService.startAt(
          competitionId,
          command.timerStartAt as string,
          command.timerDurationSeconds as number,
        );
        break;

      case 'timer-expired':
        if ((await this.requireCompetition(competitionId)).phase === 'FINISHED') break;
        await this.timerService.expire(competitionId);
        break;

      case 'start-shoot-off': {
        const competition = await this.requireCompetition(competitionId);
        if (competition.config.name !== 'Final' || competition.phase !== 'SERIES_COMPLETE') {
          throw this.invalidState(action, competition, 'a completed Final series');
        }
        const timedTarget = command.timedTarget as
          { programId: string; participantExecution: 'SIMULTANEOUS' | 'SEQUENTIAL' } | undefined;
        let timerStartAt = command.timerStartAt as string;
        let timerDurationSeconds = command.timerDurationSeconds as number | undefined;
        let timedSequenceId: string | null = null;

        if (timedTarget) {
          const program = competition.config.timedTarget?.programs.find(
            (candidate) => candidate.id === timedTarget.programId && candidate.purpose === 'SHOOT_OFF',
          );
          if (!program) throw new Error(`Shoot-off timed target program ${timedTarget.programId} is unavailable`);
          const programShots = program.exposures.reduce((sum, exposure) => sum + exposure.maximumShots, 0);
          if (programShots !== command.shotsPerLane) {
            throw new Error(`Shoot-off timed target program ${program.id} requires ${programShots} shots`);
          }
          const targetLaneIds = command.targetLaneIds as string[];
          const laneIndex = targetLaneIds.indexOf(this.getLaneId());
          if (laneIndex < 0) throw new Error(`Lane ${this.getLaneId()} has no shoot-off schedule`);
          const programDurationMilliseconds = timedTargetProgramDurationMilliseconds(program);
          const sequentialOffsetMilliseconds =
            timedTarget.participantExecution === 'SEQUENTIAL'
              ? laneIndex * (programDurationMilliseconds + program.minimumPauseAfterSeconds * 1_000)
              : 0;
          const loadAt = new Date(Date.parse(timerStartAt) + sequentialOffsetMilliseconds);
          timerStartAt = loadAt.toISOString();
          timerDurationSeconds = Math.ceil(programDurationMilliseconds / 1_000);
          const targetProfileId = competition.currentStageConfig.targetProfileId ?? competition.config.targetProfileId;
          if (!targetProfileId) throw new Error('Timed target Final stage has no target scoring profile');
          this.assertSafetyAllows(action);
          const timedState = this.requireTimedTargetControl().start({
            sequenceId: command.commandId as string,
            competitionId,
            program,
            stageIndex: competition.currentStageIndex,
            seriesIndex: competition.currentSeriesIndex,
            targetProfileId,
            loadAt,
          });
          timedSequenceId = timedState.sequenceId;
        } else {
          await this.waitUntil(timerStartAt);
        }
        if (timerDurationSeconds === undefined) throw new Error('Shoot-off duration is unavailable');
        // The competition lookup yields. Recheck the independent safety latch
        // immediately before the synchronous window write so a concurrent STOP
        // can never be followed by a newly opened shoot-off window.
        try {
          this.assertSafetyAllows(action);
          const state = this.requireShootOffControl().open({
            competitionId,
            runId: command.runId as string,
            iteration: command.iteration as number,
            timerStartAt,
            timerDurationSeconds,
            shotsPerLane: command.shotsPerLane as number,
            ...(timedTarget ? { timedTargetProgramId: timedTarget.programId } : {}),
          });
          if (state.status !== 'OPEN' && state.status !== 'COMPLETE') {
            throw new Error(`Unexpected shoot-off window state: ${String(state.status)}`);
          }
        } catch (error) {
          if (timedSequenceId) {
            this.requireTimedTargetControl().cancel({
              sequenceId: timedSequenceId,
              reason: 'Shoot-off acquisition window could not be opened',
            });
          }
          throw error;
        }
        break;
      }

      case 'stop-shoot-off': {
        this.requireShootOffControl().close(competitionId, command.runId as string, command.iteration as number);
        const timedState = this.timedTargetControl?.getState(competitionId);
        if (
          timedState?.purpose === 'SHOOT_OFF' &&
          timedState.phase !== 'COMPLETE' &&
          timedState.phase !== 'CANCELLED'
        ) {
          this.timedTargetControl?.cancel({
            sequenceId: timedState.sequenceId,
            reason: 'Shoot-off firing was closed by the Director',
          });
        }
        break;
      }

      case 'start-timed-target': {
        const competition = await this.requireCompetition(competitionId);
        if (
          competition.phase !== 'ACTIVE' ||
          competition.currentStageIndex !== command.stageIndex ||
          competition.currentSeriesIndex !== command.seriesIndex
        ) {
          throw this.invalidState(action, competition, `active series ${command.stageIndex}:${command.seriesIndex}`);
        }
        const purpose = command.purpose as 'SIGHTING' | 'MATCH';
        const expectedProgramId =
          purpose === 'SIGHTING'
            ? competition.currentStageConfig.sightingTimedTargetProgramId
            : competition.currentSeriesConfig.timedTargetProgramId;
        if (!expectedProgramId || expectedProgramId !== command.programId) {
          throw new Error(
            `Timed target program ${String(command.programId)} is not configured for ${purpose} at ${competition.currentStageIndex}:${competition.currentSeriesIndex}`,
          );
        }
        const program = competition.config.timedTarget?.programs.find(
          (candidate) => candidate.id === expectedProgramId,
        );
        if (!program || program.purpose !== purpose) {
          throw new Error(`Timed target program ${expectedProgramId} is unavailable`);
        }
        const targetProfileId = competition.currentStageConfig.targetProfileId ?? competition.config.targetProfileId;
        if (!targetProfileId) throw new Error('Timed target stage has no target scoring profile');
        // The repository lookup above yields. Recheck the independent safety
        // latch immediately before arming the authoritative schedule.
        this.assertSafetyAllows(action);
        this.requireTimedTargetControl().start({
          sequenceId: command.commandId as string,
          competitionId,
          program,
          stageIndex: competition.currentStageIndex,
          seriesIndex: competition.currentSeriesIndex,
          targetProfileId,
          loadAt: new Date(command.loadAt as string),
        });
        break;
      }

      case 'record-timed-target-unload': {
        const control = this.requireTimedTargetControl();
        const current = control.getState(competitionId);
        if (!current || current.sequenceId !== command.sequenceId) throw new Error('UNLOAD sequence is not current');
        if (!control.recordUnload) throw new Error('UNLOAD recording is unavailable');
        control.recordUnload({
          observationId: command.commandId as string,
          sequenceId: command.sequenceId as string,
          occurredAt: new Date(command.observedAt as string),
          officialName: command.officialName as string,
        });
        break;
      }

      case 'cancel-timed-target': {
        const control = this.requireTimedTargetControl();
        const current = control.getState(competitionId);
        if (!current || current.sequenceId !== command.sequenceId) {
          throw new Error(`Timed target sequence ${String(command.sequenceId)} is not current`);
        }
        if (current.phase !== 'COMPLETE' && current.phase !== 'CANCELLED') {
          control.cancel({ sequenceId: current.sequenceId, reason: command.reason as string });
        }
        break;
      }
    }
  }

  private requireTimedTargetControl(): ITimedTargetControl {
    if (!this.timedTargetControl) throw new Error('Lane timed target control is unavailable');
    return this.timedTargetControl;
  }

  private requireShootOffControl(): ICompetitionShootOffControl {
    if (!this.shootOffControl) throw new Error('Lane shoot-off control is unavailable');
    return this.shootOffControl;
  }

  private async requireCompetition(competitionId: string): Promise<CompetitionState> {
    const state = await this.competitionRepository.findById(competitionId);
    if (!state) throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: competitionId });
    return state;
  }

  private isSightingStage(state: CompetitionState): boolean {
    return state.currentStageIndex < this.firstScoredStageIndex(state);
  }

  private firstScoredStageIndex(state: CompetitionState): number {
    return state.config.stages.findIndex((stage) => stage.scored);
  }

  private comparePosition(state: CompetitionState, stageIndex: number, seriesIndex: number): number {
    if (state.currentStageIndex !== stageIndex) return state.currentStageIndex - stageIndex;
    return state.currentSeriesIndex - seriesIndex;
  }

  private getNextPosition(
    state: CompetitionState,
    stageIndex: number,
    seriesIndex: number,
  ): { stageIndex: number; seriesIndex: number } | null {
    const stage = state.config.stages[stageIndex];
    if (!stage || !stage.series[seriesIndex]) {
      throw this.invalidState('advance-series', state, `existing series ${stageIndex}:${seriesIndex}`);
    }
    if (seriesIndex + 1 < stage.series.length) return { stageIndex, seriesIndex: seriesIndex + 1 };
    if (stageIndex + 1 < state.config.stages.length) return { stageIndex: stageIndex + 1, seriesIndex: 0 };
    return null;
  }

  private startTimer(command: Record<string, unknown>, competitionId: string): Promise<void> {
    const durationSeconds = command.timerDurationSeconds as number | undefined;
    if (durationSeconds === undefined) return Promise.resolve();
    this.assertSafetyAllows('timer-started');
    return this.timerService.startAt(competitionId, command.timerStartAt as string, durationSeconds);
  }

  private async startNextSeries(command: Record<string, unknown>, competitionId: string): Promise<void> {
    const timerStartAt = command.timerStartAt as string | undefined;
    if (timerStartAt) await this.waitUntil(timerStartAt);
    this.assertSafetyAllows('advance-series');
    await this.commandBus.execute(StartNextSeriesToken, { competitionId });
    const timerDurationSeconds = command.timerDurationSeconds as number | undefined;
    if (timerStartAt && timerDurationSeconds) {
      await this.timerService.startAt(competitionId, timerStartAt, timerDurationSeconds);
    }
  }

  private invalidState(action: BroadcastAction, state: CompetitionState, expected: string): Error {
    return ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
      detail: `${action} requires ${expected}; current state is ${state.phase} at ${state.currentStageIndex}:${state.currentSeriesIndex}`,
    });
  }

  private assertSafetyAllows(action: BroadcastAction): void {
    if (!this.safetyStopControl?.isStopped()) return;
    const safetyStopId = this.safetyStopControl.getState()?.safetyStopId ?? 'unknown';
    throw new Error(`Safety stop ${safetyStopId} is active; ${action} is blocked`);
  }

  private async waitUntil(absoluteTime: string): Promise<void> {
    const delayMs = new Date(absoluteTime).getTime() - Date.now();
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Publishes an ACK
   */
  private async publishAck(
    topic: string,
    commandId: string,
    status: CommandAckPayload['status'],
    errorCode?: string,
    errorMessage?: string,
    warning?: string,
  ): Promise<void> {
    const ack: CommandAckPayload = {
      commandId,
      laneId: this.getLaneId(),
      status,
      acknowledgedAt: new Date().toISOString(),
      ...(errorCode && errorMessage ? { error: { code: errorCode, message: errorMessage } } : {}),
      ...(warning ? { warning } : {}),
    };

    try {
      await this.mqttClient.publish(topic, JSON.stringify(ack), { qos: 1, retain: false });
    } catch (err) {
      getLogger().error('[BroadcastCommandHandler] Failed to publish ACK', 'mqtt', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function laneInterruptedError(interruptionId: string, action: BroadcastAction): Error {
  const error = new Error(`Cannot apply ${action} while Lane interruption ${interruptionId} is active`);
  (error as Error & { code: string }).code = 'MQTT_LANE_INTERRUPTED';
  return error;
}
