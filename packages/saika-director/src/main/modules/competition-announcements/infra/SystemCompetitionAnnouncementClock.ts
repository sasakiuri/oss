import type {
  ICompetitionAnnouncementClock,
  ScheduledAnnouncementTask,
} from '../application/CompetitionAnnouncementPorts';

export class SystemCompetitionAnnouncementClock implements ICompetitionAnnouncementClock {
  nowMs(): number {
    return Date.now();
  }

  schedule(callback: () => void, delayMs: number): ScheduledAnnouncementTask {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return { cancel: () => clearTimeout(timer) };
  }
}
