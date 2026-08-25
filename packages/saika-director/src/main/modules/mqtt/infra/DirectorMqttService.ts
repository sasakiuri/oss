// SPDX-License-Identifier: MIT
import { Logger } from '@/shared/utils/Logger';
import {
  AdvanceSeriesCommandSchema,
  AssignAthleteCommandSchema,
  CommandAcknowledgementSchema,
  CompetitionShotPayloadSchema,
  CompetitionStatePayloadSchema,
  EndSightingCommandSchema,
  FinishCompetitionCommandSchema,
  HardwareStatePayloadSchema,
  JoinCompetitionCommandSchema,
  LaneAssignmentPayloadSchema,
  LaneCompetitionStatePayloadSchema,
  LaneScorePayloadSchema,
  LeaveCompetitionCommandSchema,
  RawShotPayloadSchema,
  ResetSessionCommandSchema,
  StartMatchCommandSchema,
  StartSightingCommandSchema,
  TimerExpiredCommandSchema,
  TimerStartedCommandSchema,
  directorSubscriptions,
  mqttTopics,
  type ActiveCompetitionTimer,
  type Athlete,
  type CommandAcknowledgement,
  type CompetitionPhase,
  type CompetitionShotPayload,
  type CompetitionStatePayload,
  type HardwareStatePayload,
  type LaneAssignmentPayload,
  type LaneCompetitionStatePayload,
  type LaneScorePayload,
  type PendingCompetitionTimer,
  type RawShotPayload,
} from '@/shared/mqtt';

import { MqttTransport, type IMqttTransport } from './MqttTransport';

const logger = Logger.create('DirectorMqttService');
// Saika Lane publishes hardware heartbeats every 60 seconds. Two missed
// heartbeats plus 30 seconds of scheduling/clock tolerance means a retained
// online state can no longer be trusted.
const HARDWARE_HEARTBEAT_STALE_AFTER_MS = 150_000;
const EXPIRED_TIMER_RETRY_DELAY_MS = 1_000;

export type DirectorCommandAction =
  | 'join-competition'
  | 'leave-competition'
  | 'start-sighting'
  | 'end-sighting'
  | 'start-match'
  | 'timer-started'
  | 'timer-expired'
  | 'advance-series'
  | 'finish-competition'
  | 'assign-athlete'
  | 'reset-session';

type BroadcastCommandAction = Extract<
  DirectorCommandAction,
  'end-sighting' | 'start-match' | 'timer-started' | 'timer-expired' | 'advance-series' | 'finish-competition'
>;

const broadcastCommandSchemas = {
  'end-sighting': EndSightingCommandSchema,
  'start-match': StartMatchCommandSchema,
  'timer-started': TimerStartedCommandSchema,
  'timer-expired': TimerExpiredCommandSchema,
  'advance-series': AdvanceSeriesCommandSchema,
  'finish-competition': FinishCompetitionCommandSchema,
} as const;

export interface DirectorLaneSnapshot {
  laneId: string;
  laneAlias: string;
  hardware: HardwareStatePayload | null;
  competitionState: LaneCompetitionStatePayload | null;
  assignment: LaneAssignmentPayload | null;
  score: LaneScorePayload | null;
  lastRawShot: RawShotPayload | null;
  lastCompetitionShot: CompetitionShotPayload | null;
  lastSeenAt: string;
}

export interface LaneCommandResult {
  laneId: string;
  status: 'done' | 'error' | 'timeout';
  error?: { code: string; message: string };
  warning?: string;
  acknowledgedAt?: string;
}

export interface CommandExecutionResult {
  commandId: string;
  action: DirectorCommandAction;
  success: boolean;
  lanes: LaneCommandResult[];
}

export interface CommandBatchResult {
  success: boolean;
  commands: CommandExecutionResult[];
}

export interface MqttControlSnapshot {
  connected: boolean;
  brokerUrl: string | null;
  activeCompetitionId: string | null;
  lanes: DirectorLaneSnapshot[];
  competitions: CompetitionStatePayload[];
  lastCommand: CommandExecutionResult | null;
}

export interface CreateCompetitionInput {
  competitionId?: string;
  competitionTypeId: string;
  competitionTypeName: string;
  discipline: string;
  roundName: string;
  acc: 'RING' | 'DECIMAL';
  shotsPerSeries: number;
  totalSeries: number;
  totalShots: number;
  laneIds: string[];
}

export interface DirectorMqttCallbacks {
  onStateChanged?: (snapshot: MqttControlSnapshot) => void;
  onCompetitionShot?: (shot: CompetitionShotPayload) => void;
  onSessionReset?: () => void;
  onError?: (message: string) => void;
  onDebugLog?: (message: string) => void;
}

export interface CompetitionResultLane {
  laneId: string;
  assignment: LaneAssignmentPayload | null;
  score: LaneScorePayload | null;
  shots: CompetitionShotPayload[];
}

export interface DirectorMqttOptions {
  directorId: string;
  commandTimeoutMs?: number;
  startDelayMs?: number;
  resubscribeRetryMs?: number;
}

