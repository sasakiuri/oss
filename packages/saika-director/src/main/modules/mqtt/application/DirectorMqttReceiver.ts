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
      case 'laneSafetyState': {
        const state = this.parsePayload(LaneSafetyStatePayloadSchema, payload, 'Lane safety state');
        if (!state || state.laneId !== parsed.laneId) return;
        this.callbacks.onLaneUpdate(state.laneId, {
          safetyState: state,
          lastSeenAt: state.publishedAt,
        });
        return;
      }
      case 'laneRangeOfficerRequest': {
        const state = this.parsePayload(RangeOfficerRequestPayloadSchema, payload, 'Range Officer request');
        if (!state || state.laneId !== parsed.laneId) return;
        this.callbacks.onLaneUpdate(state.laneId, {
          rangeOfficerRequest: state,
          lastSeenAt: state.publishedAt,
        });
        return;
      }
      case 'laneQualificationMalfunctionSignal': {
        const state = this.parsePayload(
          QualificationMalfunctionSignalPayloadSchema,
          payload,
          'qualification malfunction signal',
        );
        if (!state || state.laneId !== parsed.laneId) return;
        this.callbacks.onLaneUpdate(state.laneId, {
          qualificationMalfunctionSignal: state,
          lastSeenAt: state.publishedAt,
        });
        return;
      }
      case 'laneEstComplaintSignal': {
        const state = this.parsePayload(EstComplaintSignalPayloadSchema, payload, 'EST complaint signal');
        if (!state || state.laneId !== parsed.laneId) return;
        this.callbacks.onLaneUpdate(state.laneId, {
          estComplaintSignal: state,
          lastSeenAt: state.publishedAt,
        });
        return;
      }
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
      case 'timedTargetState': {
        const state = this.parsePayload(TimedTargetStatePayloadSchema, payload, 'timed target state');
        const { laneId } = parsed;
        if (!state || !laneId || state.laneId !== laneId || state.competitionId !== competitionId) return;
        this.callbacks.onCompetitionLaneUpdate(
          state.competitionId,
          laneId,
          { timedTargetState: state },
          state.publishedAt,
        );
        return;
      }
      case 'qualificationRecoveryState': {
        const state = this.parsePayload(
          QualificationRecoveryStatePayloadSchema,
          payload,
          'Qualification recovery state',
        );
        const { laneId } = parsed;
        if (!state || !laneId || state.laneId !== laneId || state.competitionId !== competitionId) return;
        this.callbacks.onQualificationRecoveryStateObserved?.(state, payload.toString('utf8'));
        this.callbacks.onCompetitionLaneUpdate(
          state.competitionId,
          laneId,
          { qualificationRecoveryState: state },
          state.publishedAt,
        );
        return;
      }
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
      case 'laneCompetitionState':
      case 'laneAssignment':
      case 'laneScore':
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
    parsed: ParsedMqttTopicOf<
      'laneCompetitionState' | 'laneAssignment' | 'laneScore' | 'competitionShot' | 'competitionShotObservation'
    >,
    payload: Buffer,
  ): void {
    const { competitionId, laneId } = parsed;
    switch (parsed.kind) {
      case 'laneCompetitionState': {
        const state = this.parsePayload(LaneCompetitionStatePayloadSchema, payload, 'lane state');
        if (!state || state.laneId !== laneId || state.competitionId !== competitionId) return;
        this.callbacks.onCompetitionLaneUpdate(
          state.competitionId,
          laneId,
          {
            competitionState: state,
          },
          state.publishedAt,
        );
        return;
      }
      case 'laneAssignment': {
        const assignment = this.parsePayload(LaneAssignmentPayloadSchema, payload, 'lane assignment');
        if (!assignment || assignment.laneId !== laneId || assignment.competitionId !== competitionId) return;
        this.callbacks.onCompetitionLaneUpdate(
          assignment.competitionId,
          laneId,
          {
            assignment,
          },
          assignment.publishedAt,
        );
        return;
      }
      case 'laneScore': {
        const score = this.parsePayload(LaneScorePayloadSchema, payload, 'lane score');
        if (!score || score.laneId !== laneId || score.competitionId !== competitionId) return;
        this.callbacks.onCompetitionLaneUpdate(
          score.competitionId,
          laneId,
          {
            score,
          },
          score.publishedAt,
        );
        return;
      }
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
    if (!('laneId' in parsed)) return;
    const { competitionId, laneId } = parsed;
    if (!laneId || !competitionId) return;
    if (parsed.kind === 'timedTargetState') {
      this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { timedTargetState: null });
    } else if (parsed.kind === 'qualificationRecoveryState') {
      this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { qualificationRecoveryState: null });
    } else if (parsed.kind === 'laneCompetitionState') {
      this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { competitionState: null });
    } else if (parsed.kind === 'laneAssignment') {
      this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { assignment: null });
    } else if (parsed.kind === 'laneScore') {
      this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { score: null });
    }
  }

  private handleAcknowledgement(topic: string, payload: Buffer): void {
    const acknowledgement = this.parsePayload(CommandAcknowledgementSchema, payload, 'command acknowledgement');
    if (acknowledgement) this.callbacks.onAcknowledgement(topic, acknowledgement);
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
