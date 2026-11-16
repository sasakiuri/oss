// SPDX-License-Identifier: MIT
import {
  AdvanceSeriesCommandSchema,
  AssignAthleteCommandSchema,
  CancelTimedTargetCommandSchema,
  EndSightingCommandSchema,
  FinishCompetitionCommandSchema,
  JoinCompetitionCommandSchema,
  LeaveCompetitionCommandSchema,
  ProbeClockCommandSchema,
  ResetSessionCommandSchema,
  StartMatchCommandSchema,
  StartSightingCommandSchema,
  StartTimedTargetCommandSchema,
  TimerExpiredCommandSchema,
  TimerStartedCommandSchema,
  type MqttCommandActionOf,
} from '@sasakiuri/saika-protocol/commands';
import type { FinalFiringTransportInput } from '@/main/modules/final-recovery-firing';
import type { CompetitionStartIssue } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import { KeyedOperationQueue } from '@/main/shared-infra/operations/KeyedOperationQueue';
import { CompetitionCuePayloadSchema, type CompetitionCuePayload } from '@sasakiuri/saika-protocol/CompetitionCue';
import {
  CompetitionStatePayloadSchema,
  type ActiveCompetitionTimer,
  type CompetitionPhase,
  type CompetitionStatePayload,
  type PendingCompetitionTimer,
} from '@sasakiuri/saika-protocol/CompetitionState';
import type { Athlete } from '@sasakiuri/saika-protocol/LaneAssignment';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';
import type { ReserveLaneTransferAction } from '@sasakiuri/saika-protocol/ReserveLaneTransfer';
import { Logger } from '@/shared/logging';

import {
  ClockQualityPolicy,
  type ClockQualityAssessment,
  type IClockQualityPolicy,
} from '../domain/ClockQualityPolicy';
import {
  CompetitionDefinitionCompatibilityPolicy,
  type ICompetitionDefinitionCompatibilityPolicy,
} from '../domain/CompetitionDefinitionCompatibilityPolicy';
import type { FiringBoundarySignal } from '../domain/IFiringWindowJournal';
import type { IMqttTransport } from '../domain/IMqttTransport';
import type { LaneTimingEvidencePolicy } from '../domain/LaneTimingEvidencePolicy';
import { TimedTargetReadinessPolicy, type ITimedTargetReadinessPolicy } from '../domain/TimedTargetReadinessPolicy';

import { CompetitionExpiryScheduler } from './CompetitionExpiryScheduler';
import { createLaneCommandFailure } from './createLaneCommandFailure';
import type { DirectorCommandPort } from './DirectorCommandPort';
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

type BroadcastCommandAction = Extract<
  MqttCommandActionOf<'competition'>,
  | 'end-sighting'
  | 'start-match'
  | 'timer-started'
  | 'timer-expired'
  | 'advance-series'
  | 'finish-competition'
  | 'start-timed-target'
  | 'cancel-timed-target'
>;

const broadcastCommandSchemas = {
  'end-sighting': EndSightingCommandSchema,
  'start-match': StartMatchCommandSchema,
  'timer-started': TimerStartedCommandSchema,
  'timer-expired': TimerExpiredCommandSchema,
  'advance-series': AdvanceSeriesCommandSchema,
  'finish-competition': FinishCompetitionCommandSchema,
  'start-timed-target': StartTimedTargetCommandSchema,
  'cancel-timed-target': CancelTimedTargetCommandSchema,
} as const;

