import type { DomainEvent } from '@/main/shared-infra/events/EventBus';
import type { LanePhase } from '@/shared/constants/competition';
import type { LaneControlIpcPayload } from '@/shared/types/LaneControlIpcPayload';

export interface LanePhaseChanged extends DomainEvent {
  type: 'LanePhaseChanged';
  laneId: string;
  phase: LanePhase;
  stageIndex?: number;
  seriesIndex?: number;
  remainingTime: number;
}

export interface LaneTimerTick extends DomainEvent {
  type: 'LaneTimerTick';
  laneId: string;
  remainingTime: number;
  phase: LanePhase;
}

export interface LaneTimerExpired extends DomainEvent {
  type: 'LaneTimerExpired';
  laneId: string;
  phase: LanePhase;
}

export interface LaneControlUpdated extends DomainEvent, LaneControlIpcPayload {
  type: 'LaneControlUpdated';
  laneId: string;
}

export interface ShotAdded extends DomainEvent {
  type: 'ShotAdded';
  laneId: string;
  phase: string;
  stageIndex: number;
  seriesIndex: number;
  shotNumber: number;
  score: number;
  shotType: 'PREPARATION' | 'MATCH' | 'SHOOTOFF';
}

export interface ShotEdited extends DomainEvent {
  type: 'ShotEdited';
  laneId: string;
  phase: string;
  stageIndex?: number;
  seriesIndex?: number;
  shotIndex: number;
  oldScore: number;
  newScore: number;
}

export interface ShotDeleted extends DomainEvent {
  type: 'ShotDeleted';
  laneId: string;
  phase: string;
  stageIndex?: number;
  seriesIndex?: number;
  shotIndex: number;
  deletedScore: number;
}

export interface ShotInserted extends DomainEvent {
  type: 'ShotInserted';
  laneId: string;
  phase: string;
  stageIndex?: number;
  seriesIndex?: number;
  shotIndex: number;
  score: number;
}

export interface LaneMoved extends DomainEvent {
  type: 'LaneMoved';
  fromLaneId: string;
  toLaneId: string;
  playerName: string;
  channel: number;
}

declare module '@/main/shared-infra/events/EventBus' {
  interface EventRegistry {
    LanePhaseChanged: LanePhaseChanged;
    LaneTimerTick: LaneTimerTick;
    LaneTimerExpired: LaneTimerExpired;
    LaneControlUpdated: LaneControlUpdated;
    ShotAdded: ShotAdded;
    ShotEdited: ShotEdited;
    ShotDeleted: ShotDeleted;
    ShotInserted: ShotInserted;
    LaneMoved: LaneMoved;
  }
}
