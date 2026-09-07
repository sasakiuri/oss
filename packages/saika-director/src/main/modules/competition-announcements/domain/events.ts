import type { DomainEvent } from '@/main/shared-infra/events/EventBus';
import type { CompetitionAnnouncementPhase } from './CompetitionAnnouncementPhase';

export interface CompetitionAnnouncementDue extends DomainEvent {
  readonly type: 'CompetitionAnnouncementDue';
  readonly competitionId: string;
  readonly competitionTypeId: string;
  readonly rulePackId?: string;
  readonly phase: CompetitionAnnouncementPhase;
  readonly remainingSeconds: number;
  readonly dueAt: string;
}

declare module '@/main/shared-infra/events/EventBus' {
  interface EventRegistry {
    CompetitionAnnouncementDue: CompetitionAnnouncementDue;
  }
}
