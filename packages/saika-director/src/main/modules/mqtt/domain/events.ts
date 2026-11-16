import type { DomainEvent } from '@/main/shared-infra/events/EventBus';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import type { FiringWindowViolation } from './IFiringWindowJournal';
import type {
  QualificationRecoveryShotPayload,
  QualificationRecoveryStatePayload,
} from '@sasakiuri/saika-protocol/QualificationRecovery';
import type { ShotObservationEvidencePayload } from '@sasakiuri/saika-protocol/Shots';

export interface ShotReceived extends DomainEvent {
  type: 'ShotReceived';
  competitionId: string;
  channel: number;
  shotNumber: number;
  score: number;
  seriesNumber: number;
}

export interface LaneConnected extends DomainEvent {
  type: 'LaneConnected';
  laneId: string;
  channel: number;
}

export interface MqttConnectionError extends DomainEvent {
  type: 'MqttConnectionError';
  message: string;
}

export interface MqttControlStateChanged extends DomainEvent {
  type: 'MqttControlStateChanged';
  snapshot: MqttControlSnapshotDto;
}

export interface FiringWindowViolationDetected extends DomainEvent {
  type: 'FiringWindowViolationDetected';
  violation: FiringWindowViolation;
}

export interface ShotObservationEvidenceObserved extends DomainEvent {
  type: 'ShotObservationEvidenceObserved';
  evidence: ShotObservationEvidencePayload;
  observedAt: Date;
}

export interface QualificationRecoveryStateObserved extends DomainEvent {
  type: 'QualificationRecoveryStateObserved';
  state: QualificationRecoveryStatePayload;
  payloadJson: string;
  observedAt: Date;
}

export interface QualificationRecoveryShotObserved extends DomainEvent {
  type: 'QualificationRecoveryShotObserved';
  shot: QualificationRecoveryShotPayload;
  payloadJson: string;
  observedAt: Date;
}

declare module '@/main/shared-infra/events/EventBus' {
  interface EventRegistry {
    ShotReceived: ShotReceived;
    LaneConnected: LaneConnected;
    MqttConnectionError: MqttConnectionError;
    MqttControlStateChanged: MqttControlStateChanged;
    FiringWindowViolationDetected: FiringWindowViolationDetected;
    ShotObservationEvidenceObserved: ShotObservationEvidenceObserved;
    QualificationRecoveryStateObserved: QualificationRecoveryStateObserved;
    QualificationRecoveryShotObserved: QualificationRecoveryShotObserved;
  }
}
