// SPDX-License-Identifier: MIT
import { ProbeClockCommandSchema } from '@sasakiuri/saika-protocol/commands';
import type { FinalFiringTransportInput } from '@/main/modules/final-recovery-firing';
import type { CompetitionStartIssue } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import { KeyedOperationQueue } from '@/main/shared-infra/operations/KeyedOperationQueue';
import { CompetitionCuePayloadSchema, type CompetitionCuePayload } from '@sasakiuri/saika-protocol/CompetitionCue';
import type { CompetitionStatePayload } from '@sasakiuri/saika-protocol/CompetitionState';
import type { Athlete } from '@sasakiuri/saika-protocol/LaneAssignment';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';
import type { ReserveLaneTransferAction } from '@sasakiuri/saika-protocol/ReserveLaneTransfer';
import { Logger } from '@/shared/logging';

import {
  ClockQualityPolicy,
  type ClockQualityAssessment,
  type IClockQualityPolicy,
} from '../domain/ClockQualityPolicy';
import type { FiringBoundarySignal } from '../domain/IFiringWindowJournal';
import type { IMqttTransport } from '../domain/IMqttTransport';
import type { LaneTimingEvidencePolicy } from '../domain/LaneTimingEvidencePolicy';
import type { ITimedTargetReadinessPolicy } from '../domain/TimedTargetReadinessPolicy';

import { CompetitionExpiryScheduler } from './CompetitionExpiryScheduler';
import { CompetitionFinishCommands } from './CompetitionFinishCommands';
import { CompetitionMembershipCommands } from './CompetitionMembershipCommands';
import { CompetitionStateRegistry } from './CompetitionStateRegistry';
import { CompetitionTimerCommands, type NextSeriesTimer } from './CompetitionTimerCommands';
import { createDirectorCommandPort, type DirectorCommandPort } from './DirectorCommandPort';
import { DirectorLaneReadiness } from './DirectorLaneReadiness';
import { DirectorMqttConnection } from './DirectorMqttConnection';
import { DirectorMqttReceiver } from './DirectorMqttReceiver';
import { DirectorMqttState } from './DirectorMqttState';
import { FinalCompetitionCommands } from './FinalCompetitionCommands';
import type {
  ApplyQualificationRecoveryInput,
  CancelQualificationRecoveryInput,
  CommandBatchResult,
  CommandExecutionResult,
  CompetitionResultLane,
  CreateCompetitionInput,
  DirectorLaneSnapshot,
  DirectorMqttCallbacks,
  DirectorMqttOptions,
  LaneClockProbeResult,
  MqttControlSnapshot,
  SettleQualificationRecoveryInput,
  ShootOffTiming,
  StartQualificationRecoveryInput,
} from './DirectorMqttTypes';
import { LaneHardwareMonitor } from './LaneHardwareMonitor';
import { MqttCommandDispatcher, type PublishCommandOptions } from './MqttCommandDispatcher';
import { QualificationRecoveryCommands } from './QualificationRecoveryCommands';
import { RangeInterruptionCommands } from './RangeInterruptionCommands';
import { RangeSafetyCommands } from './RangeSafetyCommands';
import { ReserveLaneTransferCommands } from './ReserveLaneTransferCommands';
import {
  TimedTargetCommands,
  type CancelTimedTargetInput,
  type RecordTimedTargetUnloadInput,
  type StartTimedTargetInput,
} from './TimedTargetCommands';

const logger = Logger.create('DirectorMqttService');

/**
 * Coordinates Director's MQTT control: wires the broker session to the read model, runs each control
 * workflow inside its operation queue and publishes the control snapshot.
 */