interface PendingCommand {
  action: DirectorCommandAction;
  expectedLaneIds: Set<string>;
  expectedAcknowledgementTopics: Map<string, string>;
  acknowledgements: Map<string, CommandAcknowledgement>;
  resolve: (result: CommandExecutionResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PublishCommandOptions {
  action: DirectorCommandAction;
  topic: string;
  acknowledgementTopic: (laneId: string) => string;
  payload: Record<string, unknown> & { commandId: string };
  expectedLaneIds: string[];
}

interface CompetitionLaneData {
  competitionState: LaneCompetitionStatePayload | null;
  assignment: LaneAssignmentPayload | null;
  score: LaneScorePayload | null;
  lastCompetitionShot: CompetitionShotPayload | null;
}

interface CompetitionLaneSnapshotRevision {
  competitionState: number;
  score: number;
}

export class DirectorMqttService {
  private readonly transport: IMqttTransport;
  private readonly directorId: string;
  private readonly commandTimeoutMs: number;
  private readonly startDelayMs: number;
  private readonly resubscribeRetryMs: number;
  private callbacks: DirectorMqttCallbacks;
  private brokerUrl: string | null = null;
  private connected = false;
  private activeCompetitionId: string | null = null;
  private lanes = new Map<string, DirectorLaneSnapshot>();
  private competitions = new Map<string, CompetitionStatePayload>();
  private competitionLaneData = new Map<string, Map<string, CompetitionLaneData>>();
  private competitionLaneSnapshotRevisions = new Map<string, Map<string, CompetitionLaneSnapshotRevision>>();
  private competitionShots = new Map<string, Map<string, CompetitionShotPayload[]>>();
  private competitionCleanupLaneIds = new Map<string, string[]>();
  private pendingCommands = new Map<string, PendingCommand>();
  private seenShotIds = new Set<string>();
  private seenShotQueue: string[] = [];
  private lastCommand: CommandExecutionResult | null = null;
  private unsubscribeTransportEvents: Array<() => void> = [];
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private hardwareStaleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private expiredTimerPublications = new Set<string>();
  private resubscribeRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private transportConnectionEpoch = 0;
  private nextCompetitionLaneSnapshotRevision = 0;
  private competitionLaneSnapshotListeners = new Set<() => void>();
  private operationTails = new Map<string, Promise<void>>();

  constructor(
    options: DirectorMqttOptions,
    callbacks: DirectorMqttCallbacks = {},
    transport: IMqttTransport = new MqttTransport(),
  ) {
    this.directorId = options.directorId;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 10_000;
    this.startDelayMs = options.startDelayMs ?? 3_000;
    this.resubscribeRetryMs = options.resubscribeRetryMs ?? 1_000;
    this.callbacks = callbacks;
    this.transport = transport;
  }

  setCallbacks(callbacks: DirectorMqttCallbacks): void {
    this.callbacks = callbacks;
  }

  async connect(brokerUrl: string): Promise<void> {
    if (this.connected && this.transport.isConnected() && this.brokerUrl === brokerUrl) return;
    if (this.transport.isConnected()) await this.disconnect();

    this.resetBrokerState();
    this.brokerUrl = brokerUrl;
    try {
      await this.transport.connect(brokerUrl, `${this.directorId}-${crypto.randomUUID()}`);
      this.bindTransportEvents();
      await this.subscribeAsDirector();
      this.connected = true;
      this.restoreExpiryTimers();
      this.log(`Connected to ${sanitizeBrokerUrl(brokerUrl)}`);
      this.emitStateChanged();
    } catch (error) {
      this.unsubscribeTransportEvents.splice(0).forEach((unsubscribe) => unsubscribe());
      await this.transport.disconnect().catch(() => undefined);
      this.connected = false;
      this.brokerUrl = null;
      this.resetBrokerState();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.transportConnectionEpoch += 1;
    this.clearResubscribeRetryTimer();
    this.clearExpiryTimers();
    this.clearHardwareStaleTimers();
    this.resolvePendingCommandsAsTimedOut();
    this.unsubscribeTransportEvents.splice(0).forEach((unsubscribe) => unsubscribe());
    try {
      await this.transport.disconnect();
      this.log('Disconnected from MQTT broker');
    } finally {
      // A failed graceful close still invalidates this service session. Keep
      // readiness in sync so a later connect to the same broker is not skipped.
      this.connected = false;
      this.emitStateChanged();
    }
  }

  getSnapshot(): MqttControlSnapshot {
    return {
      connected: this.connected && this.transport.isConnected(),
      brokerUrl: this.brokerUrl,
      activeCompetitionId: this.activeCompetitionId,
      lanes: [...this.lanes.values()].sort((a, b) =>
        (a.laneAlias || a.laneId).localeCompare(b.laneAlias || b.laneId, 'ja', { numeric: true }),
      ),
      competitions: [...this.competitions.values()].sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
      ),
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
    this.projectCompetitionLaneData();
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
    if (result.success) this.clearCompetitionShotHistory(competitionId, laneId);
    return result;
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

  private async endSightingNow(competitionId: string): Promise<CommandExecutionResult> {
    const state = this.requireCompetitionPhase(competitionId, 'SIGHTING', 'end sighting');
    const pendingSightingLaneCount = state.pendingSightingLaneIds?.length ?? 0;
    if (pendingSightingLaneCount > 0) {
      throw new Error(`Cannot end sighting while ${pendingSightingLaneCount} Lane(s) have not started sighting`);
    }
    this.clearExpiryTimer(competitionId);
    let result: CommandExecutionResult;
    try {
      result = await this.publishBroadcast(competitionId, 'end-sighting', {});
    } catch (error) {
      this.restoreExpiryTimer(state);
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
      this.restoreExpiryTimer(state);
    }
    return result;
  }

  async startMatch(competitionId: string, durationSeconds: number): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.startMatchNow(competitionId, durationSeconds));
  }

  private async startMatchNow(competitionId: string, durationSeconds: number): Promise<CommandExecutionResult> {
    const state = this.requireCompetitionPhase(competitionId, 'SIGHTING_COMPLETE', 'start match');
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
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.advanceSeriesNow(competitionId, stageIndex, fromSeriesIndex, resumeOnly),
    );
  }

  private async advanceSeriesNow(
    competitionId: string,
    stageIndex: number,
    fromSeriesIndex: number,
    resumeOnly?: boolean,
  ): Promise<CommandExecutionResult> {
    this.requireCompetitionPhase(competitionId, 'MATCH', 'advance series');
    return this.publishBroadcast(competitionId, 'advance-series', {
      stageIndex,
      fromSeriesIndex,
      ...(resumeOnly === undefined ? {} : { resumeOnly }),
    });
  }

  async finishCompetition(
    competitionId: string,
    beforeCleanup?: (lanes: CompetitionResultLane[]) => Promise<boolean | void>,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(
      competitionId,
      () => this.finishCompetitionNow(competitionId, beforeCleanup),
      true,
    );
  }

  private async finishCompetitionNow(
    competitionId: string,
    beforeCleanup?: (lanes: CompetitionResultLane[]) => Promise<boolean | void>,
  ): Promise<CommandExecutionResult> {
    let state = this.requireCompetition(competitionId);
    this.clearExpiryTimer(competitionId);
    const finalSnapshotBaseline =
      state.phase !== 'MATCH_COMPLETE' && beforeCleanup
        ? this.captureCompetitionLaneSnapshotRevisions(competitionId, state.laneIds)
        : null;
    let result: CommandExecutionResult;
    try {
      result =
        state.phase === 'MATCH_COMPLETE'
          ? this.completedFinishResult(state.laneIds)
          : await this.publishBroadcast(competitionId, 'finish-competition', {});
    } catch (error) {
      this.restoreExpiryTimer(state);
      throw error;
    }
    if (result.success) {
      if (finalSnapshotBaseline) {
        const snapshotErrors = await this.waitForFreshFinalLaneSnapshots(
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
          ...(beforeCleanup ? {} : { cleanupPreparedAt: finishedAt }),
        });
        await this.publishCompetitionState(state);
      }

      const laneIds = this.getCompetitionCleanupLaneIds(competitionId);
      if (!state.cleanupPreparedAt) {
        const cleanupAllowed = await beforeCleanup?.(this.getCompetitionResultLanes(competitionId, laneIds));
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
      this.restoreExpiryTimer(state);
    }
    return result;
  }

  private bindTransportEvents(): void {
    this.unsubscribeTransportEvents.splice(0).forEach((unsubscribe) => unsubscribe());
    this.unsubscribeTransportEvents.push(
      this.transport.onMessage((topic, payload) => this.handleMessage(topic, payload)),
      this.transport.onConnected(() => {
        const connectionEpoch = ++this.transportConnectionEpoch;
        this.clearResubscribeRetryTimer();
        this.connected = false;
        this.resetBrokerState();
        this.emitStateChanged();
        void this.restoreSubscriptionsAfterReconnect(connectionEpoch);
      }),
      this.transport.onDisconnected(() => {
        this.transportConnectionEpoch += 1;
        this.clearResubscribeRetryTimer();
        this.connected = false;
        this.emitStateChanged();
      }),
      this.transport.onError((error) => this.handleError(error)),
    );
  }

  private async restoreSubscriptionsAfterReconnect(connectionEpoch: number, reportError = true): Promise<void> {
    try {
      await this.subscribeAsDirector();
      if (connectionEpoch !== this.transportConnectionEpoch || !this.transport.isConnected()) return;
      this.connected = true;
      this.restoreExpiryTimers();
      this.log('MQTT subscriptions restored after reconnect');
      this.emitStateChanged();
    } catch (error) {
      if (connectionEpoch !== this.transportConnectionEpoch) return;
      this.connected = false;
      this.emitStateChanged();
      if (reportError) this.handleError(error);
      this.clearResubscribeRetryTimer();
      this.resubscribeRetryTimer = setTimeout(() => {
        this.resubscribeRetryTimer = null;
        if (connectionEpoch !== this.transportConnectionEpoch || !this.transport.isConnected()) return;
        void this.restoreSubscriptionsAfterReconnect(connectionEpoch, false);
      }, this.resubscribeRetryMs);
    }
  }

  private async subscribeAsDirector(): Promise<void> {
    for (const topic of directorSubscriptions) {
      await this.transport.subscribe(topic, 1);
    }
  }

  private handleMessage(topic: string, payload: Buffer): void {
    const segments = topic.split('/');
    if (segments[0] !== 'saika') return;

    if (segments[1] === 'lane') {
      this.handleLaneTopic(segments, payload);
      return;
    }
    if (segments[1] === 'competition') {
      this.handleCompetitionTopic(segments, payload);
    }
  }

  private handleLaneTopic(segments: string[], payload: Buffer): void {
    if (segments.length === 5 && segments[3] === 'hardware' && segments[4] === 'state') {
      const state = this.parsePayload(HardwareStatePayloadSchema, payload, 'hardware state');
      if (!state || state.laneId !== segments[2]) return;
      const wasConnected = this.lanes.get(state.laneId)?.hardware?.connection.status === 'connected';
      const effectiveState = this.applyHardwareFreshness(state);
      this.updateLane(state.laneId, {
        laneAlias: state.laneAlias,
        hardware: effectiveState,
        lastSeenAt: state.publishedAt,
      });
      if (!wasConnected && effectiveState.connection.status === 'connected') {
        this.retryExpiredTimerForLane(state.laneId);
      }
      return;
    }

    if (segments.length === 5 && segments[3] === 'hardware' && segments[4] === 'shot') {
      const shot = this.parsePayload(RawShotPayloadSchema, payload, 'raw shot');
      if (!shot || shot.laneId !== segments[2]) return;
      this.updateLane(shot.laneId, {
        lastRawShot: shot,
        lastSeenAt: shot.timestamp,
      });
      return;
    }

    if (segments.length === 6 && segments[3] === 'command' && segments[5] === 'acknowledgement') {
      this.handleAcknowledgement(segments.join('/'), payload);
    }
  }

  private handleCompetitionTopic(segments: string[], payload: Buffer): void {
    if (payload.length === 0) {
      this.handleRetainedClear(segments);
      return;
    }

    if (segments.length === 4 && segments[3] === 'state') {
      const state = this.parsePayload(CompetitionStatePayloadSchema, payload, 'competition state');
      if (!state || state.competitionId !== segments[2]) return;
      this.competitions.set(state.competitionId, state);
      if (this.connected) this.restoreExpiryTimer(state);
      if (
        !this.activeCompetitionId ||
        Date.parse(state.publishedAt) >=
          Date.parse(this.competitions.get(this.activeCompetitionId)?.publishedAt ?? '1970-01-01')
      ) {
        this.activeCompetitionId = state.competitionId;
      }
      this.projectCompetitionLaneData();
      this.emitStateChanged();
      return;
    }

    if (segments.length === 7 && segments[3] === 'command' && segments[5] === 'acknowledgement') {
      this.handleAcknowledgement(segments.join('/'), payload);
      return;
    }

    if (
      segments.length === 8 &&
      segments[3] === 'lane' &&
      segments[5] === 'command' &&
      segments[7] === 'acknowledgement'
    ) {
      this.handleAcknowledgement(segments.join('/'), payload);
      return;
    }

    if (segments.length !== 6 || segments[3] !== 'lane') return;
    const laneId = segments[4];
    const kind = segments[5];
    if (!laneId) return;

    if (kind === 'state') {
      const state = this.parsePayload(LaneCompetitionStatePayloadSchema, payload, 'lane state');
      if (!state || state.laneId !== laneId || state.competitionId !== segments[2]) return;
      this.updateCompetitionLane(
        state.competitionId,
        laneId,
        {
          competitionState: state,
        },
        state.publishedAt,
      );
      return;
    }
    if (kind === 'assignment') {
      const assignment = this.parsePayload(LaneAssignmentPayloadSchema, payload, 'lane assignment');
      if (!assignment || assignment.laneId !== laneId || assignment.competitionId !== segments[2]) return;
      this.updateCompetitionLane(
        assignment.competitionId,
        laneId,
        {
          assignment,
        },
        assignment.publishedAt,
      );
      return;
    }
    if (kind === 'score') {
      const score = this.parsePayload(LaneScorePayloadSchema, payload, 'lane score');
      if (!score || score.laneId !== laneId || score.competitionId !== segments[2]) return;
      this.updateCompetitionLane(
        score.competitionId,
        laneId,
        {
          score,
        },
        score.publishedAt,
      );
      return;
    }
    if (kind === 'shot') {
      const shot = this.parsePayload(CompetitionShotPayloadSchema, payload, 'competition shot');
      if (!shot || shot.laneId !== laneId || shot.competitionId !== segments[2]) return;
      if (!this.rememberShot(shot.shotId)) return;
      this.rememberCompetitionShot(shot);
      this.updateCompetitionLane(
        shot.competitionId,
        laneId,
        {
          lastCompetitionShot: shot,
        },
        shot.publishedAt,
      );
      this.callbacks.onCompetitionShot?.(shot);
    }
  }

  private handleRetainedClear(segments: string[]): void {
    if (segments.length === 4 && segments[3] === 'state') {
      const competitionId = segments[2];
      if (!competitionId) return;
      this.competitions.delete(competitionId);
      this.competitionLaneData.delete(competitionId);
      this.competitionLaneSnapshotRevisions.delete(competitionId);
      this.competitionShots.delete(competitionId);
      this.competitionCleanupLaneIds.delete(competitionId);
      this.clearExpiryTimer(competitionId);
      if (this.activeCompetitionId === competitionId) {
        this.activeCompetitionId = this.getMostRecentCompetitionId();
      }
      this.projectCompetitionLaneData();
      this.emitStateChanged();
      return;
    }

    if (segments.length !== 6 || segments[3] !== 'lane') return;
    const laneId = segments[4];
    const kind = segments[5];
    const competitionId = segments[2];
    if (!laneId || !competitionId) return;
    if (kind === 'state') this.updateCompetitionLane(competitionId, laneId, { competitionState: null });
    if (kind === 'assignment') this.updateCompetitionLane(competitionId, laneId, { assignment: null });
    if (kind === 'score') this.updateCompetitionLane(competitionId, laneId, { score: null });
  }

  private handleAcknowledgement(topic: string, payload: Buffer): void {
    const acknowledgement = this.parsePayload(CommandAcknowledgementSchema, payload, 'command acknowledgement');
    if (!acknowledgement) return;
    const pending = this.pendingCommands.get(acknowledgement.commandId);
    if (pending?.expectedAcknowledgementTopics.get(acknowledgement.laneId) !== topic) return;

    const previous = pending.acknowledgements.get(acknowledgement.laneId);
    if (previous?.status === 'done' || previous?.status === 'error') return;

    pending.acknowledgements.set(acknowledgement.laneId, acknowledgement);
    this.emitStateChanged();
    if (acknowledgement.status === 'executing') return;

    const terminalCount = [...pending.acknowledgements.values()].filter(
      (ack) => ack.status === 'done' || ack.status === 'error',
    ).length;
    if (terminalCount === pending.expectedLaneIds.size) {
      this.completePendingCommand(acknowledgement.commandId, pending);
    }
  }

  private async publishBroadcast(
    competitionId: string,
    action: BroadcastCommandAction,
    fields: Record<string, unknown>,
  ): Promise<CommandExecutionResult> {
    const state = this.requireCompetition(competitionId);
    const command = broadcastCommandSchemas[action].parse(this.commandBase(fields));
    return this.publishCommand({
      action,
      topic: mqttTopics.competitionCommand(competitionId, action),
      acknowledgementTopic: (laneId) => mqttTopics.competitionCommandAcknowledgement(competitionId, action, laneId),
      payload: command,
      expectedLaneIds: state.laneIds,
    });
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

  private async publishCommand(options: PublishCommandOptions): Promise<CommandExecutionResult> {
    this.assertConnected();
    const expectedLaneIds = [...new Set(options.expectedLaneIds)];

    if (expectedLaneIds.length === 0) {
      await this.transport.publish(options.topic, JSON.stringify(options.payload), {
        qos: 1,
        retain: false,
      });
      const result: CommandExecutionResult = {
        commandId: options.payload.commandId,
        action: options.action,
        success: true,
        lanes: [],
      };
      this.setLastCommand(result);
      return result;
    }

    const resultPromise = new Promise<CommandExecutionResult>((resolve) => {
      const timer = setTimeout(() => {
        const pending = this.pendingCommands.get(options.payload.commandId);
        if (pending) this.completePendingCommand(options.payload.commandId, pending);
      }, this.commandTimeoutMs);

      this.pendingCommands.set(options.payload.commandId, {
        action: options.action,
        expectedLaneIds: new Set(expectedLaneIds),
        expectedAcknowledgementTopics: new Map(
          expectedLaneIds.map((laneId) => [laneId, options.acknowledgementTopic(laneId)]),
        ),
        acknowledgements: new Map(),
        resolve,
        timer,
      });
    });

    const publishPromise = this.transport.publish(options.topic, JSON.stringify(options.payload), {
      qos: 1,
      retain: false,
    });

    try {
      const outcome = await Promise.race([
        publishPromise.then(() => ({ type: 'published' as const })),
        resultPromise.then((result) => ({ type: 'completed' as const, result })),
      ]);
      if (outcome.type === 'completed') {
        // MQTT.js can keep a QoS 1 publish pending indefinitely while waiting
        // for the broker acknowledgement. The command deadline must still
        // release Director's per-competition operation queue; observe the
        // late publish so a subsequent rejection cannot become unhandled.
        void publishPromise.catch((error: unknown) => this.handleError(error));
        return outcome.result;
      }
      this.log(`Published ${options.action} (${options.payload.commandId})`);
    } catch (error) {
      const pending = this.pendingCommands.get(options.payload.commandId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(options.payload.commandId);
      }
      throw error;
    }

    return resultPromise;
  }

  private completePendingCommand(commandId: string, pending: PendingCommand): void {
    clearTimeout(pending.timer);
    this.pendingCommands.delete(commandId);
    const lanes: LaneCommandResult[] = [...pending.expectedLaneIds].map((laneId) => {
      const acknowledgement = pending.acknowledgements.get(laneId);
      if (!acknowledgement || acknowledgement.status === 'executing') {
        return { laneId, status: 'timeout' };
      }
      if (
        acknowledgement.status === 'error' &&
        ((pending.action === 'finish-competition' && acknowledgement.error?.code === 'COMPETITION_ALREADY_FINISHED') ||
          (pending.action === 'leave-competition' && acknowledgement.error?.code === 'MQTT_NOT_IN_COMPETITION'))
      ) {
        return {
          laneId,
          status: 'done',
          warning: acknowledgement.error.message,
          acknowledgedAt: acknowledgement.acknowledgedAt,
        };
      }
      return {
        laneId,
        status: acknowledgement.status,
        ...(acknowledgement.error ? { error: acknowledgement.error } : {}),
        ...(acknowledgement.warning ? { warning: acknowledgement.warning } : {}),
        acknowledgedAt: acknowledgement.acknowledgedAt,
      };
    });
    const result: CommandExecutionResult = {
      commandId,
      action: pending.action,
      success: lanes.every((lane) => lane.status === 'done'),
      lanes,
    };
    this.setLastCommand(result);
    pending.resolve(result);
  }

  private resolvePendingCommandsAsTimedOut(): void {
    for (const [commandId, pending] of this.pendingCommands) {
      this.completePendingCommand(commandId, pending);
    }
  }

  private async publishCompetitionState(state: CompetitionStatePayload): Promise<void> {
    this.assertConnected();
    const validated = CompetitionStatePayloadSchema.parse(state);
    await this.transport.publish(mqttTopics.competitionState(validated.competitionId), JSON.stringify(validated), {
      qos: 1,
      retain: true,
    });
    this.competitions.set(validated.competitionId, validated);
    this.restoreExpiryTimer(validated);
    this.projectCompetitionLaneData();
    this.emitStateChanged();
  }

  private updateCompetitionState(
    state: CompetitionStatePayload,
    patch: Partial<
      Pick<
        CompetitionStatePayload,
        | 'laneIds'
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
      issuedAt: new Date().toISOString(),
      ...fields,
    };
  }

  private runCompetitionOperation<T>(
    competitionId: string,
    operation: () => Promise<T>,
    changesMembership = false,
  ): Promise<T> {
    const keys = [`competition:${competitionId}`, ...(changesMembership ? ['competition-membership'] : [])];
    const predecessors = keys.flatMap((key) => {
      const tail = this.operationTails.get(key);
      return tail ? [tail] : [];
    });
    const result = Promise.all(predecessors).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );

    for (const key of keys) this.operationTails.set(key, tail);
    void tail.then(() => {
      for (const key of keys) {
        if (this.operationTails.get(key) === tail) this.operationTails.delete(key);
      }
    });

    return result;
  }

