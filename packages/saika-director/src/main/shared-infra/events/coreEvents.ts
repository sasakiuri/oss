import type { DomainEvent } from './EventBus';

export interface CompetitionStarted extends DomainEvent {
  type: 'CompetitionStarted';
  competitionId: string;
  name: string;
}

export interface PhaseChanged extends DomainEvent {
  type: 'PhaseChanged';
  competitionId: string;
  phase: string;
  remainingTime: number;
}

export interface TimerTick extends DomainEvent {
  type: 'TimerTick';
  remainingTime: number;
  phase: string;
}

export interface TimerExpired extends DomainEvent {
  type: 'TimerExpired';
  phase: string;
}

declare module './EventBus' {
  interface EventRegistry {
    CompetitionStarted: CompetitionStarted;
    PhaseChanged: PhaseChanged;
    TimerTick: TimerTick;
    TimerExpired: TimerExpired;
  }
}
