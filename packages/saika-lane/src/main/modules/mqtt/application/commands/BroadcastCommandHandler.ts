// SPDX-License-Identifier: MIT
/** Handles competition-wide commands and acknowledges executing, done, or error states. */

import { commandSchemasForScope, type MqttCommandActionOf } from '@sasakiuri/saika-protocol/commands';
import { mqttTopicFilters, mqttTopics, parseMqttTopic, type ParsedMqttTopicOf } from '@sasakiuri/saika-protocol/topics';

import {
  AdvanceStageToken,
  EndStageToken,
  FinishCompetitionToken,
  StartNextSeriesToken,
  StartStageToken,
} from '@/main/composition/tokens';
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionTimer } from '@/main/modules/competition/domain/ICompetitionTimer';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import { TopicSubscription } from '@/main/modules/mqtt/application/TopicSubscription';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { laneCommandSchemas } from '@/main/modules/mqtt/domain/MqttCommandSchemas';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ITimedTargetControl } from '@/main/modules/timed-target';
import { timedTargetProgramDurationMilliseconds } from '@/main/modules/timed-target/domain/TimedTargetSchedule';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { codedError } from '@/shared/errors/codedError';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import {
  laneCommandTable,
  type CommandPreparation,
  type LaneCommandArgs,
  type LaneCommandProcessor,
  type ReceivedLaneCommandArgs,
} from './LaneCommandProcessor';

const CLOCK_DRIFT_WARNING_THRESHOLD_MS = 5_000;
const CLOCK_DRIFT_REJECT_THRESHOLD_MS = 30_000;

/** What an active latch does to a command before it runs: reject it, run it, or acknowledge it without effect. */
type ActiveLatchPolicy = 'block' | 'run' | 'ignore';

interface BroadcastCommandPolicy {
  readonly requiresReady: true;
  /** Lanes missing from the command's `targetLaneIds` skip it without acknowledging. */
  readonly targeted: boolean;
  /** The command carries a Director timer, so Director clock drift is warned about or rejected. */
  readonly timer: boolean;
  readonly whileSafetyStopped: ActiveLatchPolicy;
  /** A blocked `advance-series` may still continue the interrupted stage. */
  readonly whileInterrupted: ActiveLatchPolicy;
}

const BROADCAST_POLICIES = {
  'start-sighting': {
    requiresReady: true,
    targeted: true,
    timer: true,
    whileSafetyStopped: 'block',
    whileInterrupted: 'block',
  },
  'end-sighting': {
    requiresReady: true,
    targeted: false,
    timer: false,
    whileSafetyStopped: 'run',
    whileInterrupted: 'block',
  },
  'start-match': {
    requiresReady: true,
    targeted: false,
    timer: true,
    whileSafetyStopped: 'block',
    whileInterrupted: 'block',
  },
  'advance-series': {
    requiresReady: true,
    targeted: false,
    timer: false,
    whileSafetyStopped: 'block',
    whileInterrupted: 'block',
  },
  'finish-competition': {
    requiresReady: true,
    targeted: false,
    timer: false,
    whileSafetyStopped: 'run',
    whileInterrupted: 'block',
  },
  'timer-started': {
    requiresReady: true,
    targeted: false,
    timer: true,
    whileSafetyStopped: 'block',
    whileInterrupted: 'block',
  },
  'timer-expired': {
    requiresReady: true,
    targeted: false,
    timer: false,
    whileSafetyStopped: 'ignore',
    whileInterrupted: 'ignore',
  },
  'start-shoot-off': {
    requiresReady: true,
    targeted: true,
    timer: true,
    whileSafetyStopped: 'block',
    whileInterrupted: 'block',
  },
  'stop-shoot-off': {
    requiresReady: true,
    targeted: true,
    timer: false,
    whileSafetyStopped: 'run',
    whileInterrupted: 'run',
  },
  'start-timed-target': {
    requiresReady: true,
    targeted: true,
    timer: true,
    whileSafetyStopped: 'block',
    whileInterrupted: 'block',
  },
  'cancel-timed-target': {
    requiresReady: true,
    targeted: true,
    timer: false,
    whileSafetyStopped: 'run',
    whileInterrupted: 'run',
  },
  'record-timed-target-unload': {
    requiresReady: true,
    targeted: true,
    timer: false,
    whileSafetyStopped: 'run',
    whileInterrupted: 'run',
  },
} as const satisfies Record<MqttCommandActionOf<'competition'>, BroadcastCommandPolicy>;

