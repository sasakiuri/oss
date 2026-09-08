// SPDX-License-Identifier: MIT
import type { FinalFiringTransportInput } from '@/main/modules/final-recovery-firing';
import type {
  CompetitionStartIssue,
  CompetitionStartScope,
} from '@/main/shared-infra/operations/CompetitionStartReadiness';
import {
  ActivateSafetyStopCommandSchema,
  AdvanceSeriesCommandSchema,
  ApplyQualificationRecoveryCommandSchema,
  AssignAthleteCommandSchema,
  CancelQualificationRecoveryCommandSchema,
  CancelTimedTargetCommandSchema,
  RecordTimedTargetUnloadCommandSchema,
  ClearSafetyStopCommandSchema,
  CommandAcknowledgementSchema,
  CompetitionCuePayloadSchema,
  CompetitionShootOffShotPayloadSchema,
  CompetitionShotPayloadSchema,
  CompetitionStatePayloadSchema,
  EndSightingCommandSchema,
  EstComplaintSignalPayloadSchema,
  FinishCompetitionCommandSchema,
  HardwareStatePayloadSchema,
  JoinCompetitionCommandSchema,
  LaneAssignmentPayloadSchema,
  LaneCompetitionStatePayloadSchema,
  LaneSafetyStatePayloadSchema,
  QualificationMalfunctionSignalPayloadSchema,
  RangeOfficerRequestPayloadSchema,
  LaneScorePayloadSchema,
  LeaveCompetitionCommandSchema,
  RawShotPayloadSchema,
  ShotObservationEvidencePayloadSchema,
  ResetSessionCommandSchema,
  SettleQualificationRecoveryCommandSchema,
  PauseTimerCommandSchema,
  ProbeClockCommandSchema,
  QualificationRecoveryShotPayloadSchema,
  QualificationRecoveryStatePayloadSchema,
  ResumeMatchCommandSchema,
  ResumeTimerCommandSchema,
  RetireFinalistCommandSchema,
  StartMatchCommandSchema,
  StartQualificationRecoveryCommandSchema,
  StartSightingCommandSchema,
  StartShootOffCommandSchema,
  StartTimedTargetCommandSchema,
  StopShootOffCommandSchema,
  TimerExpiredCommandSchema,
  TimerStartedCommandSchema,
  TimedTargetStatePayloadSchema,
  directorSubscriptions,
  mqttTopics,
  type ActiveCompetitionTimer,
  type Athlete,
  type CommandAcknowledgement,
  type CompetitionPhase,
  type CompetitionCuePayload,
  type CompetitionShootOffShotPayload,
  type CompetitionShotPayload,
  type CompetitionStatePayload,
  type EstComplaintSignalPayload,
  type HardwareStatePayload,
  type LaneAssignmentPayload,
  type LaneCompetitionStatePayload,
  type LaneScorePayload,
  type LaneSafetyStatePayload,
  type QualificationMalfunctionSignalPayload,
  type RangeOfficerRequestPayload,
  type TimedTargetStatePayload,
  type PendingCompetitionTimer,
  type QualificationRecoveryFiringAuthorizationPayload,
  type QualificationRecoveryShotPayload,
  type QualificationRecoveryStatePayload,
  type RawShotPayload,
  type ShotObservationEvidencePayload,
  ClockProbeAcknowledgementDataSchema,
} from '@/shared/mqtt';
import { MalfunctionFiringEvidenceSchema } from '@/shared/mqtt/MalfunctionFiring';
import {
  ReserveLaneTransferActionSchema,
  ReserveLaneTransferBundleSchema,
  type ReserveLaneTransferAction,
} from '@/shared/mqtt/ReserveLaneTransfer';
import { Logger } from '@/shared/utils/Logger';

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
import { LaneTimingEvidencePolicy } from '../domain/LaneTimingEvidencePolicy';
import { TimedTargetReadinessPolicy, type ITimedTargetReadinessPolicy } from '../domain/TimedTargetReadinessPolicy';

import { MqttTransport, type IMqttTransport, type MqttCredentials } from './MqttTransport';

const logger = Logger.create('DirectorMqttService');
// Saika Lane publishes hardware heartbeats every 60 seconds. Two missed
// heartbeats plus 30 seconds of scheduling/clock tolerance means a retained
// online state can no longer be trusted.
const HARDWARE_HEARTBEAT_STALE_AFTER_MS = 150_000;
const EXPIRED_TIMER_RETRY_DELAY_MS = 1_000;

export type DirectorCommandAction =
  | 'activate-safety-stop'
  | 'clear-safety-stop'
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
  | 'reset-session'
  | 'pause-timer'
  | 'resume-timer'
  | 'resume-match'
  | 'start-qualification-recovery'
  | 'cancel-qualification-recovery'
  | 'apply-qualification-recovery'
  | 'settle-qualification-recovery'
  | 'retire-finalist'
  | 'start-shoot-off'
  | 'stop-shoot-off'
  | 'start-timed-target'
  | 'cancel-timed-target'
  | 'record-timed-target-unload'
  | 'probe-clock'
  | 'reserve-lane-transfer'
  | 'start-malfunction-firing'
  | 'read-malfunction-firing'
  | 'cancel-malfunction-firing';

export type ShootOffTiming =
  | { readonly type: 'GENERIC'; readonly durationSeconds: number }
  | {
      readonly type: 'TIMED_TARGET';
      readonly programId: string;
      readonly participantExecution: 'SIMULTANEOUS' | 'SEQUENTIAL';
    };

type BroadcastCommandAction = Extract<
  DirectorCommandAction,
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

export interface DirectorLaneSnapshot {
  laneId: string;
  laneAlias: string;
  hardware: HardwareStatePayload | null;
  safetyState: LaneSafetyStatePayload | null;
  rangeOfficerRequest?: RangeOfficerRequestPayload | null;
  qualificationMalfunctionSignal?: QualificationMalfunctionSignalPayload | null;
  estComplaintSignal?: EstComplaintSignalPayload | null;
  timedTargetState?: TimedTargetStatePayload | null;
  qualificationRecoveryState?: QualificationRecoveryStatePayload | null;
  competitionState: LaneCompetitionStatePayload | null;
  assignment: LaneAssignmentPayload | null;
  score: LaneScorePayload | null;
  lastRawShot: RawShotPayload | null;
  lastCompetitionShot: CompetitionShotPayload | null;
  lastQualificationRecoveryShot?: QualificationRecoveryShotPayload | null;
  lastSeenAt: string;
}