  private restoreExpiryTimers(): void {
    for (const state of this.competitions.values()) this.restoreExpiryTimer(state);
  }

  private restoreExpiryTimer(state: CompetitionStatePayload, minimumDelayMs = 0): void {
    const competitionId = state.competitionId;
    this.clearExpiryTimer(competitionId);
    // A replacement timer can be applied by only part of the Lane group. Until
    // the retry is confirmed, broadcasting the old expiry would prematurely
    // stop every Lane that already accepted an extension or restart.
    if (
      !state.activeTimer ||
      (state.phase !== 'SIGHTING' && state.phase !== 'MATCH') ||
      state.pendingTimer?.action === 'timer-started'
    ) {
      return;
    }

    const activeTimer = state.activeTimer;
    const timerKey = this.activeTimerKey(activeTimer);
    const expiredAtMs = Date.parse(activeTimer.timerStartAt) + activeTimer.timerDurationSeconds * 1_000;
    const delayMs = Math.max(minimumDelayMs, expiredAtMs - Date.now(), 0);
    const timer = setTimeout(() => {
      if (this.expiryTimers.get(competitionId) === timer) this.expiryTimers.delete(competitionId);
      void this.publishExpiredTimer(competitionId, timerKey).catch((error: unknown) => this.handleError(error));
    }, delayMs);
    this.expiryTimers.set(competitionId, timer);
  }

