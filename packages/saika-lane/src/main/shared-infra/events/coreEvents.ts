// SPDX-License-Identifier: MIT
/**
 * Core domain event definitions
 *
 * Defines all domain events for saika.lane as type-safe interfaces
 * and registers them in the EventRegistry.
 *
 * NOTE: Interface names have the `Event` suffix to avoid naming conflicts
 * with existing event classes (src/main/domain/events/).
 * Existing classes are scheduled for removal in Phase 7.
 */

import type { RoundConfig } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import type { Phase } from '@/main/modules/competition/domain/Phase';
import type { Discipline } from '@/main/modules/session/domain/Discipline';
import type { Mode } from '@/main/modules/session/domain/Mode';
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

import type { DomainEvent } from './EventBus';

export interface SessionStartedEvent extends DomainEvent {
  readonly type: 'SessionStarted';
  readonly discipline: Discipline;
}

export interface ShotRecordedEvent extends DomainEvent {
  readonly type: 'ShotRecorded';
  readonly shot: Shot;
  readonly scoringMode: 'RING' | 'DECIMAL';
  readonly rawScore?: number; // Only when RING mode and flooring occurs
}

export interface ModeSwitchedEvent extends DomainEvent {
  readonly type: 'ModeSwitched';
  readonly previousMode: Mode;
  readonly newMode: Mode;
}

export interface SessionResetEvent extends DomainEvent {
  readonly type: 'SessionReset';
}

export interface ConnectionEstablishedEvent extends DomainEvent {
  readonly type: 'ConnectionEstablished';
  readonly manufacturer: TargetManufacturer;
  readonly portPath: string;
  readonly deviceId: string | null;
}

export interface ConnectionLostEvent extends DomainEvent {
  readonly type: 'ConnectionLost';
  readonly reason: string;
}

// ── Competition Events ──

export interface CompetitionStartedEvent extends DomainEvent {
  readonly type: 'CompetitionStarted';
  readonly competitionTypeId: string;
  readonly sessionId: string;
  readonly config: RoundConfig;
}

export interface PhaseChangedEvent extends DomainEvent {
  readonly type: 'PhaseChanged';
  readonly previousPhase: Phase;
  readonly newPhase: Phase;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly stageName: string;
  readonly scored: boolean;
}

export interface TimerTickEvent extends DomainEvent {
  readonly type: 'TimerTick';
  readonly remainingSeconds: number;
  readonly totalSeconds: number;
  readonly formattedRemaining: string;
}

export interface TimerExpiredEvent extends DomainEvent {
  readonly type: 'TimerExpired';
  readonly stageIndex: number;
}

export interface SeriesCompletedEvent extends DomainEvent {
  readonly type: 'SeriesCompleted';
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly shotCount: number;
}

export interface StageAdvancedEvent extends DomainEvent {
  readonly type: 'StageAdvanced';
  readonly previousStageIndex: number;
  readonly newStageIndex: number;
  readonly stageName: string;
  readonly scored: boolean;
}

export interface CompetitionFinishedEvent extends DomainEvent {
  readonly type: 'CompetitionFinished';
  readonly sessionId: string;
}

// ── MQTT Events ──

export interface MqttConnectedEvent extends DomainEvent {
  readonly type: 'MqttConnected';
  readonly brokerUrl: string;
  readonly laneId: string;
}

export interface MqttDisconnectedEvent extends DomainEvent {
  readonly type: 'MqttDisconnected';
  readonly reason?: string;
}

declare module './EventBus' {
  interface EventRegistry {
    SessionStarted: SessionStartedEvent;
    ShotRecorded: ShotRecordedEvent;
    ModeSwitched: ModeSwitchedEvent;
    SessionReset: SessionResetEvent;
    ConnectionEstablished: ConnectionEstablishedEvent;
    ConnectionLost: ConnectionLostEvent;
    CompetitionStarted: CompetitionStartedEvent;
    PhaseChanged: PhaseChangedEvent;
    TimerTick: TimerTickEvent;
    TimerExpired: TimerExpiredEvent;
    SeriesCompleted: SeriesCompletedEvent;
    StageAdvanced: StageAdvancedEvent;
    CompetitionFinished: CompetitionFinishedEvent;
    MqttConnected: MqttConnectedEvent;
    MqttDisconnected: MqttDisconnectedEvent;
  }
}
