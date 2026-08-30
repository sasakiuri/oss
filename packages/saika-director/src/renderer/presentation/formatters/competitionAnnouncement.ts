import type { CompetitionAnnouncementDueEvent } from '@/shared/ipc/contracts';

export function formatCompetitionAnnouncementReminder(event: CompetitionAnnouncementDueEvent): string {
  const duration = formatDuration(event.remainingSeconds);
  return event.phase === 'PREPARATION'
    ? `${event.competitionTypeId}: CRO reminder — announce ${duration} before preparation and sighting ends`
    : `${event.competitionTypeId}: CRO reminder — announce ${duration} remaining in the match`;
}

function formatDuration(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const minutes = seconds / 60;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