  private publishExpiredTimer(competitionId: string, expectedTimerKey: string): Promise<void> {
    return this.runCompetitionOperation(competitionId, () =>
      this.publishExpiredTimerNow(competitionId, expectedTimerKey),
    );
  }

  private async publishExpiredTimerNow(competitionId: string, expectedTimerKey: string): Promise<void> {
    if (this.expiredTimerPublications.has(competitionId)) return;
    const state = this.competitions.get(competitionId);
    const activeTimer = state?.activeTimer;
    if (
      !state ||
      !activeTimer ||
      state.pendingTimer?.action === 'timer-started' ||
      (state.phase !== 'SIGHTING' && state.phase !== 'MATCH') ||
      this.activeTimerKey(activeTimer) !== expectedTimerKey
    ) {
      return;
    }

    const expiredAtMs = Date.parse(activeTimer.timerStartAt) + activeTimer.timerDurationSeconds * 1_000;
    if (expiredAtMs > Date.now()) {
      this.restoreExpiryTimer(state);
      return;
    }

    this.expiredTimerPublications.add(competitionId);
    try {
      const result = await this.publishBroadcast(competitionId, 'timer-expired', {
        timerScope: activeTimer.timerScope,
        stageIndex: activeTimer.stageIndex,
        seriesIndex: activeTimer.seriesIndex,
        expiredAt: new Date(expiredAtMs).toISOString(),
      });
      const currentState = this.competitions.get(competitionId);
      if (
        result.success &&
        currentState?.activeTimer &&
        this.activeTimerKey(currentState.activeTimer) === expectedTimerKey
      ) {
        await this.publishCompetitionState(this.updateCompetitionState(currentState, { activeTimer: undefined }));
      }
    } finally {
      this.expiredTimerPublications.delete(competitionId);
      const retryState = this.competitions.get(competitionId);
      if (
        this.connected &&
        this.transport.isConnected() &&
        retryState?.activeTimer &&
        this.activeTimerKey(retryState.activeTimer) === expectedTimerKey
      ) {
        // The ACK batch or the retained state update may fail after the local
        // expiry timer has fired. Keep retrying with a small backoff until the
        // original deadline can be durably cleared.
        this.restoreExpiryTimer(retryState, EXPIRED_TIMER_RETRY_DELAY_MS);
      }
    }
  }