export class DirectorMqttService {
  private readonly transport: IMqttTransport;
  private readonly commands: DirectorCommandPort;
  private readonly callbacks: DirectorMqttCallbacks;
  private readonly connection: DirectorMqttConnection;
  private readonly receiver: DirectorMqttReceiver;
  private readonly state: DirectorMqttState;
  private readonly competitions: CompetitionStateRegistry;
  private readonly commandDispatcher: MqttCommandDispatcher;
  private lastCommand: CommandExecutionResult | null = null;
  private readonly hardwareMonitor: LaneHardwareMonitor;
  private readonly operations = new KeyedOperationQueue();
  private readonly expiry: CompetitionExpiryScheduler;
  private readonly readiness: DirectorLaneReadiness;
  private readonly membership: CompetitionMembershipCommands;
  private readonly timers: CompetitionTimerCommands;
  private readonly finish: CompetitionFinishCommands;
  private readonly qualificationRecovery: QualificationRecoveryCommands;
  private readonly safety: RangeSafetyCommands;
  private readonly interruptions: RangeInterruptionCommands;
  private readonly reserveTransfers: ReserveLaneTransferCommands;
  private readonly timedTargets: TimedTargetCommands;
  private readonly finals: FinalCompetitionCommands;

  constructor(
    options: DirectorMqttOptions,
    callbacks: DirectorMqttCallbacks = {},
    transport: IMqttTransport,
    clockQualityPolicy: IClockQualityPolicy = new ClockQualityPolicy(),
  ) {
    const commandTimeoutMs = options.commandTimeoutMs ?? 10_000;
    const startDelayMs = options.startDelayMs ?? 3_000;
    this.callbacks = callbacks;
    this.transport = transport;
    this.state = new DirectorMqttState(commandTimeoutMs, () => this.emitStateChanged());
    this.commandDispatcher = new MqttCommandDispatcher(transport, commandTimeoutMs, {
      onCompleted: (result) => this.setLastCommand(result),
      onProgress: () => this.emitStateChanged(),
      onError: (error) => this.handleError(error),
      onDebugLog: (message) => this.log(message),
    });
    this.hardwareMonitor = new LaneHardwareMonitor(this.state);
    this.expiry = new CompetitionExpiryScheduler({
      state: this.state,
      isConnected: () => this.connection.isConnected(),
      runCompetitionOperation: (competitionId, operation) => this.runCompetitionOperation(competitionId, operation),
      publishExpiry: (competitionId, fields) => this.timers.publishBroadcast(competitionId, 'timer-expired', fields),
      clearActiveTimer: (state) => this.competitions.retainCompetitionState(state, { activeTimer: undefined }),
      onError: (error) => this.handleError(error),
    });
    this.connection = new DirectorMqttConnection(transport, options, {
      onMessage: (topic, payload) => this.receiver.handleMessage(topic, payload),
      onSessionReset: () => this.resetBrokerState(),
      onDisconnecting: () => this.stopBrokerScopedWork(),
      onReady: () => this.expiry.restoreAll(),
      onStateChanged: () => this.emitStateChanged(),
      onError: (error) => this.handleError(error),
      onDebugLog: (message) => this.log(message),
    });
    this.readiness = new DirectorLaneReadiness(
      { isReady: () => this.connection.ready, getHardware: (laneId) => this.state.getLane(laneId)?.hardware },
      clockQualityPolicy,
    );
    this.competitions = new CompetitionStateRegistry({
      state: this.state,
      readiness: this.readiness,
      expiry: this.expiry,
      connection: this.connection,
      transport,
      callbacks,
      onStateChanged: () => this.emitStateChanged(),
    });
    this.commands = createDirectorCommandPort(options.directorId, (command) => this.publishCommand(command));
    const onResult = (result: CommandExecutionResult) => this.setLastCommand(result);
    const log = (message: string) => this.log(message);
    this.membership = new CompetitionMembershipCommands(this.commands, this.competitions, {
      clearCompetitionShotHistory: (competitionId, laneId) =>
        this.state.clearCompetitionShotHistory(competitionId, laneId),
      onResult,
    });
    this.timers = new CompetitionTimerCommands(
      this.commands,
      this.competitions,
      { deadlines: this.expiry, onFiringBoundary: (boundary) => this.emitFiringBoundary(boundary) },
      startDelayMs,
    );
    this.finish = new CompetitionFinishCommands(this.competitions, {
      callbacks,
      deadlines: this.expiry,
      snapshots: this.state,
      timers: this.timers,
      membership: this.membership,
      onResult,
    });
    this.qualificationRecovery = new QualificationRecoveryCommands(this.commands, this.competitions, startDelayMs);
    this.safety = new RangeSafetyCommands(this.commands, {
      hasLane: (laneId) => Boolean(this.state.getLane(laneId)),
      onResult,
      log,
    });
    this.interruptions = new RangeInterruptionCommands(
      this.commands,
      this.competitions,
      { onResult, log },
      startDelayMs,
    );
    this.reserveTransfers = new ReserveLaneTransferCommands(this.commands, this.competitions);
    this.timedTargets = new TimedTargetCommands(this.commands, this.competitions, this.state, startDelayMs);
    this.finals = new FinalCompetitionCommands(this.commands, this.competitions, startDelayMs);
    this.receiver = new DirectorMqttReceiver({
      onHardwareState: (state) => {
        const wasConnected = this.state.getLane(state.laneId)?.hardware?.connection.status === 'connected';
        const effectiveState = this.hardwareMonitor.observe(state);
        this.state.updateLane(state.laneId, {
          laneAlias: state.laneAlias,
          hardware: effectiveState,
          lastSeenAt: state.publishedAt,
        });
        if (!wasConnected && effectiveState.connection.status === 'connected') this.expiry.retryForLane(state.laneId);
      },
      onCompetitionState: (state) => this.competitions.observe(state),
      onCompetitionCleared: (competitionId) => this.competitions.forget(competitionId),
      onLaneUpdate: (laneId, patch) => this.state.updateLane(laneId, patch),
      onCompetitionLaneUpdate: (competitionId, laneId, patch, lastSeenAt) =>
        this.state.updateCompetitionLane(competitionId, laneId, patch, lastSeenAt),
      onCompetitionShot: (shot, payloadJson) => {
        this.callbacks.onCompetitionShotObserved?.(shot, payloadJson);
        if (!this.state.rememberShot(shot.shotId)) return;
        this.state.rememberCompetitionShot(shot);
        this.state.updateCompetitionLane(
          shot.competitionId,
          shot.laneId,
          { lastCompetitionShot: shot },
          shot.publishedAt,
        );
        this.callbacks.onCompetitionShot?.(shot);
      },
      onCompetitionShootOffShotObserved: (shot, payloadJson) =>
        this.callbacks.onCompetitionShootOffShotObserved?.(shot, payloadJson),
      onQualificationRecoveryStateObserved: (state, payloadJson) =>
        this.callbacks.onQualificationRecoveryStateObserved?.(state, payloadJson),
      onQualificationRecoveryShotObserved: (shot, payloadJson) =>
        this.callbacks.onQualificationRecoveryShotObserved?.(shot, payloadJson),
      onShotObservationEvidenceObserved: (evidence, payloadJson) =>
        this.callbacks.onShotObservationEvidenceObserved?.(evidence, payloadJson),
      onAcknowledgement: (topic, acknowledgement) => this.commandDispatcher.acknowledge(topic, acknowledgement),
      onDebugLog: (message) => this.log(message),
    });
  }