export const BROADCAST_COMMANDS = laneCommandTable(
  commandSchemasForScope(laneCommandSchemas, 'competition'),
  BROADCAST_POLICIES,
);

type BroadcastCommand = LaneCommandArgs<typeof BROADCAST_COMMANDS>;
type ReceivedBroadcastCommand = ReceivedLaneCommandArgs<typeof BROADCAST_COMMANDS>;
type BroadcastAction = BroadcastCommand[0];

type BroadcastTopic = ParsedMqttTopicOf<'competitionCommand'>;

/** The Director timer fields a start command carries. */
interface DirectorTimer {
  timerStartAt: string;
  timerDurationSeconds?: number | undefined;
}

export interface BroadcastCommandHandlerDeps {
  mqttClient: IMqttClientService;
  processor: LaneCommandProcessor;
  commandBus: CommandBus;
  timerService: Pick<ICompetitionTimer, 'startAt' | 'expire'>;
  competitionRepository: ICompetitionRepository;
  competitionStatePublisher: Pick<LaneCompetitionStatePublisher, 'publishCurrentState'>;
  scorePublisher: Pick<LaneScorePublisher, 'publishCurrentScore'>;
  getLaneId: () => string;
  interruptionControl: ICompetitionInterruptionControl;
  safetyStopControl: Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>;
  shootOffControl: ICompetitionShootOffControl;
  timedTargetControl: ITimedTargetControl;
}

export class BroadcastCommandHandler {
  private readonly subscription: TopicSubscription;

  constructor(private readonly deps: BroadcastCommandHandlerDeps) {
    this.subscription = new TopicSubscription(deps.mqttClient, {
      listenBeforeSubscribe: false,
      unsubscribeErrors: 'rethrow-while-connected',
    });
  }

  /**
   * Subscribes to competition broadcast commands
   */
  async subscribeToCompetition(competitionId: string): Promise<void> {
    await this.unsubscribeFromCompetition();

    await this.subscription.open(mqttTopicFilters.competitionCommands(competitionId), (msgTopic, payload) => {
      const parsed = parseMqttTopic(msgTopic);
      if (parsed?.kind !== 'competitionCommand') return;

      void this.handleCommand(parsed, payload);
    });
  }

  /**
   * Unsubscribes from the competition
   */
  async unsubscribeFromCompetition(): Promise<void> {
    await this.subscription.close();
  }

  /**
   * Processes a command
   */
  private handleCommand(parsed: BroadcastTopic, payload: Buffer): Promise<void> {
    return this.deps.processor.handle({
      logContext: 'BroadcastCommandHandler',
      action: parsed.action,
      payload,
      commands: BROADCAST_COMMANDS,
      acknowledgementTopic: mqttTopics.competitionCommandAcknowledgement(
        parsed.competitionId,
        parsed.action,
        this.deps.getLaneId(),
      ),
      prepare: (...command) => this.prepareCommand(command),
      execute: (...received) => this.executeAction(received, parsed.competitionId),
    });
  }

  private prepareCommand([action, command]: BroadcastCommand): CommandPreparation {
    const logger = getLogger();
    const { commandId } = command;
    const policy = BROADCAST_COMMANDS[action];
    // Targeted broadcast commands are ACKed only by their intended Lanes.
    if (policy.targeted) {
      const targetLaneIds = 'targetLaneIds' in command ? command.targetLaneIds : undefined;
      if (targetLaneIds && !targetLaneIds.includes(this.deps.getLaneId())) {
        logger.info(`[BroadcastCommandHandler] Lane ${this.deps.getLaneId()} not in targetLaneIds, skipping`, 'mqtt');
        return { skip: true };
      }
    }

    // Clock drift check (timer-related actions only)
    let warning: string | undefined;
    if (policy.timer) {
      const { issuedAt } = command;
      if (issuedAt) {
        const drift = Math.abs(Date.now() - new Date(issuedAt).getTime());
        if (drift > CLOCK_DRIFT_REJECT_THRESHOLD_MS) {
          const error = ErrorCatalog.createError('MQTT_CLOCK_OUT_OF_SYNC', { driftMs: drift });
          logger.error(`[BroadcastCommandHandler] Clock out of sync: driftMs=${drift}`, 'mqtt', { commandId, action });
          throw error;
        } else if (drift > CLOCK_DRIFT_WARNING_THRESHOLD_MS) {
          warning = 'clock_drift_detected';
          logger.warn(`[BroadcastCommandHandler] Clock drift detected: driftMs=${drift}`, 'mqtt', {
            commandId,
            action,
          });
        }
      }
    }

    return { warning };
  }