  private retryExpiredTimerForLane(laneId: string): void {
    const competitionId = this.getCompetitionIdForLane(laneId);
    if (!competitionId) return;
    const state = this.competitions.get(competitionId);
    const activeTimer = state?.activeTimer;
    if (!state || !activeTimer) return;
    const expiredAtMs = Date.parse(activeTimer.timerStartAt) + activeTimer.timerDurationSeconds * 1_000;
    if (expiredAtMs > Date.now()) return;
    void this.publishExpiredTimer(competitionId, this.activeTimerKey(activeTimer)).catch((error: unknown) =>
      this.handleError(error),
    );
  }

  private activeTimerKey(timer: ActiveCompetitionTimer): string {
    return [
      timer.timerScope,
      timer.timerStartAt,
      timer.timerDurationSeconds,
      timer.stageIndex,
      timer.seriesIndex ?? '',
    ].join(':');
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

  private clearExpiryTimer(competitionId: string): void {
    const timer = this.expiryTimers.get(competitionId);
    if (!timer) return;
    clearTimeout(timer);
    this.expiryTimers.delete(competitionId);
  }

  private clearExpiryTimers(): void {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
  }

  private applyHardwareFreshness(state: HardwareStatePayload): HardwareStatePayload {
    this.clearHardwareStaleTimer(state.laneId);
    if (state.connection.status === 'offline') return state;

    const ageMs = Math.max(0, Date.now() - Date.parse(state.publishedAt));
    const remainingFreshMs = HARDWARE_HEARTBEAT_STALE_AFTER_MS - ageMs;
    if (remainingFreshMs <= 0) return this.offlineHardwareState(state);

    const timer = setTimeout(() => {
      if (this.hardwareStaleTimers.get(state.laneId) !== timer) return;
      this.hardwareStaleTimers.delete(state.laneId);
      const current = this.lanes.get(state.laneId);
      if (!current?.hardware || current.hardware.connection.status === 'offline') return;
      this.updateLane(state.laneId, {
        hardware: this.offlineHardwareState(current.hardware),
      });
    }, remainingFreshMs);
    timer.unref();
    this.hardwareStaleTimers.set(state.laneId, timer);
    return state;
  }

  private offlineHardwareState(state: HardwareStatePayload): HardwareStatePayload {
    return {
      ...state,
      connection: { status: 'offline' },
    };
  }

  private clearHardwareStaleTimer(laneId: string): void {
    const timer = this.hardwareStaleTimers.get(laneId);
    if (!timer) return;
    clearTimeout(timer);
    this.hardwareStaleTimers.delete(laneId);
  }

  private clearHardwareStaleTimers(): void {
    for (const timer of this.hardwareStaleTimers.values()) clearTimeout(timer);
    this.hardwareStaleTimers.clear();
  }

  private clearResubscribeRetryTimer(): void {
    if (this.resubscribeRetryTimer) {
      clearTimeout(this.resubscribeRetryTimer);
      this.resubscribeRetryTimer = null;
    }
  }

  private updateLane(laneId: string, patch: Partial<Omit<DirectorLaneSnapshot, 'laneId'>>): void {
    const current = this.getOrCreateLane(laneId);
    this.lanes.set(laneId, { ...current, ...patch });
    this.emitStateChanged();
  }

  private getOrCreateLane(laneId: string): DirectorLaneSnapshot {
    return (
      this.lanes.get(laneId) ?? {
        laneId,
        laneAlias: '',
        hardware: null,
        competitionState: null,
        assignment: null,
        score: null,
        lastRawShot: null,
        lastCompetitionShot: null,
        lastSeenAt: new Date(0).toISOString(),
      }
    );
  }

  private updateCompetitionLane(
    competitionId: string,
    laneId: string,
    patch: Partial<CompetitionLaneData>,
    lastSeenAt?: string,
  ): void {
    let dataByLane = this.competitionLaneData.get(competitionId);
    if (!dataByLane) {
      dataByLane = new Map();
      this.competitionLaneData.set(competitionId, dataByLane);
    }
    const currentData = dataByLane.get(laneId) ?? {
      competitionState: null,
      assignment: null,
      score: null,
      lastCompetitionShot: null,
    };
    const updatedData = { ...currentData, ...patch };
    dataByLane.set(laneId, updatedData);
    this.updateCompetitionLaneSnapshotRevision(competitionId, laneId, patch);

    const currentLane = this.getOrCreateLane(laneId);
    const laneCompetitionId = this.getCompetitionIdForLane(laneId);
    this.lanes.set(laneId, {
      ...currentLane,
      ...(laneCompetitionId === competitionId ? updatedData : {}),
      ...(lastSeenAt ? { lastSeenAt } : {}),
    });
    this.emitStateChanged();
    this.notifyCompetitionLaneSnapshotListeners();
  }

  private updateCompetitionLaneSnapshotRevision(
    competitionId: string,
    laneId: string,
    patch: Partial<CompetitionLaneData>,
  ): void {
    const updatesCompetitionState = Object.prototype.hasOwnProperty.call(patch, 'competitionState');
    const updatesScore = Object.prototype.hasOwnProperty.call(patch, 'score');
    if (!updatesCompetitionState && !updatesScore) return;

    let revisionsByLane = this.competitionLaneSnapshotRevisions.get(competitionId);
    if (!revisionsByLane) {
      revisionsByLane = new Map();
      this.competitionLaneSnapshotRevisions.set(competitionId, revisionsByLane);
    }
    const current = revisionsByLane.get(laneId) ?? { competitionState: 0, score: 0 };
    revisionsByLane.set(laneId, {
      competitionState: updatesCompetitionState ? ++this.nextCompetitionLaneSnapshotRevision : current.competitionState,
      score: updatesScore ? ++this.nextCompetitionLaneSnapshotRevision : current.score,
    });
  }

  private captureCompetitionLaneSnapshotRevisions(
    competitionId: string,
    laneIds: string[],
  ): Map<string, CompetitionLaneSnapshotRevision> {
    const revisionsByLane = this.competitionLaneSnapshotRevisions.get(competitionId);
    return new Map(
      laneIds.map((laneId) => {
        const revision = revisionsByLane?.get(laneId) ?? { competitionState: 0, score: 0 };
        return [laneId, { ...revision }];
      }),
    );
  }

  private getFinalLaneSnapshotErrors(
    competitionId: string,
    laneIds: string[],
    baseline: Map<string, CompetitionLaneSnapshotRevision>,
    finalSnapshotCommandId: string,
  ): Map<string, string> {
    const competition = this.competitions.get(competitionId);
    const dataByLane = this.competitionLaneData.get(competitionId);
    const revisionsByLane = this.competitionLaneSnapshotRevisions.get(competitionId);
    const errors = new Map<string, string>();

    for (const laneId of laneIds) {
      const initial = baseline.get(laneId) ?? { competitionState: 0, score: 0 };
      const current = revisionsByLane?.get(laneId) ?? { competitionState: 0, score: 0 };
      const data = dataByLane?.get(laneId);
      if (current.competitionState <= initial.competitionState) {
        errors.set(laneId, `Lane ${laneId} did not publish its final competition state`);
        continue;
      }
      if (data?.competitionState?.phase !== 'FINISHED') {
        errors.set(laneId, `Lane ${laneId} did not publish a FINISHED competition state`);
        continue;
      }
      if (data.competitionState.finalSnapshotCommandId !== finalSnapshotCommandId) {
        errors.set(laneId, `Lane ${laneId} did not publish state for the current finish command`);
        continue;
      }
      if (current.score <= initial.score || !data.score) {
        errors.set(laneId, `Lane ${laneId} did not publish its final score`);
        continue;
      }
      if (data.score.finalSnapshotCommandId !== finalSnapshotCommandId) {
        errors.set(laneId, `Lane ${laneId} did not publish a score for the current finish command`);
        continue;
      }
      if (data.score.sessionId !== data.competitionState.sessionId) {
        errors.set(laneId, `Lane ${laneId} published final state and score for different sessions`);
        continue;
      }
      if (competition && data.score.acc !== competition.acc) {
        errors.set(
          laneId,
          `Lane ${laneId} published ${data.score.acc} scoring mode for a ${competition.acc} competition`,
        );
      }
    }

    return errors;
  }

  private waitForFreshFinalLaneSnapshots(
    competitionId: string,
    laneIds: string[],
    baseline: Map<string, CompetitionLaneSnapshotRevision>,
    finalSnapshotCommandId: string,
  ): Promise<Map<string, string>> {
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (errors: Map<string, string>): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.competitionLaneSnapshotListeners.delete(check);
        resolve(errors);
      };
      const check = (): void => {
        const errors = this.getFinalLaneSnapshotErrors(competitionId, laneIds, baseline, finalSnapshotCommandId);
        if (errors.size === 0) finish(errors);
      };

      this.competitionLaneSnapshotListeners.add(check);
      timer = setTimeout(
        () => finish(this.getFinalLaneSnapshotErrors(competitionId, laneIds, baseline, finalSnapshotCommandId)),
        this.commandTimeoutMs,
      );
      check();
    });
  }

  private notifyCompetitionLaneSnapshotListeners(): void {
    for (const listener of [...this.competitionLaneSnapshotListeners]) listener();
  }

  private projectCompetitionLaneData(): void {
    for (const [laneId, lane] of this.lanes) {
      const competitionId = this.getCompetitionIdForLane(laneId);
      const data = competitionId ? this.competitionLaneData.get(competitionId)?.get(laneId) : undefined;
      this.lanes.set(laneId, {
        ...lane,
        competitionState: data?.competitionState ?? null,
        assignment: data?.assignment ?? null,
        score: data?.score ?? null,
        lastCompetitionShot: data?.lastCompetitionShot ?? null,
      });
    }

    for (const state of this.competitions.values()) {
      const dataByLane = this.competitionLaneData.get(state.competitionId);
      for (const laneId of state.laneIds) {
        if (this.lanes.has(laneId) || this.getCompetitionIdForLane(laneId) !== state.competitionId) continue;
        const data = dataByLane?.get(laneId);
        this.lanes.set(laneId, { ...this.getOrCreateLane(laneId), ...(data ?? {}) });
      }
    }
  }

  private getCompetitionIdForLane(laneId: string): string | null {
    return (
      [...this.competitions.values()]
        .filter((competition) => competition.laneIds.includes(laneId))
        .sort(
          (a, b) =>
            Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.competitionId.localeCompare(b.competitionId),
        )[0]?.competitionId ?? null
    );
  }

  private rememberCompetitionShot(shot: CompetitionShotPayload): void {
    let shotsByLane = this.competitionShots.get(shot.competitionId);
    if (!shotsByLane) {
      shotsByLane = new Map();
      this.competitionShots.set(shot.competitionId, shotsByLane);
    }
    const shots = shotsByLane.get(shot.laneId) ?? [];
    shots.push(shot);
    shotsByLane.set(shot.laneId, shots);
  }

  private clearCompetitionShotHistory(competitionId: string, laneId: string): void {
    this.competitionShots.get(competitionId)?.delete(laneId);
    this.updateCompetitionLane(competitionId, laneId, { lastCompetitionShot: null });
  }

  private getCompetitionResultLanes(competitionId: string, laneIds: string[]): CompetitionResultLane[] {
    this.requireCompetition(competitionId);
    const dataByLane = this.competitionLaneData.get(competitionId);
    const shotsByLane = this.competitionShots.get(competitionId);
    return laneIds.map((laneId) => ({
      laneId,
      assignment: dataByLane?.get(laneId)?.assignment ?? null,
      score: dataByLane?.get(laneId)?.score ?? null,
      shots: [...(shotsByLane?.get(laneId) ?? [])]
        .filter((shot) => shot.scored && shot.isRecorded)
        .sort(
          (a, b) =>
            a.stageIndex - b.stageIndex ||
            a.seriesIndex - b.seriesIndex ||
            a.shotNumberInSeries - b.shotNumberInSeries ||
            Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
        ),
    }));
  }

  private async clearCompetitionRetainedState(competitionId: string, laneIds: string[]): Promise<void> {
    const laneTopics = laneIds.flatMap((laneId) =>
      ['state', 'score', 'assignment'].map((kind) => `saika/competition/${competitionId}/lane/${laneId}/${kind}`),
    );
    const outcomes = await Promise.allSettled(
      laneTopics.map((topic) => this.transport.publish(topic, '', { qos: 1, retain: true })),
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

    this.competitions.delete(competitionId);
    this.competitionLaneData.delete(competitionId);
    this.competitionLaneSnapshotRevisions.delete(competitionId);
    this.competitionShots.delete(competitionId);
    this.competitionCleanupLaneIds.delete(competitionId);
    if (this.activeCompetitionId === competitionId) this.activeCompetitionId = this.getMostRecentCompetitionId();
    this.clearExpiryTimer(competitionId);
    this.projectCompetitionLaneData();
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
    action: Extract<DirectorCommandAction, 'join-competition' | 'leave-competition'>,
    laneId: string,
    error: unknown,
  ): CommandExecutionResult {
    const result: CommandExecutionResult = {
      commandId,
      action,
      success: false,
      lanes: [
        {
          laneId,
          status: 'error',
          error: {
            code: 'MQTT_PUBLISH_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
        },
      ],
    };
    this.setLastCommand(result);
    return result;
  }

  private resetBrokerState(): void {
    this.clearExpiryTimers();
    this.clearHardwareStaleTimers();
    this.expiredTimerPublications.clear();
    this.resolvePendingCommandsAsTimedOut();
    this.activeCompetitionId = null;
    this.lanes.clear();
    this.competitions.clear();
    this.competitionLaneData.clear();
    this.competitionLaneSnapshotRevisions.clear();
    this.competitionShots.clear();
    this.competitionCleanupLaneIds.clear();
    this.seenShotIds.clear();
    this.seenShotQueue = [];
    this.lastCommand = null;
    this.callbacks.onSessionReset?.();
  }

  private rememberShot(shotId: string): boolean {
    if (this.seenShotIds.has(shotId)) return false;
    this.seenShotIds.add(shotId);
    this.seenShotQueue.push(shotId);
    if (this.seenShotQueue.length > 10_000) {
      const oldest = this.seenShotQueue.shift();
      if (oldest) this.seenShotIds.delete(oldest);
    }
    return true;
  }

  private parsePayload<T>(
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: Error } },
    payload: Buffer,
    label: string,
  ): T | null {
    let value: unknown;
    try {
      value = JSON.parse(payload.toString('utf8'));
    } catch {
      this.log(`Ignored invalid JSON for ${label}`);
      return null;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      this.log(`Ignored invalid ${label}: ${result.error.message}`);
      return null;
    }
    return result.data;
  }

  private requireCompetition(competitionId: string): CompetitionStatePayload {
    const state = this.competitions.get(competitionId);
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
      [...this.competitions.values()].sort(
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

  private assertLanesAvailableForCompetition(competitionId: string, laneIds: string[]): void {
    for (const laneId of laneIds) {
      const conflictingCompetition = [...this.competitions.values()].find(
        (competition) => competition.competitionId !== competitionId && competition.laneIds.includes(laneId),
      );
      if (conflictingCompetition) {
        throw new Error(
          `Lane ${laneId} is already joined to competition ${conflictingCompetition.competitionId} (${conflictingCompetition.competitionTypeId})`,
        );
      }
    }
  }

  private assertConnected(): void {
    if (!this.connected || !this.transport.isConnected()) {
      throw new Error('MQTT client is not connected');
    }
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
    this.callbacks.onDebugLog?.(`[MQTT] ${message}`);
  }
}

export function sanitizeBrokerUrl(brokerUrl: string): string {
  return brokerUrl.replace(/^(mqtts?:\/\/)[^@/]+@/, '$1***@');
}
