// SPDX-License-Identifier: MIT
import type { CommandAcknowledgement, CompetitionShotPayload } from '@/shared/mqtt';
import {
  CommandAcknowledgementSchema,
  CompetitionShootOffShotPayloadSchema,
  CompetitionShotPayloadSchema,
  CompetitionStatePayloadSchema,
  EstComplaintSignalPayloadSchema,
  HardwareStatePayloadSchema,
  LaneAssignmentPayloadSchema,
  LaneCompetitionStatePayloadSchema,
  LaneSafetyStatePayloadSchema,
  LaneScorePayloadSchema,
  QualificationMalfunctionSignalPayloadSchema,
  QualificationRecoveryShotPayloadSchema,
  QualificationRecoveryStatePayloadSchema,
  RangeOfficerRequestPayloadSchema,
  RawShotPayloadSchema,
  ShotObservationEvidencePayloadSchema,
  TimedTargetStatePayloadSchema,
  type CompetitionStatePayload,
  type HardwareStatePayload,
} from '@/shared/mqtt';
import type { CompetitionLaneData, DirectorLaneSnapshot, DirectorMqttCallbacks } from './DirectorMqttTypes';

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
      this.callbacks.onHardwareState(state);
      return;
    }

    if (segments.length === 5 && segments[3] === 'safety' && segments[4] === 'state') {
      const state = this.parsePayload(LaneSafetyStatePayloadSchema, payload, 'Lane safety state');
      if (!state || state.laneId !== segments[2]) return;
      this.callbacks.onLaneUpdate(state.laneId, {
        safetyState: state,
        lastSeenAt: state.publishedAt,
      });
      return;
    }

    if (segments.length === 5 && segments[3] === 'range-officer' && segments[4] === 'request') {
      const state = this.parsePayload(RangeOfficerRequestPayloadSchema, payload, 'Range Officer request');
      if (!state || state.laneId !== segments[2]) return;
      this.callbacks.onLaneUpdate(state.laneId, {
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
      this.callbacks.onLaneUpdate(state.laneId, {
        qualificationMalfunctionSignal: state,
        lastSeenAt: state.publishedAt,
      });
      return;
    }

    if (segments.length === 5 && segments[3] === 'est-complaint' && segments[4] === 'signal') {
      const state = this.parsePayload(EstComplaintSignalPayloadSchema, payload, 'EST complaint signal');
      if (!state || state.laneId !== segments[2]) return;
      this.callbacks.onLaneUpdate(state.laneId, {
        estComplaintSignal: state,
        lastSeenAt: state.publishedAt,
      });
      return;
    }

    if (segments.length === 5 && segments[3] === 'hardware' && segments[4] === 'shot') {
      const shot = this.parsePayload(RawShotPayloadSchema, payload, 'raw shot');
      if (!shot || shot.laneId !== segments[2]) return;
      this.callbacks.onLaneUpdate(shot.laneId, {
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
      this.callbacks.onCompetitionState(state);
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
      this.callbacks.onCompetitionLaneUpdate(
        state.competitionId,
        laneId,
        { timedTargetState: state },
        state.publishedAt,
      );
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
      this.callbacks.onCompetitionLaneUpdate(
        state.competitionId,
        laneId,
        { qualificationRecoveryState: state },
        state.publishedAt,
      );
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
      this.callbacks.onCompetitionLaneUpdate(
        shot.competitionId,
        laneId,
        { lastQualificationRecoveryShot: shot },
        shot.publishedAt,
      );
      return;
    }

    if (segments.length !== 6 || segments[3] !== 'lane') return;
    const laneId = segments[4];
    const kind = segments[5];
    if (!laneId) return;

    if (kind === 'state') {
      const state = this.parsePayload(LaneCompetitionStatePayloadSchema, payload, 'lane state');
      if (!state || state.laneId !== laneId || state.competitionId !== segments[2]) return;
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
    if (kind === 'assignment') {
      const assignment = this.parsePayload(LaneAssignmentPayloadSchema, payload, 'lane assignment');
      if (!assignment || assignment.laneId !== laneId || assignment.competitionId !== segments[2]) return;
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
    if (kind === 'score') {
      const score = this.parsePayload(LaneScorePayloadSchema, payload, 'lane score');
      if (!score || score.laneId !== laneId || score.competitionId !== segments[2]) return;
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
    if (kind === 'shot') {
      const shot = this.parsePayload(CompetitionShotPayloadSchema, payload, 'competition shot');
      if (!shot || shot.laneId !== laneId || shot.competitionId !== segments[2]) return;
      this.callbacks.onCompetitionShot(shot, payload.toString('utf8'));
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
      this.callbacks.onCompetitionCleared(competitionId);
      return;
    }

    if (segments.length === 7 && segments[3] === 'lane' && segments[5] === 'timed-target' && segments[6] === 'state') {
      const laneId = segments[4];
      const competitionId = segments[2];
      if (!laneId || !competitionId) return;
      this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { timedTargetState: null });
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
      this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { qualificationRecoveryState: null });
      return;
    }

    if (segments.length !== 6 || segments[3] !== 'lane') return;
    const laneId = segments[4];
    const kind = segments[5];
    const competitionId = segments[2];
    if (!laneId || !competitionId) return;
    if (kind === 'state') this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { competitionState: null });
    if (kind === 'assignment') this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { assignment: null });
    if (kind === 'score') this.callbacks.onCompetitionLaneUpdate(competitionId, laneId, { score: null });
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