  setClockQualityPolicy(policy: IClockQualityPolicy): void {
    this.readiness.setClockQualityPolicy(policy);
  }

  setTimedTargetReadinessPolicy(policy: ITimedTargetReadinessPolicy): void {
    this.readiness.setTimedTargetReadinessPolicy(policy);
  }

  setTimingEvidencePolicy(policy: LaneTimingEvidencePolicy): void {
    this.readiness.setTimingEvidencePolicy(policy);
  }

  getTimingEvidenceStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    return this.readiness.getTimingEvidenceStartIssues(laneIds);
  }

  getTimedTargetStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    return this.readiness.getTimedTargetStartIssues(laneIds);
  }

  getClockStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    return this.readiness.getClockStartIssues(laneIds);
  }

  getClockQualityByLane(): Readonly<Record<string, ClockQualityAssessment>> {
    return this.readiness.getClockQualityByLane();
  }

  async publishCompetitionCue(payload: CompetitionCuePayload): Promise<CompetitionCuePayload> {
    this.connection.assertConnected();
    this.competitions.requireCompetition(payload.competitionId);
    payload.targetLaneIds?.forEach((laneId) => this.competitions.requireCompetitionLane(payload.competitionId, laneId));
    const validated = CompetitionCuePayloadSchema.parse(payload);
    await this.transport.publish(mqttTopics.competitionCue(validated.competitionId), JSON.stringify(validated), {
      qos: 1,
      retain: true,
    });
    return validated;
  }

  async clearCompetitionCue(competitionId: string): Promise<void> {
    this.connection.assertConnected();
    this.competitions.requireCompetition(competitionId);
    await this.transport.publish(mqttTopics.competitionCue(competitionId), '', { qos: 1, retain: true });
  }

  async probeLaneClock(laneId: string): Promise<LaneClockProbeResult> {
    this.connection.assertConnected();
    if (!this.state.getLane(laneId)) throw new Error(`Lane not found: ${laneId}`);
    const directorSentAt = new Date();
    const command = ProbeClockCommandSchema.parse(
      this.commands.commandBase({ directorSentAt: directorSentAt.toISOString() }),
    );
    const result = await this.commands.publishLaneCommand(laneId, 'probe-clock', command);
    return this.readiness.recordClockProbe(laneId, directorSentAt, result);
  }

  /** Activates a competition-independent safety latch on every selected Lane. */
  activateSafetyStop(
    laneIds: string[],
    safetyStopId: string,
    reason: string,
    officialName: string,
  ): Promise<CommandBatchResult> {
    return this.runSafetyOperation(() => this.safety.activateSafetyStop(laneIds, safetyStopId, reason, officialName));
  }

  clearSafetyStop(
    laneIds: string[],
    safetyStopId: string,
    clearanceReason: string,
    officialName: string,
  ): Promise<CommandBatchResult> {
    return this.runSafetyOperation(() =>
      this.safety.clearSafetyStop(laneIds, safetyStopId, clearanceReason, officialName),
    );
  }

  connect(brokerUrl: string): Promise<void> {
    return this.connection.connect(brokerUrl);
  }

  disconnect(): Promise<void> {
    return this.connection.disconnect();
  }

  getCompetition(competitionId: string): CompetitionStatePayload | undefined {
    return this.state.getCompetition(competitionId);
  }

  getLane(laneId: string): DirectorLaneSnapshot | undefined {
    return this.state.getLane(laneId);
  }

  getSnapshot(): MqttControlSnapshot {
    return {
      connected: this.connection.isConnected(),
      brokerUrl: this.connection.brokerUrl,
      activeCompetitionId: this.competitions.activeCompetitionId,
      lanes: this.state
        .getLanes()
        .sort((a, b) => (a.laneAlias || a.laneId).localeCompare(b.laneAlias || b.laneId, 'ja', { numeric: true })),
      competitions: this.state.getCompetitions().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
      lastCommand: this.lastCommand,
    };
  }

  async createCompetition(input: CreateCompetitionInput): Promise<CompetitionStatePayload> {
    const competitionId = input.competitionId ?? crypto.randomUUID();
    return this.runCompetitionOperation(
      competitionId,
      () => this.membership.createCompetition(input, competitionId),
      input.laneIds.length > 0,
    );
  }

  async joinCompetition(competitionId: string, laneIds: string[]): Promise<CommandBatchResult> {
    return this.runCompetitionOperation(
      competitionId,
      () => this.membership.joinCompetition(competitionId, laneIds),
      true,
    );
  }

  async leaveCompetition(competitionId: string, laneIds: string[]): Promise<CommandBatchResult> {
    return this.runCompetitionOperation(
      competitionId,
      () => this.membership.leaveCompetition(competitionId, laneIds),
      true,
    );
  }

  async assignAthlete(competitionId: string, laneId: string, athlete: Athlete | null): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.membership.assignAthlete(competitionId, laneId, athlete),
    );
  }

  async resetSession(competitionId: string, laneId: string, reason?: string): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.membership.resetSession(competitionId, laneId, reason),
    );
  }

  async retireFinalist(
    competitionId: string,
    laneId: string,
    checkpointId: string,
    rank: number,
    afterShot: number,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.finals.retireFinalist(competitionId, laneId, checkpointId, rank, afterShot),
    );
  }

  async startShootOff(
    competitionId: string,
    runId: string,
    iteration: number,
    timing: ShootOffTiming,
    shotsPerLane: number,
    eligibleLaneIds: readonly string[],
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.finals.startShootOff(competitionId, runId, iteration, timing, shotsPerLane, eligibleLaneIds),
    );
  }

  async stopShootOff(
    competitionId: string,
    runId: string,
    iteration: number,
    eligibleLaneIds: readonly string[],
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.finals.stopShootOff(competitionId, runId, iteration, eligibleLaneIds),
    );
  }

  getFinalFiringContext(competitionId: string, laneId: string) {
    return this.finals.getFinalFiringContext(competitionId, laneId);
  }

  async executeFinalFiring(input: FinalFiringTransportInput) {
    return this.runCompetitionOperation(input.request.competitionId, () => this.finals.executeFinalFiring(input));
  }

  async transferReserveLane(input: { competitionId: string; laneId: string; transfer: ReserveLaneTransferAction }) {
    return this.runCompetitionOperation(input.competitionId, () => this.reserveTransfers.transferReserveLane(input));
  }

  async pauseLaneTimer(competitionId: string, laneId: string, interruptionId: string): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.interruptions.pauseLaneTimer(competitionId, laneId, interruptionId),
    );
  }

  /**
   * Fan out a range STOP as lane-addressed commands. Each Lane has an independent
   * acknowledgement so a partial range operation is visible and retryable.
   */
  async pauseRangeTimers(
    competitionId: string,
    laneIds: string[],
    interruptionId: string,
  ): Promise<CommandBatchResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.interruptions.pauseRangeTimers(competitionId, laneIds, interruptionId),
    );
  }

  async resumeLaneTimer(
    competitionId: string,
    laneId: string,
    interruptionId: string,
    authorizedRemainingSeconds: number,
    unlimitedSightingShots: boolean,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.interruptions.resumeLaneTimer(
        competitionId,
        laneId,
        interruptionId,
        authorizedRemainingSeconds,
        unlimitedSightingShots,
      ),
    );
  }

  async resumeRangeTimers(
    competitionId: string,
    laneIds: string[],
    interruptionId: string,
    authorizedRemainingSeconds: number,
    unlimitedSightingShots: boolean,
  ): Promise<CommandBatchResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.interruptions.resumeRangeTimers(
        competitionId,
        laneIds,
        interruptionId,
        authorizedRemainingSeconds,
        unlimitedSightingShots,
      ),
    );
  }

  async resumeLaneMatch(
    competitionId: string,
    laneId: string,
    interruptionId: string,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.interruptions.resumeLaneMatch(competitionId, laneId, interruptionId),
    );
  }

  async resumeRangeMatch(
    competitionId: string,
    laneIds: string[],
    interruptionId: string,
  ): Promise<CommandBatchResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.interruptions.resumeRangeMatch(competitionId, laneIds, interruptionId),
    );
  }

  /**
   * Executes one firing phase from an official Qualification recovery decision.
   * Recommendation, score credit and ordinary series mutation remain outside
   * this transport boundary.
   */
  async startQualificationRecovery(input: StartQualificationRecoveryInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, () =>
      this.qualificationRecovery.startQualificationRecovery(input),
    );
  }

  async cancelQualificationRecovery(input: CancelQualificationRecoveryInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, () =>
      this.qualificationRecovery.cancelQualificationRecovery(input),
    );
  }

  async applyQualificationRecovery(input: ApplyQualificationRecoveryInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, () =>
      this.qualificationRecovery.applyQualificationRecovery(input),
    );
  }

  async settleQualificationRecovery(input: SettleQualificationRecoveryInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, () =>
      this.qualificationRecovery.settleQualificationRecovery(input),
    );
  }

  async startSighting(
    competitionId: string,
    durationSeconds: number,
    targetLaneIds?: string[],
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.timers.startSighting(competitionId, durationSeconds, targetLaneIds),
    );
  }

  async endSighting(competitionId: string): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.timers.endSighting(competitionId));
  }

  async stopActiveTimer(competitionId: string): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.timers.stopActiveTimer(competitionId));
  }

  async startMatch(competitionId: string, durationSeconds?: number): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.timers.startMatch(competitionId, durationSeconds));
  }

  async startTimedTarget(input: StartTimedTargetInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, () => this.timedTargets.startTimedTarget(input));
  }

  async recordTimedTargetUnload(input: RecordTimedTargetUnloadInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, () => this.timedTargets.recordTimedTargetUnload(input));
  }

  async cancelTimedTarget(input: CancelTimedTargetInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, () => this.timedTargets.cancelTimedTarget(input));
  }

  async restartTimer(
    competitionId: string,
    timerScope: 'STAGE' | 'SERIES',
    durationSeconds: number,
    stageIndex: number,
    seriesIndex: number | null,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.timers.restartTimer(competitionId, timerScope, durationSeconds, stageIndex, seriesIndex),
    );
  }

  async advanceSeries(
    competitionId: string,
    stageIndex: number,
    fromSeriesIndex: number,
    resumeOnly?: boolean,
    nextSeriesTimer?: NextSeriesTimer,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.timers.advanceSeries(competitionId, stageIndex, fromSeriesIndex, resumeOnly, nextSeriesTimer),
    );
  }

  async finishCompetition(
    competitionId: string,
    beforeCleanup?: (lanes: CompetitionResultLane[]) => Promise<boolean | void>,
    beforeDataClear?: () => Promise<void> | void,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(
      competitionId,
      () => this.finish.finishCompetition(competitionId, beforeCleanup, beforeDataClear),
      true,
    );
  }

  private runCompetitionOperation<T>(
    competitionId: string,
    operation: () => Promise<T>,
    changesMembership = false,
  ): Promise<T> {
    return this.operations.run(
      [`competition:${competitionId}`, ...(changesMembership ? ['competition-membership'] : [])],
      operation,
    );
  }

  private runSafetyOperation<T>(operation: () => Promise<T>): Promise<T> {
    return this.operations.run(['range-safety'], operation);
  }

  private publishCommand(options: PublishCommandOptions): Promise<CommandExecutionResult> {
    this.connection.assertConnected();
    return this.commandDispatcher.publish(options);
  }

  private emitFiringBoundary(boundary: FiringBoundarySignal): void {
    try {
      this.callbacks.onFiringBoundary?.(boundary);
    } catch (error) {
      logger.error(`Failed to record ${boundary.sourceAction} firing boundary:`, error);
    }
  }

  /** Stops expiry timers, heartbeat expiry and pending acknowledgements of the current broker session. */
  private stopBrokerScopedWork(): void {
    this.expiry.stop();
    this.hardwareMonitor.clear();
    this.commandDispatcher.cancelPending();
  }

  private resetBrokerState(): void {
    this.stopBrokerScopedWork();
    this.competitions.reset();
    this.state.reset();
    this.readiness.reset();
    this.lastCommand = null;
    this.callbacks.onSessionReset?.();
  }

  private setLastCommand(result: CommandExecutionResult): void {
    this.lastCommand = result;
    this.emitStateChanged();
  }

  private emitStateChanged(): void {
    this.callbacks.onStateChanged?.(this.getSnapshot());
  }

  private handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    logger.logError('MQTT error', error instanceof Error ? error : new Error(message));
    this.callbacks.onError?.(message);
  }

  private log(message: string): void {
    logger.info(message);
  }
}