export interface LaneCommandResult {
  laneId: string;
  status: 'done' | 'error' | 'timeout';
  error?: { code: string; message: string };
  warning?: string;
  acknowledgedAt?: string;
  data?: Record<string, unknown>;
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

export interface LaneClockProbeResult {
  command: CommandExecutionResult;
  assessment: ClockQualityAssessment;
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
  competitionUnit?: 'INDIVIDUAL' | 'MIXED_TEAM';
  definitionBinding?: CompetitionStatePayload['definitionBinding'];
  acc: 'RING' | 'DECIMAL';
  shotsPerSeries: number;
  totalSeries: number;
  totalShots: number;
  laneIds: string[];
}

export interface DirectorMqttCallbacks {
  assertPhaseStartAllowed?: (scope: CompetitionStartScope) => void;
  assertCompetitionFinishAllowed?: (competitionId: string) => void;
  onStateChanged?: (snapshot: MqttControlSnapshot) => void;
  /** Called for every valid delivery, including duplicates and replay deliveries. */
  onCompetitionShotObserved?: (shot: CompetitionShotPayload, payloadJson: string) => void;
  /** Called for every valid one-shot Final tie-break delivery; persistence handles replay idempotence. */
  onCompetitionShootOffShotObserved?: (shot: CompetitionShootOffShotPayload, payloadJson: string) => void;
  /** Called for every isolated Qualification recovery shot; persistence must handle QoS replay idempotently. */
  onQualificationRecoveryShotObserved?: (shot: QualificationRecoveryShotPayload, payloadJson: string) => void;
  /** Called for every valid retained Qualification recovery state publication. */
  onQualificationRecoveryStateObserved?: (state: QualificationRecoveryStatePayload, payloadJson: string) => void;
  onCompetitionShot?: (shot: CompetitionShotPayload) => void;
  /** Called for every durable Lane observation outcome; duplicates are journal-safe by evidenceId. */
  onShotObservationEvidenceObserved?: (evidence: ShotObservationEvidencePayload, payloadJson: string) => void;
  /** Called once the broker has accepted a command that opens or closes firing. */
  onFiringBoundary?: (boundary: FiringBoundarySignal) => void;
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
  credentials?: MqttCredentials;
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
  onPublished?: () => void;
}

interface CompetitionLaneData {
  competitionState: LaneCompetitionStatePayload | null;
  assignment: LaneAssignmentPayload | null;
  score: LaneScorePayload | null;
  lastCompetitionShot: CompetitionShotPayload | null;
  timedTargetState: TimedTargetStatePayload | null;
  qualificationRecoveryState: QualificationRecoveryStatePayload | null;
  lastQualificationRecoveryShot: QualificationRecoveryShotPayload | null;
}

export interface StartQualificationRecoveryInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly runId: string;
  readonly decisionId: string;
  readonly interruptionId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly authorization: QualificationRecoveryFiringAuthorizationPayload;
  readonly officialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: string;
}

export interface CancelQualificationRecoveryInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly runId: string;
  readonly reason: string;
}

export interface ApplyQualificationRecoveryInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly runId: string;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: string;
}

export interface SettleQualificationRecoveryInput {
  readonly competitionId: string;
  readonly laneId: string;
  readonly decisionId: string;
  readonly interruptionId: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly treatment: 'KEEP_RECORDED_SERIES';
  readonly decisionOfficialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: string;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: string;
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
  private clockQualityByLaneId = new Map<string, ClockQualityAssessment>();
  private readonly credentials: MqttCredentials | undefined;
  private timingEvidencePolicy = new LaneTimingEvidencePolicy();

  constructor(
    options: DirectorMqttOptions,
    callbacks: DirectorMqttCallbacks = {},
    transport: IMqttTransport = new MqttTransport(),
    private clockQualityPolicy: IClockQualityPolicy = new ClockQualityPolicy(),
    private readonly definitionCompatibilityPolicy: ICompetitionDefinitionCompatibilityPolicy = new CompetitionDefinitionCompatibilityPolicy(),
    private timedTargetReadinessPolicy: ITimedTargetReadinessPolicy = new TimedTargetReadinessPolicy(),
  ) {
    this.directorId = options.directorId;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 10_000;
    this.startDelayMs = options.startDelayMs ?? 3_000;
    this.resubscribeRetryMs = options.resubscribeRetryMs ?? 1_000;
    this.callbacks = callbacks;
    this.transport = transport;
    this.credentials = options.credentials;
  }

  /** New tolerances require fresh probes, so cached approvals cannot survive a policy change. */
  setClockQualityPolicy(policy: IClockQualityPolicy): void {
    this.clockQualityPolicy = policy;
    this.clockQualityByLaneId.clear();
  }

  setTimedTargetReadinessPolicy(policy: ITimedTargetReadinessPolicy): void {
    this.timedTargetReadinessPolicy = policy;
  }

  setTimingEvidencePolicy(policy: LaneTimingEvidencePolicy): void {
    this.timingEvidencePolicy = policy;
  }

  getTimingEvidenceStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    return laneIds.flatMap((laneId) => {
      const hardware = this.lanes.get(laneId)?.hardware;
      return this.timingEvidencePolicy.assess(laneId, {
        connected: this.connected && hardware?.connection.status === 'connected',
        reportedAt: hardware?.publishedAt,
        connection: hardware?.connection,
        evidence: hardware?.capabilities?.timingEvidence,
        settings: hardware?.capabilities?.timedTargetPolicy?.shotTiming,
      });
    });
  }

  getTimedTargetStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    return laneIds.flatMap((laneId) => {
      const hardware = this.lanes.get(laneId)?.hardware;
      const policy = hardware?.capabilities?.timedTargetPolicy;
      const physical = hardware?.capabilities?.targetIntegration?.timedTarget;
      return this.timedTargetReadinessPolicy.assess(laneId, {
        connected: this.connected && hardware?.connection.status === 'connected',
        reportedAt: hardware?.publishedAt,
        enforcementMode: policy?.enforcementMode,
        shotTiming: policy?.shotTiming,
        physicalActuation: physical?.actuation,
        physicalFeedback: physical?.feedback,
      });
    });
  }

  private assertTimedTargetReadiness(laneIds: readonly string[]): void {
    const issues = this.getTimedTargetStartIssues(laneIds).filter((issue) => issue.blocking);
    if (issues.length) throw new Error(`Timed target readiness: ${issues.map((issue) => issue.message).join('; ')}`);
  }

  getClockQuality(laneId?: string): Readonly<Record<string, ClockQualityAssessment>> | ClockQualityAssessment | null {
    const current = (assessment: ClockQualityAssessment): ClockQualityAssessment => ({
      ...assessment,
      usableForTimedCommands: this.clockQualityPolicy.isUsable(assessment),
    });
    if (laneId !== undefined) {
      const assessment = this.clockQualityByLaneId.get(laneId);
      return assessment ? current(assessment) : null;
    }
    return Object.fromEntries([...this.clockQualityByLaneId].map(([id, assessment]) => [id, current(assessment)]));
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
    if (!this.lanes.has(laneId)) throw new Error(`Lane not found: ${laneId}`);
    const directorSentAt = new Date();
    const command = ProbeClockCommandSchema.parse(this.commandBase({ directorSentAt: directorSentAt.toISOString() }));
    const result = await this.publishCommand({
      action: 'probe-clock',
      topic: mqttTopics.laneCommand(laneId, 'probe-clock'),
      acknowledgementTopic: () => mqttTopics.laneCommandAcknowledgement(laneId, 'probe-clock'),
      payload: command,
      expectedLaneIds: [laneId],
    });
    const directorReceivedAt = new Date();
    const laneResult = result.lanes[0];
    const parsed = ClockProbeAcknowledgementDataSchema.safeParse(laneResult?.data);
    const assessment =
      laneResult?.status === 'done' && parsed.success && parsed.data.directorSentAt === command.directorSentAt
        ? this.clockQualityPolicy.assess(
            {
              directorSentAtMs: directorSentAt.getTime(),
              laneReceivedAtMs: Date.parse(parsed.data.laneReceivedAt),
              laneSentAtMs: Date.parse(parsed.data.laneSentAt),
              directorReceivedAtMs: directorReceivedAt.getTime(),
            },
            directorReceivedAt,
          )
        : this.clockQualityPolicy.unavailable(
            directorReceivedAt,
            laneResult?.status === 'timeout'
              ? 'The Lane clock probe timed out.'
              : 'The Lane returned no valid clock-probe timestamps.',
          );
    this.clockQualityByLaneId.set(laneId, assessment);
    return { command: result, assessment };
  }

  /** Activates a competition-independent safety latch on every selected Lane. */
  activateSafetyStop(
    laneIds: string[],
    safetyStopId: string,
    reason: string,
    officialName: string,
  ): Promise<CommandBatchResult> {
    return this.runSafetyOperation(async () => {
      const targets = this.requireKnownLanes(laneIds);
      const commands = await Promise.all(
        targets.map((laneId) =>
          this.activateLaneSafetyStopNow(laneId, safetyStopId, reason, officialName).catch((error) =>
            this.safetyCommandFailure('activate-safety-stop', laneId, error),
          ),
        ),
      );
      return { success: commands.every((command) => command.success), commands };
    });
  }

  clearSafetyStop(
    laneIds: string[],
    safetyStopId: string,
    clearanceReason: string,
    officialName: string,
  ): Promise<CommandBatchResult> {
    return this.runSafetyOperation(async () => {
      const targets = this.requireKnownLanes(laneIds);
      const commands = await Promise.all(
        targets.map((laneId) =>
          this.clearLaneSafetyStopNow(laneId, safetyStopId, clearanceReason, officialName).catch((error) =>
            this.safetyCommandFailure('clear-safety-stop', laneId, error),
          ),
        ),
      );
      return { success: commands.every((command) => command.success), commands };
    });
  }

  private activateLaneSafetyStopNow(
    laneId: string,
    safetyStopId: string,
    reason: string,
    officialName: string,
  ): Promise<CommandExecutionResult> {
    const command = ActivateSafetyStopCommandSchema.parse(
      this.commandBase({ safetyStopId, reason, issuedBy: officialName }),
    );
    return this.publishCommand({
      action: 'activate-safety-stop',
      topic: mqttTopics.laneCommand(laneId, 'activate-safety-stop'),
      acknowledgementTopic: () => mqttTopics.laneCommandAcknowledgement(laneId, 'activate-safety-stop'),
      payload: command,
      expectedLaneIds: [laneId],
      onPublished: () => this.log(`Emergency STOP published for Lane ${laneId} (${safetyStopId})`),
    });
  }

  private clearLaneSafetyStopNow(
    laneId: string,
    safetyStopId: string,
    clearanceReason: string,
    officialName: string,
  ): Promise<CommandExecutionResult> {
    const command = ClearSafetyStopCommandSchema.parse(
      this.commandBase({ safetyStopId, clearanceReason, confirmedSafe: true, issuedBy: officialName }),
    );
    return this.publishCommand({
      action: 'clear-safety-stop',
      topic: mqttTopics.laneCommand(laneId, 'clear-safety-stop'),
      acknowledgementTopic: () => mqttTopics.laneCommandAcknowledgement(laneId, 'clear-safety-stop'),
      payload: command,
      expectedLaneIds: [laneId],
    });
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
      await this.transport.connect(brokerUrl, `${this.directorId}-${crypto.randomUUID()}`, this.credentials);
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
        this.lanes.get(laneId)?.hardware?.capabilities,
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
    return this.runCompetitionOperation(competitionId, async () => {
      const competition = this.requireCompetitionPhase(competitionId, 'MATCH', 'retire a finalist');
      if (competition.roundName !== 'Final') throw new Error('Only a Final competitor can be retired');
      this.requireCompetitionLane(competitionId, laneId);
      const command = RetireFinalistCommandSchema.parse(this.commandBase({ checkpointId, rank, afterShot }));
      return this.publishCommand({
        action: 'retire-finalist',
        topic: mqttTopics.laneCompetitionCommand(competitionId, laneId, 'retire-finalist'),
        acknowledgementTopic: () =>
          mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, laneId, 'retire-finalist'),
        payload: command,
        expectedLaneIds: [laneId],
      });
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
    return this.runCompetitionOperation(competitionId, async () => {
      const state = this.requireCompetitionPhase(competitionId, 'MATCH', 'start a Final shoot-off');
      if (state.roundName !== 'Final') throw new Error('A shoot-off can only be started for a Final');
      const targetLaneIds = [...new Set(eligibleLaneIds)];
      if (targetLaneIds.length < 2) throw new Error('A shoot-off requires at least two eligible Lanes');
      targetLaneIds.forEach((laneId) => this.requireCompetitionLane(competitionId, laneId));
      const notReady = targetLaneIds.filter((laneId) => {
        const lane = this.lanes.get(laneId)?.competitionState;
        return lane?.competitionId !== competitionId || lane.phase !== 'SERIES_COMPLETE';
      });
      if (notReady.length > 0) {
        throw new Error(`Shoot-off Lanes are not at a completed Final series: ${notReady.join(', ')}`);
      }
      this.assertSafetyCleared(targetLaneIds, 'start a Final shoot-off');
      this.assertTimedCommandReadiness(targetLaneIds);
      if (timing.type === 'TIMED_TARGET') {
        this.assertTimedTargetReadiness(targetLaneIds);
        const stillActive = targetLaneIds.filter((laneId) => {
          const timedState = this.lanes.get(laneId)?.timedTargetState;
          return timedState && timedState.phase !== 'COMPLETE' && timedState.phase !== 'CANCELLED';
        });
        if (stillActive.length > 0) {
          throw new Error(`A timed target sequence is already active on shoot-off Lane(s): ${stillActive.join(', ')}`);
        }
      }
      const earliestStartMs =
        timing.type === 'TIMED_TARGET'
          ? targetLaneIds.reduce((latest, laneId) => {
              const nextLoad = this.lanes.get(laneId)?.timedTargetState?.nextLoadAllowedAt;
              return nextLoad ? Math.max(latest, Date.parse(nextLoad)) : latest;
            }, Date.now() + this.startDelayMs)
          : Date.now() + this.startDelayMs;
      const command = StartShootOffCommandSchema.parse(
        this.commandBase({
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
      return this.publishCommand({
        action: 'start-shoot-off',
        topic: mqttTopics.competitionCommand(competitionId, 'start-shoot-off'),
        acknowledgementTopic: (laneId) =>
          mqttTopics.competitionCommandAcknowledgement(competitionId, 'start-shoot-off', laneId),
        payload: command,
        expectedLaneIds: targetLaneIds,
      });
    });
  }

  async stopShootOff(
    competitionId: string,
    runId: string,
    iteration: number,
    eligibleLaneIds: readonly string[],
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, async () => {
      const state = this.requireCompetitionPhase(competitionId, 'MATCH', 'stop a Final shoot-off');
      if (state.roundName !== 'Final') throw new Error('A shoot-off can only be stopped for a Final');
      const targetLaneIds = [...new Set(eligibleLaneIds)];
      if (targetLaneIds.length < 2) throw new Error('A shoot-off requires at least two eligible Lanes');
      targetLaneIds.forEach((laneId) => this.requireCompetitionLane(competitionId, laneId));
      const command = StopShootOffCommandSchema.parse(this.commandBase({ runId, iteration, targetLaneIds }));
      return this.publishCommand({
        action: 'stop-shoot-off',
        topic: mqttTopics.competitionCommand(competitionId, 'stop-shoot-off'),
        acknowledgementTopic: (laneId) =>
          mqttTopics.competitionCommandAcknowledgement(competitionId, 'stop-shoot-off', laneId),
        payload: command,
        expectedLaneIds: targetLaneIds,
      });
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

  async pauseLaneTimer(competitionId: string, laneId: string, interruptionId: string): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.pauseLaneTimerNow(competitionId, laneId, interruptionId),
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
    return this.runCompetitionOperation(competitionId, async () => {
      const uniqueLaneIds = this.requireRangeOperationLanes(competitionId, laneIds);
      const commands = await Promise.all(
        uniqueLaneIds.map((laneId) =>
          this.pauseLaneTimerNow(competitionId, laneId, interruptionId).catch((error) =>
            this.interruptionCommandFailure('pause-timer', laneId, error),
          ),
        ),
      );
      return { success: commands.every((command) => command.success), commands };
    });
  }

  private async pauseLaneTimerNow(
    competitionId: string,
    laneId: string,
    interruptionId: string,
  ): Promise<CommandExecutionResult> {
    const state = this.requireActiveFiringPhase(competitionId, 'pause a Lane timer');
    this.requireCompetitionLane(competitionId, laneId);
    const pausedAt = new Date().toISOString();
    const command = PauseTimerCommandSchema.parse(this.commandBase({ interruptionId, pausedAt }));
    return this.publishCommand({
      action: 'pause-timer',
      topic: mqttTopics.laneCompetitionCommand(competitionId, laneId, 'pause-timer'),
      acknowledgementTopic: () =>
        mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, laneId, 'pause-timer'),
      payload: command,
      expectedLaneIds: [laneId],
      onPublished: () =>
        this.log(`Lane-specific STOP published for ${laneId} during ${state.phase} (${interruptionId})`),
    });
  }

  getFinalFiringContext(competitionId: string, laneId: string) {
    const competition = this.requireCompetitionPhase(competitionId, 'MATCH', 'prepare Final recovery firing');
    if (competition.roundName !== 'Final') throw new Error('Final recovery requires a Final competition');
    this.requireCompetitionLane(competitionId, laneId);
    const lane = this.lanes.get(laneId);
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
    return this.runCompetitionOperation(competitionId, async () => {
      this.requireCompetitionLane(competitionId, input.laneId);
      if (input.request.workflow !== 'FINAL_RECOVERY') throw new Error('Final firing workflow is required');
      if (input.operation === 'START') {
        this.getFinalFiringContext(competitionId, input.laneId);
        this.assertTimedCommandReadiness([input.laneId]);
        this.assertTimedTargetReadiness([input.laneId]);
        if (this.lanes.get(input.laneId)?.safetyState?.status !== 'CLEAR')
          throw new Error('Clear the Lane safety STOP before authorized recovery firing');
      }
      const action =
        input.operation === 'START'
          ? 'start-malfunction-firing'
          : input.operation === 'READ'
            ? 'read-malfunction-firing'
            : 'cancel-malfunction-firing';
      const command = this.commandBase(
        input.operation === 'START'
          ? { request: input.request }
          : {
              runId: input.request.runId,
              ...(input.operation === 'CANCEL' ? { request: input.request } : {}),
              ...(input.reason ? { reason: input.reason } : {}),
            },
      );
      const result = await this.publishCommand({
        action,
        payload: command,
        topic: mqttTopics.laneCompetitionCommand(competitionId, input.laneId, action),
        acknowledgementTopic: () =>
          mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, input.laneId, action),
        expectedLaneIds: [input.laneId],
      });
      const response = result.lanes.find((lane) => lane.laneId === input.laneId);
      if (!result.success || response?.status !== 'done')
        throw new Error(response?.error?.message ?? 'Final firing was not acknowledged; read or retry the same run');
      return MalfunctionFiringEvidenceSchema.parse(response.data?.evidence);
    });
  }

  async transferReserveLane(input: { competitionId: string; laneId: string; transfer: ReserveLaneTransferAction }) {
    return this.runCompetitionOperation(input.competitionId, async () => {
      const competition = this.requireCompetitionPhase(input.competitionId, 'MATCH', 'transfer to a reserve Lane');
      if (competition.roundName === 'Final')
        throw new Error('Final state transfer requires a separate recovery protocol');
      this.requireCompetitionLane(input.competitionId, input.laneId);
      if (
        !['CANCEL_SOURCE', 'CANCEL_TARGET'].includes(input.transfer.operation) &&
        this.lanes.get(input.laneId)?.safetyState?.status !== 'STOPPED'
      )
        throw new Error('Apply and retain the Lane safety STOP during transfer');
      const transfer = ReserveLaneTransferActionSchema.parse(input.transfer);
      const command = this.commandBase({ transfer });
      const result = await this.publishCommand({
        action: 'reserve-lane-transfer',
        payload: command,
        topic: mqttTopics.laneCompetitionCommand(input.competitionId, input.laneId, 'reserve-lane-transfer'),
        acknowledgementTopic: () =>
          mqttTopics.laneCompetitionCommandAcknowledgement(input.competitionId, input.laneId, 'reserve-lane-transfer'),
        expectedLaneIds: [input.laneId],
      });
      const response = result.lanes.find((lane) => lane.laneId === input.laneId);
      if (!result.success || response?.status !== 'done')
        throw new Error(response?.error?.message ?? 'Reserve transfer was not acknowledged; retry the same transfer');
      const bundle = ReserveLaneTransferBundleSchema.parse(response.data?.bundle);
      const expectedId =
        transfer.operation === 'PREPARE_SOURCE'
          ? transfer.request.id
          : 'bundle' in transfer
            ? transfer.bundle.request.id
            : transfer.id;
      if (bundle.request.id !== expectedId || bundle.request.competitionId !== input.competitionId)
        throw new Error('Lane acknowledged a different transfer');
      if (
        transfer.operation === 'PREPARE_SOURCE' &&
        JSON.stringify(bundle.request) !== JSON.stringify(transfer.request)
      )
        throw new Error('Lane returned different transfer instructions');
      if (
        transfer.operation !== 'PREPARE_SOURCE' &&
        bundle.digest !== ('bundle' in transfer ? transfer.bundle.digest : transfer.digest)
      )
        throw new Error('Lane acknowledged another transfer snapshot');
      if (transfer.operation === 'RETIRE_SOURCE') {
        await this.publishCompetitionState(
          this.updateCompetitionState(competition, {
            transferredSourceLaneIds: [...new Set([...(competition.transferredSourceLaneIds ?? []), input.laneId])],
          }),
        );
      }
      return bundle;
    });
  }

  async resumeLaneTimer(
    competitionId: string,
    laneId: string,
    interruptionId: string,
    authorizedRemainingSeconds: number,
    unlimitedSightingShots: boolean,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.resumeLaneTimerNow(
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
    return this.runCompetitionOperation(competitionId, async () => {
      const uniqueLaneIds = this.requireRangeOperationLanes(competitionId, laneIds);
      this.assertTimedCommandReadiness(uniqueLaneIds);
      const timerStartAt = new Date(Date.now() + this.startDelayMs).toISOString();
      const commands = await Promise.all(
        uniqueLaneIds.map((laneId) =>
          this.resumeLaneTimerNow(
            competitionId,
            laneId,
            interruptionId,
            authorizedRemainingSeconds,
            unlimitedSightingShots,
            true,
            timerStartAt,
          ).catch((error) => this.interruptionCommandFailure('resume-timer', laneId, error)),
        ),
      );
      return { success: commands.every((command) => command.success), commands };
    });
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
    this.requireCompetitionLane(competitionId, laneId);
    this.assertSafetyCleared([laneId], 'resume a Lane timer');
    if (!clockQualityAlreadyChecked) this.assertTimedCommandReadiness([laneId]);
    const command = ResumeTimerCommandSchema.parse(
      this.commandBase({
        interruptionId,
        timerStartAt: sharedTimerStartAt ?? new Date(Date.now() + this.startDelayMs).toISOString(),
        authorizedRemainingSeconds,
        unlimitedSightingShots,
      }),
    );
    return this.publishCommand({
      action: 'resume-timer',
      topic: mqttTopics.laneCompetitionCommand(competitionId, laneId, 'resume-timer'),
      acknowledgementTopic: () =>
        mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, laneId, 'resume-timer'),
      payload: command,
      expectedLaneIds: [laneId],
    });
  }

  async resumeLaneMatch(
    competitionId: string,
    laneId: string,
    interruptionId: string,
  ): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () =>
      this.resumeLaneMatchNow(competitionId, laneId, interruptionId),
    );
  }

  async resumeRangeMatch(
    competitionId: string,
    laneIds: string[],
    interruptionId: string,
  ): Promise<CommandBatchResult> {
    return this.runCompetitionOperation(competitionId, async () => {
      const uniqueLaneIds = this.requireRangeOperationLanes(competitionId, laneIds);
      const commands = await Promise.all(
        uniqueLaneIds.map((laneId) =>
          this.resumeLaneMatchNow(competitionId, laneId, interruptionId).catch((error) =>
            this.interruptionCommandFailure('resume-match', laneId, error),
          ),
        ),
      );
      return { success: commands.every((command) => command.success), commands };
    });
  }

  private async resumeLaneMatchNow(
    competitionId: string,
    laneId: string,
    interruptionId: string,
  ): Promise<CommandExecutionResult> {
    this.requireActiveFiringPhase(competitionId, 'resume MATCH fire on a Lane');
    this.requireCompetitionLane(competitionId, laneId);
    this.assertSafetyCleared([laneId], 'resume MATCH fire on a Lane');
    const command = ResumeMatchCommandSchema.parse(this.commandBase({ interruptionId }));
    return this.publishCommand({
      action: 'resume-match',
      topic: mqttTopics.laneCompetitionCommand(competitionId, laneId, 'resume-match'),
      acknowledgementTopic: () =>
        mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, laneId, 'resume-match'),
      payload: command,
      expectedLaneIds: [laneId],
    });
  }

  /**
   * Executes one firing phase from an official Qualification recovery decision.
   * Recommendation, score credit and ordinary series mutation remain outside
   * this transport boundary.
   */
  async startQualificationRecovery(input: StartQualificationRecoveryInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, () => this.startQualificationRecoveryNow(input));
  }

  private async startQualificationRecoveryNow(input: StartQualificationRecoveryInput): Promise<CommandExecutionResult> {
    this.requireCompetitionPhase(input.competitionId, 'MATCH', 'start a Qualification recovery');
    this.requireCompetitionLane(input.competitionId, input.laneId);
    this.assertSafetyCleared([input.laneId], 'start a Qualification recovery');
    this.assertTimedCommandReadiness([input.laneId]);
    this.assertTimedTargetReadiness([input.laneId]);

    const lane = this.lanes.get(input.laneId);
    const laneState = lane?.competitionState;
    if (!laneState || laneState.competitionId !== input.competitionId) {
      throw new Error(`Lane ${input.laneId} has no current state for competition ${input.competitionId}`);
    }
    if (laneState.phase !== 'MATCH' && laneState.phase !== 'SERIES_COMPLETE') {
      throw new Error(`Qualification recovery cannot start from Lane phase ${laneState.phase}`);
    }
    if (laneState.currentStage.index !== input.stageIndex || laneState.currentSeries.index !== input.seriesIndex) {
      throw new Error(
        `Recovery context ${input.stageIndex}:${input.seriesIndex} does not match Lane ${laneState.currentStage.index}:${laneState.currentSeries.index}`,
      );
    }
    if (laneState.currentSeries.maxShots !== input.expectedSeriesShotLimit) {
      throw new Error(
        `Recovery shot limit ${input.expectedSeriesShotLimit} does not match Lane ${laneState.currentSeries.maxShots}`,
      );
    }
    if (laneState.currentSeries.shotsRecorded !== input.expectedRecordedShots) {
      throw new Error(
        `Recovery recorded-shot count ${input.expectedRecordedShots} does not match Lane ${laneState.currentSeries.shotsRecorded}`,
      );
    }
    if (!laneState.interruption || laneState.interruption.interruptionId !== input.interruptionId) {
      throw new Error(`Lane ${input.laneId} is not paused for interruption ${input.interruptionId}`);
    }
    if (laneState.interruption.status !== 'PAUSED') {
      throw new Error(
        `Qualification recovery requires a PAUSED interruption; current status is ${laneState.interruption.status}`,
      );
    }

    const recoveryState = lane?.qualificationRecoveryState;
    if (recoveryState?.status === 'RUNNING' && recoveryState.runId !== input.runId) {
      throw new Error(`Qualification recovery run ${recoveryState.runId} is already active on Lane ${input.laneId}`);
    }
    const timedState = lane?.timedTargetState;
    const retriesCurrentRun =
      timedState?.executionContext?.owner === 'qualification-recovery' &&
      timedState.executionContext.referenceId === input.runId;
    if (timedState && timedState.phase !== 'COMPLETE' && timedState.phase !== 'CANCELLED' && !retriesCurrentRun) {
      throw new Error(`A timed target sequence is already active on Lane ${input.laneId}`);
    }

    const decidedAtMs = Date.parse(input.decidedAt);
    if (!Number.isFinite(decidedAtMs)) throw new Error('Qualification recovery decision time is invalid');
    const originalLoadAt =
      recoveryState?.runId === input.runId ? recoveryState.loadAt : retriesCurrentRun ? timedState.loadAt : undefined;
    const loadAt =
      originalLoadAt ??
      new Date(
        Math.max(
          Date.now() + this.startDelayMs,
          decidedAtMs,
          timedState ? Date.parse(timedState.nextLoadAllowedAt) : Number.NEGATIVE_INFINITY,
        ),
      ).toISOString();
    const command = StartQualificationRecoveryCommandSchema.parse(
      this.commandBase({
        runId: input.runId,
        decisionId: input.decisionId,
        interruptionId: input.interruptionId,
        stageIndex: input.stageIndex,
        seriesIndex: input.seriesIndex,
        expectedMatchProgramId: input.expectedMatchProgramId,
        expectedSeriesShotLimit: input.expectedSeriesShotLimit,
        expectedRecordedShots: input.expectedRecordedShots,
        authorization: input.authorization,
        loadAt,
        officialName: input.officialName,
        decisionRuleReference: input.decisionRuleReference,
        decidedAt: input.decidedAt,
        issuedBy: input.officialName,
      }),
    );
    return this.publishCommand({
      action: 'start-qualification-recovery',
      topic: mqttTopics.laneCompetitionCommand(input.competitionId, input.laneId, 'start-qualification-recovery'),
      acknowledgementTopic: () =>
        mqttTopics.laneCompetitionCommandAcknowledgement(
          input.competitionId,
          input.laneId,
          'start-qualification-recovery',
        ),
      payload: command,
      expectedLaneIds: [input.laneId],
    });
  }

  async cancelQualificationRecovery(input: CancelQualificationRecoveryInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, async () => {
      this.requireCompetition(input.competitionId);
      this.requireCompetitionLane(input.competitionId, input.laneId);
      const active = this.lanes.get(input.laneId)?.qualificationRecoveryState;
      if (active?.status === 'RUNNING' && active.runId !== input.runId) {
        throw new Error(`Qualification recovery run ${active.runId} is active instead of ${input.runId}`);
      }
      const command = CancelQualificationRecoveryCommandSchema.parse(
        this.commandBase({ runId: input.runId, reason: input.reason }),
      );
      return this.publishCommand({
        action: 'cancel-qualification-recovery',
        topic: mqttTopics.laneCompetitionCommand(input.competitionId, input.laneId, 'cancel-qualification-recovery'),
        acknowledgementTopic: () =>
          mqttTopics.laneCompetitionCommandAcknowledgement(
            input.competitionId,
            input.laneId,
            'cancel-qualification-recovery',
          ),
        payload: command,
        expectedLaneIds: [input.laneId],
      });
    });
  }

  async applyQualificationRecovery(input: ApplyQualificationRecoveryInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, async () => {
      this.requireCompetition(input.competitionId);
      this.requireCompetitionLane(input.competitionId, input.laneId);
      const recovery = this.lanes.get(input.laneId)?.qualificationRecoveryState;
      if (!recovery || recovery.runId !== input.runId) {
        throw new Error(`Qualification recovery run ${input.runId} is not current on Lane ${input.laneId}`);
      }
      if (recovery.status !== 'COMPLETED') {
        throw new Error(`Qualification recovery run ${input.runId} is not completed on Lane ${input.laneId}`);
      }
      if (recovery.authorization.phase !== 'SERIES_RECOVERY') {
        throw new Error('Extra sighting shots can never be applied to the MATCH score');
      }
      const command = ApplyQualificationRecoveryCommandSchema.parse(
        this.commandBase({
          runId: input.runId,
          appliedBy: input.appliedBy,
          statement: input.statement,
          appliedAt: input.appliedAt,
          issuedBy: input.appliedBy,
        }),
      );
      return this.publishCommand({
        action: 'apply-qualification-recovery',
        topic: mqttTopics.laneCompetitionCommand(input.competitionId, input.laneId, 'apply-qualification-recovery'),
        acknowledgementTopic: () =>
          mqttTopics.laneCompetitionCommandAcknowledgement(
            input.competitionId,
            input.laneId,
            'apply-qualification-recovery',
          ),
        payload: command,
        expectedLaneIds: [input.laneId],
      });
    });
  }

  async settleQualificationRecovery(input: SettleQualificationRecoveryInput): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, async () => {
      this.requireCompetition(input.competitionId);
      this.requireCompetitionLane(input.competitionId, input.laneId);
      const recovery = this.lanes.get(input.laneId)?.qualificationRecoveryState;
      if (recovery?.status === 'RUNNING') {
        throw new Error(`Qualification recovery run ${recovery.runId} is still running on Lane ${input.laneId}`);
      }
      const command = SettleQualificationRecoveryCommandSchema.parse(
        this.commandBase({
          decisionId: input.decisionId,
          interruptionId: input.interruptionId,
          stageIndex: input.stageIndex,
          seriesIndex: input.seriesIndex,
          expectedMatchProgramId: input.expectedMatchProgramId,
          expectedSeriesShotLimit: input.expectedSeriesShotLimit,
          expectedRecordedShots: input.expectedRecordedShots,
          treatment: input.treatment,
          decisionOfficialName: input.decisionOfficialName,
          decisionRuleReference: input.decisionRuleReference,
          decidedAt: input.decidedAt,
          appliedBy: input.appliedBy,
          statement: input.statement,
          appliedAt: input.appliedAt,
          issuedBy: input.appliedBy,
        }),
      );
      return this.publishCommand({
        action: 'settle-qualification-recovery',
        topic: mqttTopics.laneCompetitionCommand(input.competitionId, input.laneId, 'settle-qualification-recovery'),
        acknowledgementTopic: () =>
          mqttTopics.laneCompetitionCommandAcknowledgement(
            input.competitionId,
            input.laneId,
            'settle-qualification-recovery',
          ),
        payload: command,
        expectedLaneIds: [input.laneId],
      });
    });
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
    this.assertTimedCommandReadiness(expectedLaneIds);
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
    this.clearExpiryTimer(competitionId);
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
        this.restoreExpiryTimer(state);
      }
      return result;
    } catch (error) {
      this.restoreExpiryTimer(state);
      throw error;
    }
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

  async startMatch(competitionId: string, durationSeconds?: number): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(competitionId, () => this.startMatchNow(competitionId, durationSeconds));
  }

  private async startMatchNow(competitionId: string, durationSeconds?: number): Promise<CommandExecutionResult> {
    const state = this.requireCompetitionPhase(competitionId, 'SIGHTING_COMPLETE', 'start match');
    // With no generic timer, MATCH only arms the enclosing phase; the target program opens firing later.
    if (durationSeconds !== undefined)
      this.callbacks.assertPhaseStartAllowed?.({ competitionId, phase: 'MATCH', laneIds: state.laneIds });
    this.assertSafetyCleared(state.laneIds, 'start match');
    this.assertTimedCommandReadiness(state.laneIds);
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

  async startTimedTarget(input: {
    competitionId: string;
    programId: string;
    purpose: 'SIGHTING' | 'MATCH';
    stageIndex: number;
    seriesIndex: number;
    targetLaneIds?: readonly string[];
  }): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, () => this.startTimedTargetNow(input));
  }

  private async startTimedTargetNow(input: {
    competitionId: string;
    programId: string;
    purpose: 'SIGHTING' | 'MATCH';
    stageIndex: number;
    seriesIndex: number;
    targetLaneIds?: readonly string[];
  }): Promise<CommandExecutionResult> {
    const competition = this.requireCompetitionPhase(input.competitionId, 'MATCH', 'start a timed target sequence');
    const targetLaneIds = [...new Set(input.targetLaneIds ?? competition.laneIds)];
    if (targetLaneIds.length === 0) throw new Error('A timed target sequence requires at least one Lane');
    targetLaneIds.forEach((laneId) => this.requireCompetitionLane(input.competitionId, laneId));
    this.assertSafetyCleared(targetLaneIds, 'start a timed target sequence');
    this.assertTimedCommandReadiness(targetLaneIds);
    this.assertTimedTargetReadiness(targetLaneIds);

    const notReady = await this.waitForTimedTargetLaneReadiness(
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
      const state = this.lanes.get(laneId)?.timedTargetState;
      return state && state.phase !== 'COMPLETE' && state.phase !== 'CANCELLED';
    });
    if (stillActive.length > 0) {
      throw new Error(`A timed target sequence is already active on Lane(s): ${stillActive.join(', ')}`);
    }

    const awaitingUnload = targetLaneIds.filter((laneId) => {
      const pause = this.lanes.get(laneId)?.timedTargetState?.commandPause;
      return pause?.mode === 'REQUIRED' && !pause.unloadAt;
    });
    if (awaitingUnload.length) throw new Error(`Record UNLOAD before LOAD on Lane(s): ${awaitingUnload.join(', ')}`);
    this.callbacks.assertPhaseStartAllowed?.({
      competitionId: input.competitionId,
      phase: input.purpose,
      laneIds: targetLaneIds,
    });
    this.assertSafetyCleared(targetLaneIds, 'start a timed target sequence');
    this.assertTimedCommandReadiness(targetLaneIds);
    this.assertTimedTargetReadiness(targetLaneIds);
    const earliestLoadMs = targetLaneIds.reduce((latest, laneId) => {
      const nextLoad = this.lanes.get(laneId)?.timedTargetState?.nextLoadAllowedAt;
      return nextLoad ? Math.max(latest, Date.parse(nextLoad)) : latest;
    }, Date.now() + this.startDelayMs);
    const command = StartTimedTargetCommandSchema.parse(
      this.commandBase({
        programId: input.programId,
        purpose: input.purpose,
        stageIndex: input.stageIndex,
        seriesIndex: input.seriesIndex,
        loadAt: new Date(earliestLoadMs).toISOString(),
        targetLaneIds,
      }),
    );
    return this.publishCommand({
      action: 'start-timed-target',
      topic: mqttTopics.competitionCommand(input.competitionId, 'start-timed-target'),
      acknowledgementTopic: (laneId) =>
        mqttTopics.competitionCommandAcknowledgement(input.competitionId, 'start-timed-target', laneId),
      payload: command,
      expectedLaneIds: targetLaneIds,
    });
  }

  async recordTimedTargetUnload(input: {
    competitionId: string;
    sequenceId: string;
    observedAt: string;
    officialName: string;
    targetLaneIds: readonly string[];
  }): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, async () => {
      this.requireCompetition(input.competitionId);
      const targetLaneIds = [...new Set(input.targetLaneIds)];
      if (!targetLaneIds.length) throw new Error('UNLOAD requires at least one Lane');
      for (const laneId of targetLaneIds) {
        this.requireCompetitionLane(input.competitionId, laneId);
        const state = this.lanes.get(laneId)?.timedTargetState;
        if (!state || state.sequenceId !== input.sequenceId || !['COMPLETE', 'CANCELLED'].includes(state.phase)) {
          throw new Error(`UNLOAD sequence is not completed or cancelled on Lane ${laneId}`);
        }
      }
      const command = RecordTimedTargetUnloadCommandSchema.parse(
        this.commandBase({
          sequenceId: input.sequenceId,
          observedAt: input.observedAt,
          officialName: input.officialName,
          targetLaneIds,
        }),
      );
      return this.publishCommand({
        action: 'record-timed-target-unload',
        topic: mqttTopics.competitionCommand(input.competitionId, 'record-timed-target-unload'),
        acknowledgementTopic: (laneId) =>
          mqttTopics.competitionCommandAcknowledgement(input.competitionId, 'record-timed-target-unload', laneId),
        payload: command,
        expectedLaneIds: targetLaneIds,
      });
    });
  }

  async cancelTimedTarget(input: {
    competitionId: string;
    sequenceId: string;
    reason: string;
    targetLaneIds?: readonly string[];
  }): Promise<CommandExecutionResult> {
    return this.runCompetitionOperation(input.competitionId, async () => {
      const competition = this.requireCompetition(input.competitionId);
      const targetLaneIds = [...new Set(input.targetLaneIds ?? competition.laneIds)];
      if (targetLaneIds.length === 0) throw new Error('Timed target cancellation requires at least one Lane');
      targetLaneIds.forEach((laneId) => this.requireCompetitionLane(input.competitionId, laneId));
      const command = CancelTimedTargetCommandSchema.parse(
        this.commandBase({ sequenceId: input.sequenceId, reason: input.reason, targetLaneIds }),
      );
      return this.publishCommand({
        action: 'cancel-timed-target',
        topic: mqttTopics.competitionCommand(input.competitionId, 'cancel-timed-target'),
        acknowledgementTopic: (laneId) =>
          mqttTopics.competitionCommandAcknowledgement(input.competitionId, 'cancel-timed-target', laneId),
        payload: command,
        expectedLaneIds: targetLaneIds,
      });
    });
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
    this.assertTimedCommandReadiness(state.laneIds);
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
    if (nextSeriesTimer) this.assertTimedCommandReadiness(state.laneIds);
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
          ...(beforeCleanup || beforeDataClear ? {} : { cleanupPreparedAt: finishedAt }),
        });
        await this.publishCompetitionState(state);
      }

      const laneIds = this.getCompetitionCleanupLaneIds(competitionId);
      await beforeDataClear?.();
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

    if (segments.length === 5 && segments[3] === 'safety' && segments[4] === 'state') {
      const state = this.parsePayload(LaneSafetyStatePayloadSchema, payload, 'Lane safety state');
      if (!state || state.laneId !== segments[2]) return;
      this.updateLane(state.laneId, {
        safetyState: state,
        lastSeenAt: state.publishedAt,
      });
      return;
    }

    if (segments.length === 5 && segments[3] === 'range-officer' && segments[4] === 'request') {
      const state = this.parsePayload(RangeOfficerRequestPayloadSchema, payload, 'Range Officer request');
      if (!state || state.laneId !== segments[2]) return;
      this.updateLane(state.laneId, {
        rangeOfficerRequest: state,
        lastSeenAt: state.publishedAt,
      });
      return;
    }

    if (segments.length === 5 && segments[3] === 'qualification-malfunction' && segments[4] === 'signal') {
      const state = this.parsePayload(
        QualificationMalfunctionSignalPayloadSchema,
        payload,
        'qualification malfunction signal',
      );
      if (!state || state.laneId !== segments[2]) return;
      this.updateLane(state.laneId, {
        qualificationMalfunctionSignal: state,
        lastSeenAt: state.publishedAt,
      });
      return;
    }

    if (segments.length === 5 && segments[3] === 'est-complaint' && segments[4] === 'signal') {
      const state = this.parsePayload(EstComplaintSignalPayloadSchema, payload, 'EST complaint signal');
      if (!state || state.laneId !== segments[2]) return;
      this.updateLane(state.laneId, {
        estComplaintSignal: state,
        lastSeenAt: state.publishedAt,
      });
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

    if (segments.length === 5 && segments[3] === 'hardware' && segments[4] === 'observation') {
      const evidence = this.parsePayload(ShotObservationEvidencePayloadSchema, payload, 'shot observation evidence');
      if (!evidence || evidence.laneId !== segments[2] || evidence.competition !== null) return;
      this.callbacks.onShotObservationEvidenceObserved?.(evidence, payload.toString('utf8'));
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

    if (segments.length === 7 && segments[3] === 'lane' && segments[5] === 'shoot-off' && segments[6] === 'shot') {
      const shot = this.parsePayload(CompetitionShootOffShotPayloadSchema, payload, 'competition shoot-off shot');
      if (!shot || shot.competitionId !== segments[2] || shot.laneId !== segments[4]) return;
      this.callbacks.onCompetitionShootOffShotObserved?.(shot, payload.toString('utf8'));
      return;
    }

    if (segments.length === 7 && segments[3] === 'lane' && segments[5] === 'timed-target' && segments[6] === 'state') {
      const state = this.parsePayload(TimedTargetStatePayloadSchema, payload, 'timed target state');
      const laneId = segments[4];
      if (!state || !laneId || state.laneId !== laneId || state.competitionId !== segments[2]) return;
      this.updateCompetitionLane(state.competitionId, laneId, { timedTargetState: state }, state.publishedAt);
      return;
    }

    if (
      segments.length === 7 &&
      segments[3] === 'lane' &&
      segments[5] === 'qualification-recovery' &&
      segments[6] === 'state'
    ) {
      const state = this.parsePayload(QualificationRecoveryStatePayloadSchema, payload, 'Qualification recovery state');
      const laneId = segments[4];
      if (!state || !laneId || state.laneId !== laneId || state.competitionId !== segments[2]) return;
      this.callbacks.onQualificationRecoveryStateObserved?.(state, payload.toString('utf8'));
      this.updateCompetitionLane(state.competitionId, laneId, { qualificationRecoveryState: state }, state.publishedAt);
      return;
    }

    if (
      segments.length === 7 &&
      segments[3] === 'lane' &&
      segments[5] === 'qualification-recovery' &&
      segments[6] === 'shot'
    ) {
      const shot = this.parsePayload(QualificationRecoveryShotPayloadSchema, payload, 'Qualification recovery shot');
      const laneId = segments[4];
      if (!shot || !laneId || shot.laneId !== laneId || shot.competitionId !== segments[2]) return;
      this.callbacks.onQualificationRecoveryShotObserved?.(shot, payload.toString('utf8'));
      this.updateCompetitionLane(shot.competitionId, laneId, { lastQualificationRecoveryShot: shot }, shot.publishedAt);
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
      this.callbacks.onCompetitionShotObserved?.(shot, payload.toString('utf8'));
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
      return;
    }
    if (kind === 'observation') {
      const evidence = this.parsePayload(ShotObservationEvidencePayloadSchema, payload, 'shot observation evidence');
      if (!evidence || evidence.laneId !== laneId || evidence.competition?.competitionId !== segments[2]) return;
      this.callbacks.onShotObservationEvidenceObserved?.(evidence, payload.toString('utf8'));
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

    if (segments.length === 7 && segments[3] === 'lane' && segments[5] === 'timed-target' && segments[6] === 'state') {
      const laneId = segments[4];
      const competitionId = segments[2];
      if (!laneId || !competitionId) return;
      this.updateCompetitionLane(competitionId, laneId, { timedTargetState: null });
      return;
    }

    if (
      segments.length === 7 &&
      segments[3] === 'lane' &&
      segments[5] === 'qualification-recovery' &&
      segments[6] === 'state'
    ) {
      const laneId = segments[4];
      const competitionId = segments[2];
      if (!laneId || !competitionId) return;
      this.updateCompetitionLane(competitionId, laneId, { qualificationRecoveryState: null });
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

  private async publishCommand(options: PublishCommandOptions): Promise<CommandExecutionResult> {
    this.assertConnected();
    const expectedLaneIds = [...new Set(options.expectedLaneIds)];

    if (expectedLaneIds.length === 0) {
      await this.transport.publish(options.topic, JSON.stringify(options.payload), {
        qos: 1,
        retain: false,
      });
      options.onPublished?.();
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

    const publishPromise = this.transport
      .publish(options.topic, JSON.stringify(options.payload), {
        qos: 1,
        retain: false,
      })
      .then(() => options.onPublished?.());

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
        ...(acknowledgement.data ? { data: acknowledgement.data } : {}),
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
        safetyState: null,
        rangeOfficerRequest: null,
        qualificationMalfunctionSignal: null,
        estComplaintSignal: null,
        timedTargetState: null,
        qualificationRecoveryState: null,
        competitionState: null,
        assignment: null,
        score: null,
        lastRawShot: null,
        lastCompetitionShot: null,
        lastQualificationRecoveryShot: null,
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
      timedTargetState: null,
      qualificationRecoveryState: null,
      lastQualificationRecoveryShot: null,
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

  /**
   * State publications are independent of command acknowledgements. Waiting on
   * the snapshot stream removes a transport race between a series transition
   * and the subsequent absolute-time target command.
   */
  private waitForTimedTargetLaneReadiness(
    competitionId: string,
    laneIds: readonly string[],
    stageIndex: number,
    seriesIndex: number,
  ): Promise<string[]> {
    const findNotReady = (): string[] =>
      laneIds.filter((laneId) => {
        const lane = this.lanes.get(laneId)?.competitionState;
        return (
          lane?.competitionId !== competitionId ||
          lane.phase !== 'MATCH' ||
          lane.currentStage.index !== stageIndex ||
          lane.currentSeries.index !== seriesIndex ||
          lane.awaitingSeriesStart === true
        );
      });

    const initial = findNotReady();
    if (initial.length === 0) return Promise.resolve([]);
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (remaining: string[]): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.competitionLaneSnapshotListeners.delete(check);
        resolve(remaining);
      };
      const check = (): void => {
        const remaining = findNotReady();
        if (remaining.length === 0) finish(remaining);
      };

      this.competitionLaneSnapshotListeners.add(check);
      timer = setTimeout(() => finish(findNotReady()), this.commandTimeoutMs);
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
        timedTargetState: data?.timedTargetState ?? null,
        qualificationRecoveryState: data?.qualificationRecoveryState ?? null,
        lastQualificationRecoveryShot: data?.lastQualificationRecoveryShot ?? null,
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
    return laneIds
      .filter((laneId) => !this.competitions.get(competitionId)?.transferredSourceLaneIds?.includes(laneId))
      .map((laneId) => ({
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
    const retainedTopics = laneIds.flatMap((laneId) =>
      ['state', 'score', 'assignment', 'timed-target/state'].map(
        (kind) => `saika/competition/${competitionId}/lane/${laneId}/${kind}`,
      ),
    );
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

  private interruptionCommandFailure(
    action: Extract<DirectorCommandAction, 'pause-timer' | 'resume-timer' | 'resume-match'>,
    laneId: string,
    error: unknown,
  ): CommandExecutionResult {
    const result: CommandExecutionResult = {
      commandId: crypto.randomUUID(),
      action,
      success: false,
      lanes: [
        {
          laneId,
          status: 'error',
          error: {
            code: 'RANGE_COMMAND_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
        },
      ],
    };
    this.setLastCommand(result);
    return result;
  }

  private safetyCommandFailure(
    action: Extract<DirectorCommandAction, 'activate-safety-stop' | 'clear-safety-stop'>,
    laneId: string,
    error: unknown,
  ): CommandExecutionResult {
    const result: CommandExecutionResult = {
      commandId: crypto.randomUUID(),
      action,
      success: false,
      lanes: [
        {
          laneId,
          status: 'error',
          error: {
            code: 'SAFETY_COMMAND_FAILED',
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
    this.clockQualityByLaneId.clear();
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

  private requireActiveFiringPhase(competitionId: string, operation: string): CompetitionStatePayload {
    const state = this.requireCompetition(competitionId);
    if (state.phase !== 'SIGHTING' && state.phase !== 'MATCH') {
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

  private requireRangeOperationLanes(competitionId: string, laneIds: readonly string[]): string[] {
    const uniqueLaneIds = [...new Set(laneIds)];
    if (uniqueLaneIds.length === 0) throw new Error('A range operation requires at least one Lane');
    this.requireActiveFiringPhase(competitionId, 'operate range interruption timers');
    uniqueLaneIds.forEach((laneId) => this.requireCompetitionLane(competitionId, laneId));
    return uniqueLaneIds;
  }

  private requireKnownLanes(laneIds: readonly string[]): string[] {
    const uniqueLaneIds = [...new Set(laneIds)];
    if (uniqueLaneIds.length === 0) throw new Error('A safety operation requires at least one Lane');
    const unknown = uniqueLaneIds.filter((laneId) => !this.lanes.has(laneId));
    if (unknown.length > 0) throw new Error(`Unknown Lane(s): ${unknown.join(', ')}`);
    return uniqueLaneIds;
  }

  private assertSafetyCleared(laneIds: readonly string[], operation: string): void {
    const stopped = laneIds.filter((laneId) => this.lanes.get(laneId)?.safetyState?.status === 'STOPPED');
    if (stopped.length > 0) {
      throw new Error(`Cannot ${operation}; safety STOP is active on Lane(s): ${stopped.join(', ')}`);
    }
  }

  private runSafetyOperation<T>(operation: () => Promise<T>): Promise<T> {
    const key = 'range-safety';
    const predecessor = this.operationTails.get(key) ?? Promise.resolve();
    const result = predecessor.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.operationTails.set(key, tail);
    void tail.then(() => {
      if (this.operationTails.get(key) === tail) this.operationTails.delete(key);
    });
    return result;
  }

  getClockStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    const mode = this.clockQualityPolicy.mode;
    if (mode === 'DISABLED') return [];
    const now = new Date();
    return laneIds.flatMap((laneId) => {
      const assessment = this.clockQualityByLaneId.get(laneId);
      const age = assessment ? now.getTime() - Date.parse(assessment.sampledAt) : NaN;
      const healthy =
        assessment &&
        (mode === 'REQUIRED'
          ? this.clockQualityPolicy.isUsable(assessment, now)
          : assessment.status === 'GOOD' && age >= 0 && age <= assessment.maxSampleAgeMilliseconds);
      return healthy
        ? []
        : [
            {
              code: 'CLOCK_QUALITY',
              message: `Probe Lane ${laneId}: a fresh GOOD clock-quality sample is missing.`,
              blocking: mode === 'REQUIRED',
            },
          ];
    });
  }

  private assertTimedCommandReadiness(laneIds: readonly string[]): void {
    const evidenceIssues = this.getTimingEvidenceStartIssues(laneIds).filter((issue) => issue.blocking);
    if (evidenceIssues.length)
      throw new Error(`Timing evidence: ${evidenceIssues.map((issue) => issue.message).join('; ')}`);
    this.assertClockQualityForTimedCommands(laneIds);
  }

  private assertClockQualityForTimedCommands(laneIds: readonly string[]): void {
    const issues = this.getClockStartIssues(laneIds).filter((issue) => issue.blocking);
    if (issues.length > 0) {
      throw new Error(
        `Fresh GOOD clock-quality samples are required before timed commands; ${issues.map((issue) => issue.message).join('; ')}`,
      );
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
