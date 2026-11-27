// SPDX-License-Identifier: MIT
import { parseMqttTopic, type ParsedMqttTopic, type ParsedMqttTopicOf } from '@sasakiuri/saika-protocol/topics';
import { CommandAcknowledgementSchema, type CommandAcknowledgement } from '@sasakiuri/saika-protocol/Acknowledgement';
import { CompetitionShootOffShotPayloadSchema } from '@sasakiuri/saika-protocol/CompetitionShootOffShot';
import {
  CompetitionStatePayloadSchema,
  type CompetitionStatePayload,
} from '@sasakiuri/saika-protocol/CompetitionState';
import { EstComplaintSignalPayloadSchema } from '@sasakiuri/saika-protocol/EstComplaintSignal';
import { LaneAssignmentPayloadSchema } from '@sasakiuri/saika-protocol/LaneAssignment';
import { LaneScorePayloadSchema } from '@sasakiuri/saika-protocol/LaneScore';
import {
  HardwareStatePayloadSchema,
  LaneCompetitionStatePayloadSchema,
  LaneSafetyStatePayloadSchema,
  type HardwareStatePayload,
} from '@sasakiuri/saika-protocol/LaneState';
import { QualificationMalfunctionSignalPayloadSchema } from '@sasakiuri/saika-protocol/QualificationMalfunctionSignal';
import {
  QualificationRecoveryShotPayloadSchema,
  QualificationRecoveryStatePayloadSchema,
} from '@sasakiuri/saika-protocol/QualificationRecovery';
import { RangeOfficerRequestPayloadSchema } from '@sasakiuri/saika-protocol/RangeOfficerRequest';
import {
  CompetitionShotPayloadSchema,
  RawShotPayloadSchema,
  ShotObservationEvidencePayloadSchema,
  type CompetitionShotPayload,
} from '@sasakiuri/saika-protocol/Shots';
import { TimedTargetStatePayloadSchema } from '@sasakiuri/saika-protocol/TimedTargetState';
import type { CompetitionLaneData, DirectorLaneSnapshot, DirectorMqttCallbacks } from './DirectorMqttTypes';

type CompetitionScopedTopic = Extract<ParsedMqttTopic, { competitionId: string }>;
type LaneScopedTopic = Exclude<ParsedMqttTopic, CompetitionScopedTopic>;

interface PayloadSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: Error };
}

/** A retained state topic: the payload schema, its log label and the snapshot field it fills. */
interface StateTopic<Field extends string, State> {
  readonly schema: PayloadSchema<State>;
  readonly label: string;
  readonly field: Field;
}

type LaneStateField = 'safetyState' | 'rangeOfficerRequest' | 'qualificationMalfunctionSignal' | 'estComplaintSignal';
type CompetitionLaneStateField =
  'competitionState' | 'assignment' | 'score' | 'timedTargetState' | 'qualificationRecoveryState';

const laneStateTopic = <Field extends LaneStateField>(
  schema: PayloadSchema<NonNullable<DirectorLaneSnapshot[Field]>>,
  label: string,
  field: Field,
): StateTopic<Field, NonNullable<DirectorLaneSnapshot[Field]>> => ({ schema, label, field });

const competitionLaneStateTopic = <Field extends CompetitionLaneStateField>(
  schema: PayloadSchema<NonNullable<CompetitionLaneData[Field]>>,
  label: string,
  field: Field,
): StateTopic<Field, NonNullable<CompetitionLaneData[Field]>> => ({ schema, label, field });

const LANE_STATE_TOPICS = {
  laneSafetyState: laneStateTopic(LaneSafetyStatePayloadSchema, 'Lane safety state', 'safetyState'),
  laneRangeOfficerRequest: laneStateTopic(
    RangeOfficerRequestPayloadSchema,
    'Range Officer request',
    'rangeOfficerRequest',
  ),
  laneQualificationMalfunctionSignal: laneStateTopic(
    QualificationMalfunctionSignalPayloadSchema,
    'qualification malfunction signal',
    'qualificationMalfunctionSignal',
  ),
  laneEstComplaintSignal: laneStateTopic(EstComplaintSignalPayloadSchema, 'EST complaint signal', 'estComplaintSignal'),
};

/** Retained Lane states of a competition; an empty retained payload clears the field. */
const COMPETITION_LANE_STATE_TOPICS = {
  laneCompetitionState: competitionLaneStateTopic(LaneCompetitionStatePayloadSchema, 'lane state', 'competitionState'),
  laneAssignment: competitionLaneStateTopic(LaneAssignmentPayloadSchema, 'lane assignment', 'assignment'),
  laneScore: competitionLaneStateTopic(LaneScorePayloadSchema, 'lane score', 'score'),
  timedTargetState: competitionLaneStateTopic(TimedTargetStatePayloadSchema, 'timed target state', 'timedTargetState'),
  qualificationRecoveryState: competitionLaneStateTopic(
    QualificationRecoveryStatePayloadSchema,
    'Qualification recovery state',
    'qualificationRecoveryState',
  ),
};