export class DirectorMqttService {
  private readonly transport: IMqttTransport;
  private readonly directorId: string;
  private readonly commandTimeoutMs: number;
  private readonly startDelayMs: number;
  private callbacks: DirectorMqttCallbacks;
  private activeCompetitionId: string | null = null;
  private competitionCleanupLaneIds = new Map<string, string[]>();
  private readonly connection: DirectorMqttConnection;
  private readonly receiver: DirectorMqttReceiver;
  private readonly state: DirectorMqttState;
  private readonly commandDispatcher: MqttCommandDispatcher;
  private lastCommand: CommandExecutionResult | null = null;
  private readonly hardwareMonitor: LaneHardwareMonitor;
  private readonly operations = new KeyedOperationQueue();
  private readonly expiry: CompetitionExpiryScheduler;
  private readonly readiness: DirectorLaneReadiness;
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
    private readonly definitionCompatibilityPolicy: ICompetitionDefinitionCompatibilityPolicy = new CompetitionDefinitionCompatibilityPolicy(),
    timedTargetReadinessPolicy: ITimedTargetReadinessPolicy = new TimedTargetReadinessPolicy(),
  ) {
    this.directorId = options.directorId;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 10_000;
    this.startDelayMs = options.startDelayMs ?? 3_000;
    this.callbacks = callbacks;
    this.transport = transport;
    this.state = new DirectorMqttState(this.commandTimeoutMs, () => this.emitStateChanged());
    this.commandDispatcher = new MqttCommandDispatcher(transport, this.commandTimeoutMs, {
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
      publishExpiry: (competitionId, fields) => this.publishBroadcast(competitionId, 'timer-expired', fields),
      clearActiveTimer: (state) =>
        this.publishCompetitionState(this.updateCompetitionState(state, { activeTimer: undefined })),
      onError: (error) => this.handleError(error),
    });
    this.connection = new DirectorMqttConnection(transport, options, {
      onMessage: (topic, payload) => this.receiver.handleMessage(topic, payload),
      onSessionReset: () => this.resetBrokerState(),
      onDisconnecting: () => {
        this.expiry.stop();
        this.hardwareMonitor.clear();
        this.commandDispatcher.cancelPending();
      },
      onReady: () => this.expiry.restoreAll(),
      onStateChanged: () => this.emitStateChanged(),
      onError: (error) => this.handleError(error),
      onDebugLog: (message) => this.log(message),
    });
    this.readiness = new DirectorLaneReadiness(
      { isReady: () => this.connection.ready, getHardware: (laneId) => this.state.getLane(laneId)?.hardware },
      clockQualityPolicy,
      timedTargetReadinessPolicy,
    );
    const commands: DirectorCommandPort = {
      commandBase: (fields) => this.commandBase(fields),
      publishCommand: (options) => this.publishCommand(options),
    };
    this.qualificationRecovery = new QualificationRecoveryCommands(
      commands,
      {
        requireCompetition: (competitionId) => this.requireCompetition(competitionId),
        requireCompetitionPhase: (competitionId, phase, operation) =>
          this.requireCompetitionPhase(competitionId, phase, operation),
        requireCompetitionLane: (competitionId, laneId) => this.requireCompetitionLane(competitionId, laneId),
        getLane: (laneId) => this.state.getLane(laneId),
        assertSafetyCleared: (laneIds, operation) => this.assertSafetyCleared(laneIds, operation),
        assertTimedCommandReadiness: (laneIds) => this.readiness.assertTimedCommandReadiness(laneIds),
        assertTimedTargetReadiness: (laneIds) => this.readiness.assertTimedTargetReadiness(laneIds),
      },
      this.startDelayMs,
    );
    this.safety = new RangeSafetyCommands(commands, {
      hasLane: (laneId) => Boolean(this.state.getLane(laneId)),
      onResult: (result) => this.setLastCommand(result),
      log: (message) => this.log(message),
    });
    this.interruptions = new RangeInterruptionCommands(
      commands,
      {
        requireCompetition: (competitionId) => this.requireCompetition(competitionId),
        requireCompetitionLane: (competitionId, laneId) => this.requireCompetitionLane(competitionId, laneId),
        assertSafetyCleared: (laneIds, operation) => this.assertSafetyCleared(laneIds, operation),
        assertTimedCommandReadiness: (laneIds) => this.readiness.assertTimedCommandReadiness(laneIds),
        onResult: (result) => this.setLastCommand(result),
        log: (message) => this.log(message),
      },
      this.startDelayMs,
    );
    this.reserveTransfers = new ReserveLaneTransferCommands(commands, {
      requireCompetitionPhase: (competitionId, phase, operation) =>
        this.requireCompetitionPhase(competitionId, phase, operation),
      requireCompetitionLane: (competitionId, laneId) => this.requireCompetitionLane(competitionId, laneId),
      getLane: (laneId) => this.state.getLane(laneId),
      retainCompetitionState: (state, patch) => this.publishCompetitionState(this.updateCompetitionState(state, patch)),
    });
    this.timedTargets = new TimedTargetCommands(
      commands,
      {
        requireCompetition: (competitionId) => this.requireCompetition(competitionId),
        requireCompetitionPhase: (competitionId, phase, operation) =>
          this.requireCompetitionPhase(competitionId, phase, operation),
        requireCompetitionLane: (competitionId, laneId) => this.requireCompetitionLane(competitionId, laneId),
        getLane: (laneId) => this.state.getLane(laneId),
        waitForTimedTargetLaneReadiness: (competitionId, laneIds, stageIndex, seriesIndex) =>
          this.state.waitForTimedTargetLaneReadiness(competitionId, laneIds, stageIndex, seriesIndex),
        assertPhaseStartAllowed: (scope) => this.callbacks.assertPhaseStartAllowed?.(scope),
        assertSafetyCleared: (laneIds, operation) => this.assertSafetyCleared(laneIds, operation),
        assertTimedCommandReadiness: (laneIds) => this.readiness.assertTimedCommandReadiness(laneIds),
        assertTimedTargetReadiness: (laneIds) => this.readiness.assertTimedTargetReadiness(laneIds),
      },
      this.startDelayMs,
    );
    this.finals = new FinalCompetitionCommands(
      commands,
      {
        requireCompetitionPhase: (competitionId, phase, operation) =>
          this.requireCompetitionPhase(competitionId, phase, operation),
        requireCompetitionLane: (competitionId, laneId) => this.requireCompetitionLane(competitionId, laneId),
        getLane: (laneId) => this.state.getLane(laneId),
        assertSafetyCleared: (laneIds, operation) => this.assertSafetyCleared(laneIds, operation),
        assertTimedCommandReadiness: (laneIds) => this.readiness.assertTimedCommandReadiness(laneIds),
        assertTimedTargetReadiness: (laneIds) => this.readiness.assertTimedTargetReadiness(laneIds),
      },
      this.startDelayMs,
    );
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
      onCompetitionState: (state) => {
        this.state.setCompetition(state);
        if (this.connection.ready) this.expiry.restore(state);
        if (
          !this.activeCompetitionId ||
          Date.parse(state.publishedAt) >=
            Date.parse(this.state.getCompetition(this.activeCompetitionId)?.publishedAt ?? '1970-01-01')
        )
          this.activeCompetitionId = state.competitionId;
        this.state.projectCompetitionLaneData();
        this.emitStateChanged();
      },
      onCompetitionCleared: (competitionId) => {
        this.state.removeCompetition(competitionId);
        this.competitionCleanupLaneIds.delete(competitionId);
        this.expiry.clear(competitionId);
        if (this.activeCompetitionId === competitionId) this.activeCompetitionId = this.getMostRecentCompetitionId();
        this.state.projectCompetitionLaneData();
        this.emitStateChanged();
      },
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

  getClockQuality(laneId?: string): Readonly<Record<string, ClockQualityAssessment>> | ClockQualityAssessment | null {
    return this.readiness.getClockQuality(laneId);
  }

  async publishCompetitionCue(payload: CompetitionCuePayload): Promise<CompetitionCuePayload> {
    this.assertConnected();
    this.requireCompetition(payload.competitionId);
    payload.targetLaneIds?.forEach((laneId) => this.requireCompetitionLane(payload.competitionId, laneId));
    const validated = CompetitionCuePayloadSchema.parse(payload);
    await this.transport.publish(mqttTopics.competitionCue(validated.competitionId), JSON.stringify(validated), {
      qos: 1,
      retain: true,
    });
    return validated;
  }

  async clearCompetitionCue(competitionId: string): Promise<void> {
    this.assertConnected();
    this.requireCompetition(competitionId);
    await this.transport.publish(mqttTopics.competitionCue(competitionId), '', { qos: 1, retain: true });
  }

  async probeLaneClock(laneId: string): Promise<LaneClockProbeResult> {
    this.assertConnected();
    if (!this.state.getLane(laneId)) throw new Error(`Lane not found: ${laneId}`);
    const directorSentAt = new Date();
    const command = ProbeClockCommandSchema.parse(this.commandBase({ directorSentAt: directorSentAt.toISOString() }));
    const result = await this.publishCommand({
      action: 'probe-clock',
      topic: mqttTopics.laneCommand(laneId, 'probe-clock'),
      acknowledgementTopic: () => mqttTopics.laneCommandAcknowledgement(laneId, 'probe-clock'),
      payload: command,
      expectedLaneIds: [laneId],
    });
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

  setCallbacks(callbacks: DirectorMqttCallbacks): void {
    this.callbacks = callbacks;
  }

  connect(brokerUrl: string): Promise<void> {
    return this.connection.connect(brokerUrl);
  }

  disconnect(): Promise<void> {
    return this.connection.disconnect();
  }

  getSnapshot(): MqttControlSnapshot {
    return {
      connected: this.connection.isConnected(),
      brokerUrl: this.connection.brokerUrl,
      activeCompetitionId: this.activeCompetitionId,
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
      () => this.createCompetitionNow(input, competitionId),
      input.laneIds.length > 0,
    );
  }

  private async createCompetitionNow(
    input: CreateCompetitionInput,
    competitionId: string,
  ): Promise<CompetitionStatePayload> {
    this.assertConnected();
    const now = new Date().toISOString();
    const state = CompetitionStatePayloadSchema.parse({
      ...input,
      competitionId,
      phase: 'NOT_STARTED',
      startedAt: null,
      finishedAt: null,
      publishedAt: now,
    });
    this.assertLanesAvailableForCompetition(state.competitionId, state.laneIds);

    await this.publishCompetitionState(state);
    this.activeCompetitionId = state.competitionId;
    this.state.projectCompetitionLaneData();
    this.emitStateChanged();
    return state;
  }

  async joinCompetition(competitionId: string, laneIds: string[]): Promise<CommandBatchResult> {
    return this.runCompetitionOperation(competitionId, () => this.joinCompetitionNow(competitionId, laneIds), true);
  }

  private async joinCompetitionNow(competitionId: string, laneIds: string[]): Promise<CommandBatchResult> {
    const state = this.requireCompetitionPhase(competitionId, 'NOT_STARTED', 'join competition');
    const uniqueLaneIds = [...new Set(laneIds)];
    this.assertLanesAvailableForCompetition(competitionId, uniqueLaneIds);
    this.assertDefinitionCompatibility(state, uniqueLaneIds);
    const previousPendingJoinLaneIds = new Set(state.pendingJoinLaneIds ?? []);
    const provisionalPendingJoinLaneIds = [
      ...new Set([...previousPendingJoinLaneIds, ...uniqueLaneIds.filter((laneId) => !state.laneIds.includes(laneId))]),
    ];
    const provisional = this.updateCompetitionState(state, {
      laneIds: [...new Set([...state.laneIds, ...uniqueLaneIds])],
      pendingJoinLaneIds: provisionalPendingJoinLaneIds.length > 0 ? provisionalPendingJoinLaneIds : undefined,
      // No Lane can have applied an intent that outlived an empty membership.
      // This also repairs stale retained state written by earlier versions.
      ...(state.laneIds.length === 0 ? { pendingTimer: undefined } : {}),
    });
    await this.publishCompetitionState(provisional);

    const commands = await Promise.all(
      uniqueLaneIds.map(async (laneId) => {
        const command = JoinCompetitionCommandSchema.parse(this.commandBase({ competitionId }));
        try {
          return await this.publishCommand({
            action: 'join-competition',
            topic: mqttTopics.laneCommand(laneId, 'join-competition'),
            acknowledgementTopic: () => mqttTopics.laneCommandAcknowledgement(laneId, 'join-competition'),
            payload: command,
            expectedLaneIds: [laneId],
          });
        } catch (error) {
          return this.commandPublishFailure(command.commandId, 'join-competition', laneId, error);
        }
      }),
    );

    const requestedLaneIds = new Set(uniqueLaneIds);
    const outcomeByLaneId = new Map(
      commands.flatMap((command) => command.lanes.map((lane) => [lane.laneId, lane] as const)),
    );
    const ambiguousLaneIds = provisionalPendingJoinLaneIds.filter((laneId) => {
      if (!requestedLaneIds.has(laneId)) return true;
      const outcome = outcomeByLaneId.get(laneId);
      return !outcome || outcome.status === 'timeout' || outcome.error?.code === 'MQTT_PUBLISH_FAILED';
    });
    const rejectedLaneIds = new Set(
      provisionalPendingJoinLaneIds.filter((laneId) => {
        if (!requestedLaneIds.has(laneId)) return false;
        const outcome = outcomeByLaneId.get(laneId);
        return outcome?.status === 'error' && outcome.error?.code !== 'MQTT_PUBLISH_FAILED';
      }),
    );
    const finalState = this.updateCompetitionState(provisional, {
      laneIds: provisional.laneIds.filter((laneId) => !rejectedLaneIds.has(laneId)),
      pendingJoinLaneIds: ambiguousLaneIds.length > 0 ? ambiguousLaneIds : undefined,
    });
    await this.publishCompetitionState(finalState);

    return { success: commands.every((command) => command.success), commands };
  }

  private assertDefinitionCompatibility(state: CompetitionStatePayload, laneIds: readonly string[]): void {
    for (const laneId of laneIds) {
      const assessment = this.definitionCompatibilityPolicy.assess(
        state.definitionBinding,
        this.state.getLane(laneId)?.hardware?.capabilities,
      );
      if (!assessment.joinAllowed) {
        throw new Error(`Lane ${laneId} cannot join competition ${state.competitionId}: ${assessment.guidance}`);
      }
      if (assessment.status !== 'MATCH' && assessment.status !== 'DISABLED' && assessment.status !== 'LEGACY') {
        logger.warn(`Lane ${laneId} has advisory Rule Pack compatibility: ${assessment.guidance}`);
      }
    }
  }

  async leaveCompetition(competitionId: string, laneIds: string[]): Promise<CommandBatchResult> {
    return this.runCompetitionOperation(competitionId, () => this.leaveCompetitionNow(competitionId, laneIds), true);
  }

  private async leaveCompetitionNow(competitionId: string, laneIds: string[]): Promise<CommandBatchResult> {
    const state = this.requireCompetition(competitionId);
    const uniqueLaneIds = [...new Set(laneIds)];
    uniqueLaneIds.forEach((laneId) => this.requireCompetitionLane(competitionId, laneId));
    const pendingSightingLaneIds = new Set(state.pendingSightingLaneIds ?? []);
    const canLeave =
      state.phase === 'NOT_STARTED' ||
      (state.phase === 'SIGHTING' && uniqueLaneIds.every((laneId) => pendingSightingLaneIds.has(laneId)));
    if (!canLeave) {
      throw new Error(
        `Cannot leave competition ${competitionId} while it is in phase ${state.phase}; only Lanes still pending sighting may leave after the competition starts`,
      );
    }
    const result = await this.publishLeaveCompetitionCommands(competitionId, uniqueLaneIds);

    const leftLaneIds = new Set(
      result.commands
        .filter((command) => command.success)
        .flatMap((command) => command.lanes.map((lane) => lane.laneId)),
    );
    const remainingLaneIds = state.laneIds.filter((laneId) => !leftLaneIds.has(laneId));
    const remainingPendingJoinLaneIds = state.pendingJoinLaneIds?.filter((laneId) => !leftLaneIds.has(laneId));
    const remainingPendingSightingLaneIds = state.pendingSightingLaneIds?.filter((laneId) => !leftLaneIds.has(laneId));
    await this.publishCompetitionState(
      this.updateCompetitionState(state, {
        laneIds: remainingLaneIds,
        ...(state.pendingJoinLaneIds
          ? {
              pendingJoinLaneIds:
                remainingPendingJoinLaneIds && remainingPendingJoinLaneIds.length > 0
                  ? remainingPendingJoinLaneIds
                  : undefined,
            }
          : {}),
        // Reusing an ambiguous timer deadline is necessary only while at least
        // one Lane that could have applied it remains in the competition.
        ...(remainingLaneIds.length === 0 ? { pendingTimer: undefined } : {}),
        ...(state.pendingSightingLaneIds
          ? {
              pendingSightingLaneIds:
                remainingPendingSightingLaneIds && remainingPendingSightingLaneIds.length > 0
                  ? remainingPendingSightingLaneIds
                  : undefined,
            }
          : {}),
      }),
    );
    return result;
  }

  async assignAthlete(competitionId: string, laneId: string, athlete: Athlete | null): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.assignAthleteNow(competitionId, laneId, athlete));
  }

  private async assignAthleteNow(
    competitionId: string,
    laneId: string,
    athlete: Athlete | null,
  ): Promise<CommandExecutionResult> {
    this.requireAthleteAssignmentAllowed(competitionId);
    this.requireCompetitionLane(competitionId, laneId);
    const command = AssignAthleteCommandSchema.parse(this.commandBase({ athlete }));
    return this.publishCommand({
      action: 'assign-athlete',
      topic: mqttTopics.laneCompetitionCommand(competitionId, laneId, 'assign-athlete'),
      acknowledgementTopic: () =>
        mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, laneId, 'assign-athlete'),
      payload: command,
      expectedLaneIds: [laneId],
    });
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

  async resetSession(competitionId: string, laneId: string, reason?: string): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.resetSessionNow(competitionId, laneId, reason));
  }

  private async resetSessionNow(
    competitionId: string,
    laneId: string,
    reason?: string,
  ): Promise<CommandExecutionResult> {
    this.requireCompetitionPhase(competitionId, 'NOT_STARTED', 'reset a session');
    this.requireCompetitionLane(competitionId, laneId);
    const command = ResetSessionCommandSchema.parse(this.commandBase({ ...(reason ? { reason } : {}) }));
    const result = await this.publishCommand({
      action: 'reset-session',
      topic: mqttTopics.laneCompetitionCommand(competitionId, laneId, 'reset-session'),
      acknowledgementTopic: () =>
        mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, laneId, 'reset-session'),
      payload: command,
      expectedLaneIds: [laneId],
    });
    const scopedResult: CommandExecutionResult = { ...result, competitionId };
    this.setLastCommand(scopedResult);
    if (result.success) this.state.clearCompetitionShotHistory(competitionId, laneId);
    return scopedResult;
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

  getFinalFiringContext(competitionId: string, laneId: string) {
    return this.finals.getFinalFiringContext(competitionId, laneId);
  }

  async executeFinalFiring(input: FinalFiringTransportInput) {
    return this.runCompetitionOperation(input.request.competitionId, () => this.finals.executeFinalFiring(input));
  }

  async transferReserveLane(input: { competitionId: string; laneId: string; transfer: ReserveLaneTransferAction }) {
    return this.runCompetitionOperation(input.competitionId, () => this.reserveTransfers.transferReserveLane(input));
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
      this.startSightingNow(competitionId, durationSeconds, targetLaneIds),
    );
  }

  private async startSightingNow(
    competitionId: string,
    durationSeconds: number,
    targetLaneIds?: string[],
  ): Promise<CommandExecutionResult> {
    const state = this.requireCompetition(competitionId);
    const isTargetedContinuation = state.phase === 'SIGHTING' && targetLaneIds !== undefined;
    if (state.phase !== 'NOT_STARTED' && !isTargetedContinuation) {
      throw new Error(`Cannot start sighting while competition ${competitionId} is in phase ${state.phase}`);
    }
    const pendingJoinLaneCount = state.pendingJoinLaneIds?.length ?? 0;
    if (pendingJoinLaneCount > 0) {
      throw new Error(
        `Cannot start sighting while ${pendingJoinLaneCount} Lane(s) have unconfirmed competition membership`,
      );
    }
    const expectedLaneIds = targetLaneIds ?? state.laneIds;
    if (expectedLaneIds.length === 0) {
      throw new Error('Cannot start sighting for a competition with no joined Lanes');
    }
    expectedLaneIds.forEach((laneId) => this.requireCompetitionLane(competitionId, laneId));
    this.callbacks.assertPhaseStartAllowed?.({ competitionId, phase: 'SIGHTING', laneIds: expectedLaneIds });
    this.assertSafetyCleared(expectedLaneIds, 'start sighting');
    this.readiness.assertTimedCommandReadiness(expectedLaneIds);
    let commandState = state;
    let activeTimer: ActiveCompetitionTimer;
    if (isTargetedContinuation && state.activeTimer) {
      activeTimer = state.activeTimer;
    } else {
      const prepared = await this.retainTimerIntent(state, 'start-sighting', {
        timerScope: 'STAGE',
        timerStartAt:
          isTargetedContinuation && state.startedAt
            ? state.startedAt
            : new Date(Date.now() + this.startDelayMs).toISOString(),
        timerDurationSeconds: durationSeconds,
        stageIndex: 0,
        seriesIndex: null,
      });
      commandState = prepared.state;
      activeTimer = prepared.timer;
    }
    const command = StartSightingCommandSchema.parse(
      this.commandBase({
        timerStartAt: activeTimer.timerStartAt,
        timerDurationSeconds: activeTimer.timerDurationSeconds,
        ...(targetLaneIds ? { targetLaneIds } : {}),
      }),
    );
    const result = await this.publishCommand({
      action: 'start-sighting',
      topic: mqttTopics.competitionCommand(competitionId, 'start-sighting'),
      acknowledgementTopic: (laneId) =>
        mqttTopics.competitionCommandAcknowledgement(competitionId, 'start-sighting', laneId),
      payload: command,
      expectedLaneIds,
      onPublished: () =>
        this.emitFiringBoundary({
          competitionId,
          phase: 'SIGHTING',
          transition: 'OPEN',
          occurredAt: new Date(activeTimer.timerStartAt),
          commandId: command.commandId,
          commandIssuedAt: new Date(command.issuedAt),
          sourceAction: 'start-sighting',
        }),
    });
    const completedLaneIds = new Set(result.lanes.filter((lane) => lane.status === 'done').map((lane) => lane.laneId));
    if (state.phase === 'SIGHTING' || completedLaneIds.size > 0) {
      const pendingCandidates =
        state.phase === 'NOT_STARTED' ? state.laneIds : (state.pendingSightingLaneIds ?? expectedLaneIds);
      const pendingSightingLaneIds = [
        ...new Set([
          ...pendingCandidates.filter((laneId) => !completedLaneIds.has(laneId)),
          ...result.lanes.filter((lane) => lane.status !== 'done').map((lane) => lane.laneId),
        ]),
      ];
      const updatedState = this.updateCompetitionState(commandState, {
        phase: 'SIGHTING',
        startedAt: state.startedAt ?? activeTimer.timerStartAt,
        activeTimer,
        pendingTimer: undefined,
        pendingSightingLaneIds: pendingSightingLaneIds.length > 0 ? pendingSightingLaneIds : undefined,
      });
      await this.publishCompetitionState(updatedState);
    }
    return result;
  }

  async endSighting(competitionId: string): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.endSightingNow(competitionId));
  }

  async stopActiveTimer(competitionId: string): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.stopActiveTimerNow(competitionId));
  }

  private async stopActiveTimerNow(competitionId: string): Promise<CommandExecutionResult> {
    const state = this.requireCompetition(competitionId);
    if ((state.phase !== 'SIGHTING' && state.phase !== 'MATCH') || !state.activeTimer) {
      throw new Error(`Competition ${competitionId} has no active firing timer to stop`);
    }
    this.expiry.clear(competitionId);
    const activeTimer = state.activeTimer;
    try {
      const result = await this.publishBroadcast(competitionId, 'timer-expired', {
        timerScope: activeTimer.timerScope,
        stageIndex: activeTimer.stageIndex,
        seriesIndex: activeTimer.seriesIndex,
        expiredAt: new Date().toISOString(),
      });
      if (result.success) {
        await this.publishCompetitionState(this.updateCompetitionState(state, { activeTimer: undefined }));
      } else {
        this.expiry.restore(state);
      }
      return result;
    } catch (error) {
      this.expiry.restore(state);
      throw error;
    }
  }

  private async endSightingNow(competitionId: string): Promise<CommandExecutionResult> {
    const state = this.requireCompetitionPhase(competitionId, 'SIGHTING', 'end sighting');
    const pendingSightingLaneCount = state.pendingSightingLaneIds?.length ?? 0;
    if (pendingSightingLaneCount > 0) {
      throw new Error(`Cannot end sighting while ${pendingSightingLaneCount} Lane(s) have not started sighting`);
    }
    this.expiry.clear(competitionId);
    let result: CommandExecutionResult;
    try {
      result = await this.publishBroadcast(competitionId, 'end-sighting', {});
    } catch (error) {
      this.expiry.restore(state);
      throw error;
    }
    if (result.success) {
      await this.publishCompetitionState(
        this.updateCompetitionState(state, {
          phase: 'SIGHTING_COMPLETE',
          activeTimer: undefined,
          pendingTimer: undefined,
          pendingSightingLaneIds: undefined,
        }),
      );
    } else {
      this.expiry.restore(state);
    }
    return result;
  }

  async startMatch(competitionId: string, durationSeconds?: number): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.startMatchNow(competitionId, durationSeconds));
  }

  private async startMatchNow(competitionId: string, durationSeconds?: number): Promise<CommandExecutionResult> {
    const state = this.requireCompetitionPhase(competitionId, 'SIGHTING_COMPLETE', 'start match');
    // With no generic timer, MATCH only arms the enclosing phase; the target program opens firing later.
    if (durationSeconds !== undefined)
      this.callbacks.assertPhaseStartAllowed?.({ competitionId, phase: 'MATCH', laneIds: state.laneIds });
    this.assertSafetyCleared(state.laneIds, 'start match');
    this.readiness.assertTimedCommandReadiness(state.laneIds);
    if (durationSeconds === undefined) {
      const timerStartAt = new Date(Date.now() + this.startDelayMs).toISOString();
      const result = await this.publishBroadcast(competitionId, 'start-match', { timerStartAt });
      if (result.success) {
        await this.publishCompetitionState(
          this.updateCompetitionState(state, {
            phase: 'MATCH',
            startedAt: state.startedAt ?? timerStartAt,
            activeTimer: undefined,
            pendingTimer: undefined,
          }),
        );
      }
      return result;
    }
    const prepared = await this.retainTimerIntent(state, 'start-match', {
      timerScope: 'STAGE',
      timerStartAt: new Date(Date.now() + this.startDelayMs).toISOString(),
      timerDurationSeconds: durationSeconds,
      stageIndex: 1,
      seriesIndex: null,
    });
    const activeTimer = prepared.timer;
    const result = await this.publishBroadcast(competitionId, 'start-match', {
      timerStartAt: activeTimer.timerStartAt,
      timerDurationSeconds: activeTimer.timerDurationSeconds,
    });
    if (result.success) {
      await this.publishCompetitionState(
        this.updateCompetitionState(prepared.state, {
          phase: 'MATCH',
          startedAt: state.startedAt ?? activeTimer.timerStartAt,
          activeTimer,
          pendingTimer: undefined,
        }),
      );
    }
    return result;
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
      this.restartTimerNow(competitionId, timerScope, durationSeconds, stageIndex, seriesIndex),
    );
  }

  private async restartTimerNow(
    competitionId: string,
    timerScope: 'STAGE' | 'SERIES',
    durationSeconds: number,
    stageIndex: number,
    seriesIndex: number | null,
  ): Promise<CommandExecutionResult> {
    const state = this.requireCompetition(competitionId);
    if (state.phase !== 'SIGHTING' && state.phase !== 'MATCH') {
      throw new Error(`Cannot restart timer while competition ${competitionId} is in phase ${state.phase}`);
    }
    this.assertSafetyCleared(state.laneIds, 'restart a timer');
    this.readiness.assertTimedCommandReadiness(state.laneIds);
    const prepared = await this.retainTimerIntent(state, 'timer-started', {
      timerScope,
      timerStartAt: new Date(Date.now() + this.startDelayMs).toISOString(),
      timerDurationSeconds: durationSeconds,
      stageIndex,
      seriesIndex,
    });
    const activeTimer = prepared.timer;
    const result = await this.publishBroadcast(competitionId, 'timer-started', {
      timerScope: activeTimer.timerScope,
      timerStartAt: activeTimer.timerStartAt,
      timerDurationSeconds: activeTimer.timerDurationSeconds,
      stageIndex: activeTimer.stageIndex,
      seriesIndex: activeTimer.seriesIndex,
    });
    if (result.success) {
      await this.publishCompetitionState(
        this.updateCompetitionState(prepared.state, { activeTimer, pendingTimer: undefined }),
      );
    }
    return result;
  }

  async advanceSeries(
    competitionId: string,
    stageIndex: number,
    fromSeriesIndex: number,
    resumeOnly?: boolean,
    nextSeriesTimer?: {
      durationSeconds: number;
      stageIndex: number;
      seriesIndex: number;
    },
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.advanceSeriesNow(competitionId, stageIndex, fromSeriesIndex, resumeOnly, nextSeriesTimer),
    );
  }

  private async advanceSeriesNow(
    competitionId: string,
    stageIndex: number,
    fromSeriesIndex: number,
    resumeOnly?: boolean,
    nextSeriesTimer?: {
      durationSeconds: number;
      stageIndex: number;
      seriesIndex: number;
    },
  ): Promise<CommandExecutionResult> {
    const state = this.requireCompetitionPhase(competitionId, 'MATCH', 'advance series');
    this.assertSafetyCleared(state.laneIds, 'advance series');
    if (nextSeriesTimer) this.readiness.assertTimedCommandReadiness(state.laneIds);
    const timerStartAt = nextSeriesTimer ? new Date(Date.now() + this.startDelayMs).toISOString() : undefined;
    const result = await this.publishBroadcast(competitionId, 'advance-series', {
      stageIndex,
      fromSeriesIndex,
      ...(resumeOnly === undefined ? {} : { resumeOnly }),
      ...(nextSeriesTimer ? { timerStartAt, timerDurationSeconds: nextSeriesTimer.durationSeconds } : {}),
    });
    if (result.success) {
      const activeTimer =
        nextSeriesTimer && timerStartAt
          ? {
              timerScope: 'SERIES' as const,
              timerStartAt,
              timerDurationSeconds: nextSeriesTimer.durationSeconds,
              stageIndex: nextSeriesTimer.stageIndex,
              seriesIndex: nextSeriesTimer.seriesIndex,
            }
          : undefined;
      await this.publishCompetitionState(this.updateCompetitionState(state, { activeTimer, pendingTimer: undefined }));
    }
    return result;
  }

  async finishCompetition(
    competitionId: string,
    beforeCleanup?: (lanes: CompetitionResultLane[]) => Promise<boolean | void>,
    beforeDataClear?: () => Promise<void> | void,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(
      competitionId,
      () => this.finishCompetitionNow(competitionId, beforeCleanup, beforeDataClear),
      true,
    );
  }

  private async finishCompetitionNow(
    competitionId: string,
    beforeCleanup?: (lanes: CompetitionResultLane[]) => Promise<boolean | void>,
    beforeDataClear?: () => Promise<void> | void,
  ): Promise<CommandExecutionResult> {
    this.callbacks.assertCompetitionFinishAllowed?.(competitionId);
    let state = this.requireCompetition(competitionId);
    this.expiry.clear(competitionId);
    const finalSnapshotBaseline =
      state.phase !== 'MATCH_COMPLETE' && beforeCleanup
        ? this.state.captureCompetitionLaneSnapshotRevisions(competitionId, state.laneIds)
        : null;
    let result: CommandExecutionResult;
    try {
      result =
        state.phase === 'MATCH_COMPLETE'
          ? this.completedFinishResult(state.laneIds)
          : await this.publishBroadcast(competitionId, 'finish-competition', {});
    } catch (error) {
      this.expiry.restore(state);
      throw error;
    }
    if (result.success) {
      if (finalSnapshotBaseline) {
        const snapshotErrors = await this.state.waitForFreshFinalLaneSnapshots(
          competitionId,
          state.laneIds,
          finalSnapshotBaseline,
          result.commandId,
        );
        if (snapshotErrors.size > 0) {
          const failedResult: CommandExecutionResult = {
            ...result,
            success: false,
            lanes: result.lanes.map((lane) => {
              const message = snapshotErrors.get(lane.laneId);
              return message
                ? {
                    laneId: lane.laneId,
                    status: 'error',
                    error: { code: 'MQTT_FINAL_SNAPSHOT_INCOMPLETE', message },
                  }
                : lane;
            }),
          };
          this.setLastCommand(failedResult);
          return failedResult;
        }
      }

      if (state.phase !== 'MATCH_COMPLETE') {
        const finishedAt = new Date().toISOString();
        state = this.updateCompetitionState(state, {
          phase: 'MATCH_COMPLETE',
          finishedAt,
          activeTimer: undefined,
          pendingTimer: undefined,
          // With no result-publication callback there is no pre-cleanup work to
          // resume. Persist that fact in the same retained state as completion,
          // so a crash cannot expose an ambiguous completed competition that a
          // later retry might treat as eligible for result publication.
          ...(beforeCleanup || beforeDataClear ? {} : { cleanupPreparedAt: finishedAt }),
        });
        await this.publishCompetitionState(state);
      }

      const laneIds = this.getCompetitionCleanupLaneIds(competitionId);
      await beforeDataClear?.();
      if (!state.cleanupPreparedAt) {
        const cleanupAllowed = await beforeCleanup?.(this.state.getCompetitionResultLanes(competitionId, laneIds));
        if (cleanupAllowed === false) return result;

        // Lane clears its retained assignment and score before acknowledging
        // leave-competition. Persist completion of result publication (or any
        // other pre-cleanup work) first so a cleanup retry never needs data
        // that has already been removed from the broker.
        state = this.updateCompetitionState(state, {
          cleanupPreparedAt: new Date().toISOString(),
        });
        await this.publishCompetitionState(state);
      }

      // Keep the retained membership unchanged until every cleanup operation
      // succeeds. Already-left Lanes return an idempotent done result on retry.
      const leaveResult = await this.publishLeaveCompetitionCommands(competitionId, laneIds);
      if (!leaveResult.success) {
        const failedResult: CommandExecutionResult = {
          ...result,
          success: false,
          lanes: leaveResult.commands.flatMap((command) => command.lanes),
        };
        this.setLastCommand(failedResult);
        return failedResult;
      }

      await this.clearCompetitionRetainedState(competitionId, laneIds);
      this.setLastCommand(result);
    } else {
      this.expiry.restore(state);
    }
    return result;
  }

  private publishCommand(options: PublishCommandOptions): Promise<CommandExecutionResult> {
    this.assertConnected();
    return this.commandDispatcher.publish(options);
  }

  private async publishBroadcast(
    competitionId: string,
    action: BroadcastCommandAction,
    fields: Record<string, unknown>,
  ): Promise<CommandExecutionResult> {
    const state = this.requireCompetition(competitionId);
    const command = broadcastCommandSchemas[action].parse(this.commandBase(fields));
    const firingBoundary = this.toFiringBoundarySignal(competitionId, state.phase, action, fields, command);
    return this.publishCommand({
      action,
      topic: mqttTopics.competitionCommand(competitionId, action),
      acknowledgementTopic: (laneId) => mqttTopics.competitionCommandAcknowledgement(competitionId, action, laneId),
      payload: command,
      expectedLaneIds: state.laneIds,
      ...(firingBoundary ? { onPublished: () => this.emitFiringBoundary(firingBoundary) } : {}),
    });
  }

  private toFiringBoundarySignal(
    competitionId: string,
    phase: CompetitionPhase,
    action: BroadcastCommandAction,
    fields: Record<string, unknown>,
    command: { commandId: string; issuedAt: string },
  ): FiringBoundarySignal | null {
    const commandIssuedAt = new Date(command.issuedAt);
    if (action === 'end-sighting') {
      return {
        competitionId,
        phase: 'SIGHTING',
        transition: 'CLOSE',
        occurredAt: commandIssuedAt,
        commandId: command.commandId,
        commandIssuedAt,
        sourceAction: action,
      };
    }
    if (action === 'start-match') {
      if (fields.timerDurationSeconds === undefined) return null;
      return {
        competitionId,
        phase: 'MATCH',
        transition: 'OPEN',
        occurredAt: new Date(String(fields.timerStartAt)),
        commandId: command.commandId,
        commandIssuedAt,
        sourceAction: action,
      };
    }
    if (action === 'timer-started' && (phase === 'SIGHTING' || phase === 'MATCH')) {
      return {
        competitionId,
        phase,
        transition: 'OPEN',
        occurredAt: new Date(String(fields.timerStartAt)),
        commandId: command.commandId,
        commandIssuedAt,
        sourceAction: action,
      };
    }
    if (action === 'timer-expired' && (phase === 'SIGHTING' || phase === 'MATCH')) {
      return {
        competitionId,
        phase,
        transition: 'CLOSE',
        occurredAt: new Date(String(fields.expiredAt)),
        commandId: command.commandId,
        commandIssuedAt,
        sourceAction: action,
      };
    }
    if (action === 'finish-competition' && phase === 'MATCH') {
      return {
        competitionId,
        phase: 'MATCH',
        transition: 'CLOSE',
        occurredAt: commandIssuedAt,
        commandId: command.commandId,
        commandIssuedAt,
        sourceAction: action,
      };
    }
    return null;
  }

  private emitFiringBoundary(boundary: FiringBoundarySignal): void {
    try {
      this.callbacks.onFiringBoundary?.(boundary);
    } catch (error) {
      logger.error(`Failed to record ${boundary.sourceAction} firing boundary:`, error);
    }
  }

  private async publishLeaveCompetitionCommands(competitionId: string, laneIds: string[]): Promise<CommandBatchResult> {
    const commands = await Promise.all(
      laneIds.map(async (laneId) => {
        const command = LeaveCompetitionCommandSchema.parse(this.commandBase({ competitionId }));
        try {
          return await this.publishCommand({
            action: 'leave-competition',
            topic: mqttTopics.laneCommand(laneId, 'leave-competition'),
            acknowledgementTopic: () => mqttTopics.laneCommandAcknowledgement(laneId, 'leave-competition'),
            payload: command,
            expectedLaneIds: [laneId],
          });
        } catch (error) {
          return this.commandPublishFailure(command.commandId, 'leave-competition', laneId, error);
        }
      }),
    );
    return { success: commands.every((command) => command.success), commands };
  }

  private async publishCompetitionState(state: CompetitionStatePayload): Promise<void> {
    this.assertConnected();
    const validated = CompetitionStatePayloadSchema.parse(state);
    await this.transport.publish(mqttTopics.competitionState(validated.competitionId), JSON.stringify(validated), {
      qos: 1,
      retain: true,
    });
    this.state.setCompetition(validated);
    this.expiry.restore(validated);
    this.state.projectCompetitionLaneData();
    this.emitStateChanged();
  }

  private updateCompetitionState(
    state: CompetitionStatePayload,
    patch: Partial<
      Pick<
        CompetitionStatePayload,
        | 'laneIds'
        | 'transferredSourceLaneIds'
        | 'pendingJoinLaneIds'
        | 'pendingSightingLaneIds'
        | 'phase'
        | 'startedAt'
        | 'finishedAt'
        | 'activeTimer'
        | 'pendingTimer'
        | 'cleanupPreparedAt'
      >
    >,
  ): CompetitionStatePayload {
    return CompetitionStatePayloadSchema.parse({
      ...state,
      ...patch,
      publishedAt: new Date().toISOString(),
    });
  }

  private commandBase(fields: Record<string, unknown>): Record<string, unknown> & { commandId: string } {
    return {
      commandId: crypto.randomUUID(),
      issuedBy: this.directorId,
      issuerId: this.directorId,
      issuedAt: new Date().toISOString(),
      ...fields,
    };
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

  private async retainTimerIntent(
    state: CompetitionStatePayload,
    action: PendingCompetitionTimer['action'],
    requestedTimer: ActiveCompetitionTimer,
  ): Promise<{ state: CompetitionStatePayload; timer: ActiveCompetitionTimer }> {
    const existing = state.pendingTimer;
    const pendingTimer: PendingCompetitionTimer =
      existing && this.timerIntentMatches(existing, action, requestedTimer)
        ? existing
        : {
            action,
            ...requestedTimer,
          };

    if (pendingTimer === existing) {
      return { state, timer: this.activeTimerFromIntent(pendingTimer) };
    }

    const preparedState = this.updateCompetitionState(state, { pendingTimer });
    await this.publishCompetitionState(preparedState);
    return { state: preparedState, timer: this.activeTimerFromIntent(pendingTimer) };
  }

  private timerIntentMatches(
    intent: PendingCompetitionTimer,
    action: PendingCompetitionTimer['action'],
    requestedTimer: ActiveCompetitionTimer,
  ): boolean {
    // A retry may arrive with a different duration after an ambiguous failure.
    // Preserve both the original deadline and duration for the same timer target;
    // some Lanes may already have applied them even when Director lost the ACK.
    return (
      intent.action === action &&
      intent.timerScope === requestedTimer.timerScope &&
      intent.stageIndex === requestedTimer.stageIndex &&
      intent.seriesIndex === requestedTimer.seriesIndex
    );
  }

  private activeTimerFromIntent(intent: PendingCompetitionTimer): ActiveCompetitionTimer {
    return {
      timerScope: intent.timerScope,
      timerStartAt: intent.timerStartAt,
      timerDurationSeconds: intent.timerDurationSeconds,
      stageIndex: intent.stageIndex,
      seriesIndex: intent.seriesIndex,
    };
  }

  private async clearCompetitionRetainedState(competitionId: string, laneIds: string[]): Promise<void> {
    const retainedTopics = laneIds.flatMap((laneId) => [
      mqttTopics.laneCompetitionState(competitionId, laneId),
      mqttTopics.laneScore(competitionId, laneId),
      mqttTopics.laneAssignment(competitionId, laneId),
      mqttTopics.timedTargetState(competitionId, laneId),
    ]);
    retainedTopics.push(mqttTopics.competitionCue(competitionId));
    const outcomes = await Promise.allSettled(
      retainedTopics.map((topic) => this.transport.publish(topic, '', { qos: 1, retain: true })),
    );

    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    if (rejected.length > 0) {
      throw new Error(`Failed to clear ${rejected.length} retained MQTT competition topic(s)`);
    }

    try {
      await this.transport.publish(mqttTopics.competitionState(competitionId), '', { qos: 1, retain: true });
    } catch {
      throw new Error('Failed to clear 1 retained MQTT competition topic(s)');
    }

    this.state.removeCompetition(competitionId);
    this.competitionCleanupLaneIds.delete(competitionId);
    if (this.activeCompetitionId === competitionId) this.activeCompetitionId = this.getMostRecentCompetitionId();
    this.expiry.clear(competitionId);
    this.state.projectCompetitionLaneData();
    this.emitStateChanged();
  }

  private completedFinishResult(laneIds: string[]): CommandExecutionResult {
    const result: CommandExecutionResult = {
      commandId: crypto.randomUUID(),
      action: 'finish-competition',
      success: true,
      lanes: laneIds.map((laneId) => ({ laneId, status: 'done' })),
    };
    this.setLastCommand(result);
    return result;
  }

  private getCompetitionCleanupLaneIds(competitionId: string): string[] {
    const state = this.requireCompetition(competitionId);
    const existing = this.competitionCleanupLaneIds.get(competitionId);
    if (existing) return [...existing];

    const laneIds = [...new Set(state.laneIds)];
    this.competitionCleanupLaneIds.set(competitionId, laneIds);
    return [...laneIds];
  }

  private commandPublishFailure(
    commandId: string,
    action: Extract<MqttCommandActionOf<'lane'>, 'join-competition' | 'leave-competition'>,
    laneId: string,
    error: unknown,
  ): CommandExecutionResult {
    const result = createLaneCommandFailure({ commandId, action, laneId, code: 'MQTT_PUBLISH_FAILED', error });
    this.setLastCommand(result);
    return result;
  }

  private resetBrokerState(): void {
    this.expiry.stop();
    this.hardwareMonitor.clear();
    this.commandDispatcher.cancelPending();
    this.activeCompetitionId = null;
    this.state.reset();
    this.competitionCleanupLaneIds.clear();
    this.readiness.reset();
    this.lastCommand = null;
    this.callbacks.onSessionReset?.();
  }

  private requireCompetition(competitionId: string): CompetitionStatePayload {
    const state = this.state.getCompetition(competitionId);
    if (!state) throw new Error(`MQTT competition not found: ${competitionId}`);
    return state;
  }

  private requireCompetitionPhase(
    competitionId: string,
    phase: CompetitionPhase,
    operation: string,
  ): CompetitionStatePayload {
    const state = this.requireCompetition(competitionId);
    if (state.phase !== phase) {
      throw new Error(`Cannot ${operation} while competition ${competitionId} is in phase ${state.phase}`);
    }
    return state;
  }

  private requireAthleteAssignmentAllowed(competitionId: string): void {
    const state = this.requireCompetition(competitionId);
    const canRepairUnpublishedResults = state.phase === 'MATCH_COMPLETE' && !state.cleanupPreparedAt;
    if (state.phase !== 'NOT_STARTED' && !canRepairUnpublishedResults) {
      throw new Error(
        `Cannot change athlete assignments while competition ${competitionId} is in phase ${state.phase}`,
      );
    }
  }

  private getMostRecentCompetitionId(): string | null {
    return (
      this.state
        .getCompetitions()
        .sort(
          (a, b) =>
            Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.competitionId.localeCompare(b.competitionId),
        )[0]?.competitionId ?? null
    );
  }

  private requireCompetitionLane(competitionId: string, laneId: string): void {
    const state = this.requireCompetition(competitionId);
    if (!state.laneIds.includes(laneId)) {
      throw new Error(`Lane ${laneId} is not joined to competition ${competitionId}`);
    }
  }

  private assertSafetyCleared(laneIds: readonly string[], operation: string): void {
    const stopped = laneIds.filter((laneId) => this.state.getLane(laneId)?.safetyState?.status === 'STOPPED');
    if (stopped.length > 0) {
      throw new Error(`Cannot ${operation}; safety STOP is active on Lane(s): ${stopped.join(', ')}`);
    }
  }

  private runSafetyOperation<T>(operation: () => Promise<T>): Promise<T> {
    return this.operations.run(['range-safety'], operation);
  }

  getClockStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    return this.readiness.getClockStartIssues(laneIds);
  }

  private assertLanesAvailableForCompetition(competitionId: string, laneIds: string[]): void {
    for (const laneId of laneIds) {
      const conflictingCompetition = this.state
        .getCompetitions()
        .find((competition) => competition.competitionId !== competitionId && competition.laneIds.includes(laneId));
      if (conflictingCompetition) {
        throw new Error(
          `Lane ${laneId} is already joined to competition ${conflictingCompetition.competitionId} (${conflictingCompetition.competitionTypeId})`,
        );
      }
    }
  }

  private assertConnected(): void {
    this.connection.assertConnected();
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
