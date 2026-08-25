import type { DomainEvent } from '@/main/shared-infra/events/EventBus';

export interface ShootoffStarted extends DomainEvent {
  type: 'ShootoffStarted';
  shootoffId: string;
  eventId: string;
  targetLaneIds: string[];
  contestedRank: number;
}

export interface ShootoffShotAdded extends DomainEvent {
  type: 'ShootoffShotAdded';
  shootoffId: string;
  laneId: string;
  roundNumber: number;
  score: number;
}

export interface ShootoffRoundCompleted extends DomainEvent {
  type: 'ShootoffRoundCompleted';
  shootoffId: string;
  roundNumber: number;
  isResolved: boolean;
  winnerLaneId?: string;
  loserLaneIds?: string[];
}

export interface ShootoffResolved extends DomainEvent {
  type: 'ShootoffResolved';
  shootoffId: string;
  rankedLaneIds: string[];
  contestedRank: number;
}

declare module '@/main/shared-infra/events/EventBus' {
  interface EventRegistry {
    ShootoffStarted: ShootoffStarted;
    ShootoffShotAdded: ShootoffShotAdded;
    ShootoffRoundCompleted: ShootoffRoundCompleted;
    ShootoffResolved: ShootoffResolved;
  }
}