type CompetitionLaneStateKind = keyof typeof COMPETITION_LANE_STATE_TOPICS;

const isCompetitionLaneStateTopic = (
  parsed: CompetitionScopedTopic,
): parsed is ParsedMqttTopicOf<CompetitionLaneStateKind> => Object.hasOwn(COMPETITION_LANE_STATE_TOPICS, parsed.kind);

interface DirectorMqttReceiverCallbacks extends Pick<
  DirectorMqttCallbacks,
  | 'onCompetitionShootOffShotObserved'
  | 'onQualificationRecoveryStateObserved'
  | 'onQualificationRecoveryShotObserved'
  | 'onShotObservationEvidenceObserved'
> {
  onHardwareState: (state: HardwareStatePayload) => void;
  onCompetitionState: (state: CompetitionStatePayload) => void;
  onCompetitionCleared: (competitionId: string) => void;
  onLaneUpdate: (laneId: string, patch: Partial<Omit<DirectorLaneSnapshot, 'laneId'>>) => void;
  onCompetitionLaneUpdate: (
    competitionId: string,
    laneId: string,
    patch: Partial<CompetitionLaneData>,
    lastSeenAt?: string,
  ) => void;
  onCompetitionShot: (shot: CompetitionShotPayload, payloadJson: string) => void;
  onAcknowledgement: (topic: string, acknowledgement: CommandAcknowledgement) => void;
  onDebugLog: (message: string) => void;
}

/** Validates the wire boundary before dispatching broker deliveries to application state and evidence handlers. */
export class DirectorMqttReceiver {
  constructor(private readonly callbacks: DirectorMqttReceiverCallbacks) {}

  handleMessage(topic: string, payload: Buffer): void {
    const parsed = parseMqttTopic(topic);
    if (!parsed) return;
    if (!('competitionId' in parsed)) {
      this.handleLaneTopic(parsed, topic, payload);
      return;
    }
    if (payload.length === 0) {
      this.handleRetainedClear(parsed);
      return;
    }
    this.handleCompetitionTopic(parsed, topic, payload);
  }

  private handleLaneTopic(parsed: LaneScopedTopic, topic: string, payload: Buffer): void {
    switch (parsed.kind) {
      case 'laneHardwareState': {
        const state = this.parsePayload(HardwareStatePayloadSchema, payload, 'hardware state');
        if (!state || state.laneId !== parsed.laneId) return;
        this.callbacks.onHardwareState(state);
        return;
      }
      case 'laneSafetyState':
      case 'laneRangeOfficerRequest':
      case 'laneQualificationMalfunctionSignal':
      case 'laneEstComplaintSignal':
        this.receiveLaneState(LANE_STATE_TOPICS[parsed.kind], parsed.laneId, payload);
        return;
      case 'laneHardwareShot': {
        const shot = this.parsePayload(RawShotPayloadSchema, payload, 'raw shot');
        if (!shot || shot.laneId !== parsed.laneId) return;
        this.callbacks.onLaneUpdate(shot.laneId, {
          lastRawShot: shot,
          lastSeenAt: shot.timestamp,
        });
        return;
      }
      case 'laneHardwareObservation': {
        const evidence = this.parsePayload(ShotObservationEvidencePayloadSchema, payload, 'shot observation evidence');
        if (!evidence || evidence.laneId !== parsed.laneId || evidence.competition !== null) return;
        this.callbacks.onShotObservationEvidenceObserved?.(evidence, payload.toString('utf8'));
        return;
      }
      case 'laneCommandAcknowledgement':
        this.handleAcknowledgement(topic, payload);
        return;
      case 'laneCommand':
        return;
    }
  }

