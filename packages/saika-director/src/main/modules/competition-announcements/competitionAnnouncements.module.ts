import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { competitionAnnouncementsContract, eventsContract } from '@/shared/ipc/contracts';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

import { CompetitionAnnouncementScheduler } from './application/CompetitionAnnouncementScheduler';
import type { CompetitionAnnouncement, RunningCompetitionTimer } from './application/CompetitionAnnouncementPorts';
import type { CompetitionAnnouncementDue } from './domain/events';
import { CompetitionTypeAnnouncementPolicyResolver } from './infra/CompetitionTypeAnnouncementPolicyResolver';
import { SystemCompetitionAnnouncementClock } from './infra/SystemCompetitionAnnouncementClock';

export const competitionAnnouncementsModule: ModuleDefinition<
  'eventBus' | 'ipcRouter' | 'appConfigService' | 'competitionTypeRegistry'
> = {
  name: 'competitionAnnouncements',
  deps: ['eventBus', 'ipcRouter', 'appConfigService', 'competitionTypeRegistry'] as const,
  register({ eventBus, ipcRouter, appConfigService, competitionTypeRegistry }) {
    const scheduler = new CompetitionAnnouncementScheduler(
      new CompetitionTypeAnnouncementPolicyResolver(competitionTypeRegistry),
      {
        publish: (announcement) => eventBus.emit(toAnnouncementDueEvent(announcement)),
      },
      new SystemCompetitionAnnouncementClock(),
      appConfigService.get('competitionAnnouncements.enabled'),
    );
    let unsubscribe: (() => void) | null = null;

    ipcRouter.register(competitionAnnouncementsContract, {
      getSettings: async () => ({ enabled: appConfigService.get('competitionAnnouncements.enabled') }),
      setSettings: async ({ enabled }) => {
        appConfigService.set('competitionAnnouncements.enabled', enabled);
        scheduler.setEnabled(enabled);
        return { enabled };
      },
    });

    return {
      lifecycle: [
        {
          name: 'CompetitionAnnouncementScheduler',
          start: async () => {
            unsubscribe = eventBus.on('MqttControlStateChanged', (event) => {
              scheduler.sync(toRunningTimers(event.snapshot));
            });
          },
          stop: async () => {
            unsubscribe?.();
            unsubscribe = null;
            scheduler.dispose();
          },
        },
      ],
      eventForwarding: [
        {
          eventType: 'CompetitionAnnouncementDue',
          channel: eventsContract.channels.competitionAnnouncementDue,
          extractPayload: (event: AnyDomainEvent) => {
            const announcement = event as CompetitionAnnouncementDue;
            return {
              competitionId: announcement.competitionId,
              competitionTypeId: announcement.competitionTypeId,
              ...(announcement.rulePackId ? { rulePackId: announcement.rulePackId } : {}),
              phase: announcement.phase,
              remainingSeconds: announcement.remainingSeconds,
              dueAt: announcement.dueAt,
            };
          },
        },
      ],
    };
  },
};

function toRunningTimers(snapshot: MqttControlSnapshotDto): RunningCompetitionTimer[] {
  return snapshot.competitions.flatMap((competition) => {
    const timer = competition.activeTimer;
    const phase = competition.phase === 'SIGHTING' ? 'PREPARATION' : competition.phase === 'MATCH' ? 'MATCH' : null;
    if (!timer || !phase || competition.pendingTimer?.action === 'timer-started') return [];
    const startsAtMs = Date.parse(timer.timerStartAt);
    if (!Number.isFinite(startsAtMs)) return [];
    return [
      {
        competitionId: competition.competitionId,
        competitionTypeId: competition.competitionTypeId,
        timerId: [
          phase,
          timer.timerScope,
          timer.timerStartAt,
          timer.timerDurationSeconds,
          timer.stageIndex,
          timer.seriesIndex ?? '',
        ].join(':'),
        phase,
        startsAtMs,
        durationSeconds: timer.timerDurationSeconds,
      },
    ];
  });
}

function toAnnouncementDueEvent(announcement: CompetitionAnnouncement): CompetitionAnnouncementDue {
  return {
    type: 'CompetitionAnnouncementDue',
    timestamp: Date.now(),
    competitionId: announcement.competitionId,
    competitionTypeId: announcement.competitionTypeId,
    ...(announcement.rulePackId ? { rulePackId: announcement.rulePackId } : {}),
    phase: announcement.phase,
    remainingSeconds: announcement.remainingSeconds,
    dueAt: new Date(announcement.dueAtMs).toISOString(),
  };
}
