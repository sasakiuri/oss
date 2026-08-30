import type { DomainEvent } from '@/main/shared-infra/events/EventBus';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import type { FiringWindowViolation } from './IFiringWindowJournal';
import type { ShotObservationEvidencePayload } from '@/shared/mqtt';

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

export interface DebugLogEmitted extends DomainEvent {
  type: 'DebugLogEmitted';
  direction: 'TX' | 'RX' | 'LOG';
  raw: string;
  parsed?: string;
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

declare module '@/main/shared-infra/events/EventBus' {
  interface EventRegistry {
    ShotReceived: ShotReceived;
    LaneConnected: LaneConnected;
    DebugLogEmitted: DebugLogEmitted;
    MqttConnectionError: MqttConnectionError;
    MqttControlStateChanged: MqttControlStateChanged;
    FiringWindowViolationDetected: FiringWindowViolationDetected;
    ShotObservationEvidenceObserved: ShotObservationEvidenceObserved;
  }
}