  private handleCompetitionTopic(parsed: CompetitionScopedTopic, topic: string, payload: Buffer): void {
    const { competitionId } = parsed;
    switch (parsed.kind) {
      case 'competitionState': {
        const state = this.parsePayload(CompetitionStatePayloadSchema, payload, 'competition state');
        if (!state || state.competitionId !== competitionId) return;
        this.callbacks.onCompetitionState(state);
        return;
      }
      case 'competitionCommandAcknowledgement':
      case 'laneCompetitionCommandAcknowledgement':
        this.handleAcknowledgement(topic, payload);
        return;
      case 'competitionShootOffShot': {
        const shot = this.parsePayload(CompetitionShootOffShotPayloadSchema, payload, 'competition shoot-off shot');
        if (!shot || shot.competitionId !== competitionId || shot.laneId !== parsed.laneId) return;
        this.callbacks.onCompetitionShootOffShotObserved?.(shot, payload.toString('utf8'));
        return;
      }
      case 'laneCompetitionState':
      case 'laneAssignment':
      case 'laneScore':
        if (!parsed.laneId) return;
        this.receiveCompetitionLaneState(COMPETITION_LANE_STATE_TOPICS[parsed.kind], parsed, payload);
        return;
      case 'timedTargetState':
        this.receiveCompetitionLaneState(COMPETITION_LANE_STATE_TOPICS.timedTargetState, parsed, payload);
        return;
      case 'qualificationRecoveryState':
        this.receiveCompetitionLaneState(
          COMPETITION_LANE_STATE_TOPICS.qualificationRecoveryState,
          parsed,
          payload,
          (state) => this.callbacks.onQualificationRecoveryStateObserved?.(state, payload.toString('utf8')),
        );
        return;
      case 'qualificationRecoveryShot': {
        const shot = this.parsePayload(QualificationRecoveryShotPayloadSchema, payload, 'Qualification recovery shot');
        const { laneId } = parsed;
        if (!shot || !laneId || shot.laneId !== laneId || shot.competitionId !== competitionId) return;
        this.callbacks.onQualificationRecoveryShotObserved?.(shot, payload.toString('utf8'));
        this.callbacks.onCompetitionLaneUpdate(
          shot.competitionId,
          laneId,
          { lastQualificationRecoveryShot: shot },
          shot.publishedAt,
        );
        return;
      }
      case 'competitionShot':
      case 'competitionShotObservation':
        if (!parsed.laneId) return;
        this.handleCompetitionLaneTopic(parsed, payload);
        return;
      case 'competitionCue':
      case 'competitionCommand':
      case 'laneCompetitionCommand':
      case 'laneQueryRequest':
      case 'laneQueryResponse':
        return;
    }
  }

  private handleCompetitionLaneTopic(
    parsed: ParsedMqttTopicOf<'competitionShot' | 'competitionShotObservation'>,
    payload: Buffer,
  ): void {
    const { competitionId, laneId } = parsed;
    switch (parsed.kind) {
      case 'competitionShot': {
        const shot = this.parsePayload(CompetitionShotPayloadSchema, payload, 'competition shot');
        if (!shot || shot.laneId !== laneId || shot.competitionId !== competitionId) return;
        this.callbacks.onCompetitionShot(shot, payload.toString('utf8'));
        return;
      }
      case 'competitionShotObservation': {
        const evidence = this.parsePayload(ShotObservationEvidencePayloadSchema, payload, 'shot observation evidence');
        if (!evidence || evidence.laneId !== laneId || evidence.competition?.competitionId !== competitionId) return;
        this.callbacks.onShotObservationEvidenceObserved?.(evidence, payload.toString('utf8'));
      }
    }
  }

  private handleRetainedClear(parsed: CompetitionScopedTopic): void {
    if (parsed.kind === 'competitionState') {
      if (!parsed.competitionId) return;
      this.callbacks.onCompetitionCleared(parsed.competitionId);
      return;
    }
    if (!isCompetitionLaneStateTopic(parsed)) return;
    const { competitionId, laneId } = parsed;
    if (!laneId || !competitionId) return;
    const patch: Partial<CompetitionLaneData> = {};
    patch[COMPETITION_LANE_STATE_TOPICS[parsed.kind].field] = null;
    this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, patch);
  }

  private receiveLaneState<Field extends LaneStateField>(
    topic: StateTopic<Field, NonNullable<DirectorLaneSnapshot[Field]>>,
    laneId: string,
    payload: Buffer,
  ): void {
    const state = this.parsePayload(topic.schema, payload, topic.label);
    if (!state || state.laneId !== laneId) return;
    const patch: Partial<DirectorLaneSnapshot> = {};
    patch[topic.field] = state;
    patch.lastSeenAt = state.publishedAt;
    this.callbacks.onLaneUpdate(state.laneId, patch);
  }

  private receiveCompetitionLaneState<Field extends CompetitionLaneStateField>(
    topic: StateTopic<Field, NonNullable<CompetitionLaneData[Field]>>,
    { competitionId, laneId }: { competitionId: string; laneId: string },
    payload: Buffer,
    onReceived?: (state: NonNullable<CompetitionLaneData[Field]>) => void,
  ): void {
    const state = this.parsePayload(topic.schema, payload, topic.label);
    if (!state || !laneId || state.laneId !== laneId || state.competitionId !== competitionId) return;
    onReceived?.(state);
    const patch: Partial<CompetitionLaneData> = {};
    patch[topic.field] = state;
    this.callbacks.onCompetitionLaneUpdate(state.competitionId, laneId, patch, state.publishedAt);
  }

  private handleAcknowledgement(topic: string, payload: Buffer): void {
    const acknowledgement = this.parsePayload(CommandAcknowledgementSchema, payload, 'command acknowledgement');
    if (acknowledgement) this.callbacks.onAcknowledgement(topic, acknowledgement);
  }

  private parsePayload<T>(schema: PayloadSchema<T>, payload: Buffer, label: string): T | null {
    let value: unknown;
    try {
      value = JSON.parse(payload.toString('utf8'));
    } catch {
      this.callbacks.onDebugLog(`Ignored invalid JSON for ${label}`);
      return null;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      this.callbacks.onDebugLog(`Ignored invalid ${label}: ${result.error.message}`);
      return null;
    }
    return result.data;
  }
}