  /**
   * Executes an action
   */
  private async executeAction([action, command]: ReceivedBroadcastCommand, competitionId: string): Promise<void> {
    const policy = BROADCAST_COMMANDS[action];
    if (policy.whileSafetyStopped === 'ignore' && this.deps.safetyStopControl.isStopped()) return;
    if (policy.whileSafetyStopped === 'block') this.assertSafetyAllows(action);
    const interruption = this.deps.interruptionControl.get(competitionId);
    if (interruption && policy.whileInterrupted !== 'run') {
      if (policy.whileInterrupted === 'ignore') return;
      const state = action === 'advance-series' ? await this.requireCompetition(competitionId) : null;
      const continuingStage =
        action === 'advance-series' &&
        state !== null &&
        state.usesStageTimer &&
        state.canUpdateTimer() &&
        (state.phase === 'SERIES_COMPLETE' || state.phase === 'SERIES_ENTERED') &&
        command.stageIndex === state.currentStageIndex &&
        command.timerStartAt === undefined &&
        command.timerDurationSeconds === undefined &&
        (interruption.status === 'SIGHTING' || interruption.status === 'RUNNING_MATCH') &&
        (state.phase === 'SERIES_ENTERED' ||
          command.resumeOnly === true ||
          state.currentSeriesIndex + 1 < state.currentStageConfig.series.length);
      if (!continuingStage) throw laneInterruptedError(interruption.interruptionId, action);
    }

    switch (action) {
      case 'start-sighting': {
        await this.waitUntil(command.timerStartAt);
        this.assertSafetyAllows(action);
        const state = await this.requireCompetition(competitionId);
        if (state.phase === 'IDLE') {
          await this.deps.commandBus.execute(StartStageToken, { competitionId });
          await this.startTimer(command, competitionId);
          break;
        }

        // A retry must never invoke StartStage on an ACTIVE competition: that
        // command rotates the session and resets the Lane to IDLE.
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
          await this.deps.commandBus.execute(EndStageToken, { competitionId });
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
        await this.waitUntil(command.timerStartAt);
        this.assertSafetyAllows(action);
        const state = await this.requireCompetition(competitionId);
        const matchStageIndex = this.firstScoredStageIndex(state);
        if (matchStageIndex < 0) {
          throw this.invalidState(action, state, 'a configured scored stage');
        }
        const matchStage = state.config.stages[matchStageIndex]!;
        const independentlyTimed = matchStage.series.some((series) => series.timedTargetProgramId !== undefined);
        const genericDuration = command.timerDurationSeconds;
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
          await this.deps.commandBus.execute(AdvanceStageToken, { competitionId });
          await this.deps.commandBus.execute(StartNextSeriesToken, { competitionId });
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
          await this.deps.commandBus.execute(StartNextSeriesToken, { competitionId });
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
        const { stageIndex, fromSeriesIndex } = command;
        const resumeOnly = command.resumeOnly === true;
        const sourceStage = state.config.stages[stageIndex];
        if (!sourceStage?.series[fromSeriesIndex]) {
          throw this.invalidState(action, state, `existing series ${stageIndex}:${fromSeriesIndex}`);
        }

        const sourceComparison = state.comparePosition(stageIndex, fromSeriesIndex);
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

        await this.deps.commandBus.execute(AdvanceStageToken, { competitionId });
        await this.startNextSeries(command, competitionId);
        break;
      }

      case 'finish-competition': {
        try {
          await this.deps.commandBus.execute(FinishCompetitionToken, { competitionId });
        } catch (error) {
          if ((error as { code?: string }).code !== 'COMPETITION_ALREADY_FINISHED') throw error;
        }
        // A finished competition is no longer returned by findActive(). Publish
        // by ID and wait for both retained snapshots before acknowledging so the
        // Director cannot save and clear stale result data.
        const finalSnapshotCommandId = command.commandId;
        await Promise.all([
          this.deps.competitionStatePublisher.publishCurrentState(competitionId, finalSnapshotCommandId),
          this.deps.scorePublisher.publishCurrentScore(competitionId, finalSnapshotCommandId),
        ]);
        break;
      }

      case 'timer-started':
        if ((await this.requireCompetition(competitionId)).phase === 'FINISHED') break;
        this.assertSafetyAllows(action);
        await this.deps.timerService.startAt(competitionId, command.timerStartAt, command.timerDurationSeconds);
        break;

      case 'timer-expired':
        if ((await this.requireCompetition(competitionId)).phase === 'FINISHED') break;
        await this.deps.timerService.expire(competitionId);
        break;

      case 'start-shoot-off': {
        const competition = await this.requireCompetition(competitionId);
        if (competition.config.name !== 'Final' || competition.phase !== 'SERIES_COMPLETE') {
          throw this.invalidState(action, competition, 'a completed Final series');
        }
        const { timedTarget } = command;
        let { timerStartAt, timerDurationSeconds } = command;
        let timedSequenceId: string | null = null;

        if (timedTarget) {
          // Program ids are unique within a round, so the id lookup finds the only candidate.
          const candidate = competition.timedTargetProgram(timedTarget.programId);
          const program = candidate?.purpose === 'SHOOT_OFF' ? candidate : undefined;
          if (!program) throw new Error(`Shoot-off timed target program ${timedTarget.programId} is unavailable`);
          const programShots = program.exposures.reduce((sum, exposure) => sum + exposure.maximumShots, 0);
          if (programShots !== command.shotsPerLane) {
            throw new Error(`Shoot-off timed target program ${program.id} requires ${programShots} shots`);
          }
          const laneIndex = command.targetLaneIds.indexOf(this.deps.getLaneId());
          if (laneIndex < 0) throw new Error(`Lane ${this.deps.getLaneId()} has no shoot-off schedule`);
          const programDurationMilliseconds = timedTargetProgramDurationMilliseconds(program);
          const sequentialOffsetMilliseconds =
            timedTarget.participantExecution === 'SEQUENTIAL'
              ? laneIndex * (programDurationMilliseconds + program.minimumPauseAfterSeconds * 1_000)
              : 0;
          const loadAt = new Date(Date.parse(timerStartAt) + sequentialOffsetMilliseconds);
          timerStartAt = loadAt.toISOString();
          timerDurationSeconds = Math.ceil(programDurationMilliseconds / 1_000);
          const targetProfileId = competition.effectiveTargetProfileId;
          if (!targetProfileId) throw new Error('Timed target Final stage has no target scoring profile');
          this.assertSafetyAllows(action);
          const timedState = this.deps.timedTargetControl.start({
            sequenceId: command.commandId,
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
          const state = this.deps.shootOffControl.open({
            competitionId,
            runId: command.runId,
            iteration: command.iteration,
            timerStartAt,
            timerDurationSeconds,
            shotsPerLane: command.shotsPerLane,
            ...(timedTarget ? { timedTargetProgramId: timedTarget.programId } : {}),
          });
          if (state.status !== 'OPEN' && state.status !== 'COMPLETE') {
            throw new Error(`Unexpected shoot-off window state: ${String(state.status)}`);
          }
        } catch (error) {
          if (timedSequenceId) {
            this.deps.timedTargetControl.cancel({
              sequenceId: timedSequenceId,
              reason: 'Shoot-off acquisition window could not be opened',
            });
          }
          throw error;
        }
        break;
      }

      case 'stop-shoot-off': {
        this.deps.shootOffControl.close(competitionId, command.runId, command.iteration);
        const timedState = this.deps.timedTargetControl.getState(competitionId);
        if (
          timedState?.purpose === 'SHOOT_OFF' &&
          timedState.phase !== 'COMPLETE' &&
          timedState.phase !== 'CANCELLED'
        ) {
          this.deps.timedTargetControl.cancel({
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
        const { purpose } = command;
        const expectedProgramId =
          purpose === 'SIGHTING'
            ? competition.currentStageConfig.sightingTimedTargetProgramId
            : competition.currentSeriesConfig.timedTargetProgramId;
        if (!expectedProgramId || expectedProgramId !== command.programId) {
          throw new Error(
            `Timed target program ${String(command.programId)} is not configured for ${purpose} at ${competition.currentStageIndex}:${competition.currentSeriesIndex}`,
          );
        }
        const program = competition.timedTargetProgram(expectedProgramId);
        if (!program || program.purpose !== purpose) {
          throw new Error(`Timed target program ${expectedProgramId} is unavailable`);
        }
        const targetProfileId = competition.effectiveTargetProfileId;
        if (!targetProfileId) throw new Error('Timed target stage has no target scoring profile');
        // The repository lookup above yields. Recheck the independent safety
        // latch immediately before arming the authoritative schedule.
        this.assertSafetyAllows(action);
        this.deps.timedTargetControl.start({
          sequenceId: command.commandId,
          competitionId,
          program,
          stageIndex: competition.currentStageIndex,
          seriesIndex: competition.currentSeriesIndex,
          targetProfileId,
          loadAt: new Date(command.loadAt),
        });
        break;
      }

      case 'record-timed-target-unload': {
        const control = this.deps.timedTargetControl;
        const current = control.getState(competitionId);
        if (!current || current.sequenceId !== command.sequenceId) throw new Error('UNLOAD sequence is not current');
        if (!control.recordUnload) throw new Error('UNLOAD recording is unavailable');
        control.recordUnload({
          observationId: command.commandId,
          sequenceId: command.sequenceId,
          occurredAt: new Date(command.observedAt),
          officialName: command.officialName,
        });
        break;
      }

      case 'cancel-timed-target': {
        const control = this.deps.timedTargetControl;
        const current = control.getState(competitionId);
        if (!current || current.sequenceId !== command.sequenceId) {
          throw new Error(`Timed target sequence ${String(command.sequenceId)} is not current`);
        }
        if (current.phase !== 'COMPLETE' && current.phase !== 'CANCELLED') {
          control.cancel({ sequenceId: current.sequenceId, reason: command.reason });
        }
        break;
      }
    }
  }

  private async requireCompetition(competitionId: string): Promise<CompetitionState> {
    const state = await this.deps.competitionRepository.findById(competitionId);
    if (!state) throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: competitionId });
    return state;
  }

  private isSightingStage(state: CompetitionState): boolean {
    return state.currentStageIndex < this.firstScoredStageIndex(state);
  }

  private firstScoredStageIndex(state: CompetitionState): number {
    return state.config.stages.findIndex((stage) => stage.scored);
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

  private startTimer(command: DirectorTimer, competitionId: string): Promise<void> {
    const durationSeconds = command.timerDurationSeconds;
    if (durationSeconds === undefined) return Promise.resolve();
    this.assertSafetyAllows('timer-started');
    return this.deps.timerService.startAt(competitionId, command.timerStartAt, durationSeconds);
  }

  private async startNextSeries(command: Partial<DirectorTimer>, competitionId: string): Promise<void> {
    const { timerStartAt } = command;
    if (timerStartAt) await this.waitUntil(timerStartAt);
    this.assertSafetyAllows('advance-series');
    await this.deps.commandBus.execute(StartNextSeriesToken, { competitionId });
    const { timerDurationSeconds } = command;
    if (timerStartAt && timerDurationSeconds) {
      await this.deps.timerService.startAt(competitionId, timerStartAt, timerDurationSeconds);
    }
  }

  private invalidState(action: BroadcastAction, state: CompetitionState, expected: string): Error {
    return ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
      detail: `${action} requires ${expected}; current state is ${state.phase} at ${state.currentStageIndex}:${state.currentSeriesIndex}`,
    });
  }

  private assertSafetyAllows(action: BroadcastAction): void {
    if (!this.deps.safetyStopControl.isStopped()) return;
    const safetyStopId = this.deps.safetyStopControl.getState()?.safetyStopId ?? 'unknown';
    throw new Error(`Safety stop ${safetyStopId} is active; ${action} is blocked`);
  }

  private async waitUntil(absoluteTime: string): Promise<void> {
    const delayMs = new Date(absoluteTime).getTime() - Date.now();
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function laneInterruptedError(interruptionId: string, action: BroadcastAction): Error {
  return codedError(
    'MQTT_LANE_INTERRUPTED',
    `Cannot apply ${action} while Lane interruption ${interruptionId} is active`,
  );
}
