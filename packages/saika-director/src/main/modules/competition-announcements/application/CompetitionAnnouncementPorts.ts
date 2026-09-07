import type { CompetitionAnnouncementPhase } from '../domain/CompetitionAnnouncementPhase';

export type { CompetitionAnnouncementPhase } from '../domain/CompetitionAnnouncementPhase';

/** Transport-neutral view of an authoritative running competition timer. */
export interface RunningCompetitionTimer {
  readonly competitionId: string;
  readonly competitionTypeId: string;
  readonly timerId: string;
  readonly phase: CompetitionAnnouncementPhase;
  readonly startsAtMs: number;
  readonly durationSeconds: number;
}

export interface ResolvedCompetitionAnnouncementPolicy {
  readonly rulePackId?: string;
  readonly warningsAtRemainingSeconds: readonly number[];
}

export interface ICompetitionAnnouncementPolicyResolver {
  resolve(competitionTypeId: string, phase: CompetitionAnnouncementPhase): ResolvedCompetitionAnnouncementPolicy | null;
}

export interface CompetitionAnnouncement {
  readonly competitionId: string;
  readonly competitionTypeId: string;
  readonly rulePackId?: string;
  readonly phase: CompetitionAnnouncementPhase;
  readonly remainingSeconds: number;
  readonly dueAtMs: number;
}

/** Output port: visual prompts, audio, logging, or other adapters can be attached independently. */
export interface ICompetitionAnnouncementSink {
  publish(announcement: CompetitionAnnouncement): void;
}

export interface ScheduledAnnouncementTask {
  cancel(): void;
}

/** Injectable time port keeps scheduling deterministic and independent of Node timers. */
export interface ICompetitionAnnouncementClock {
  nowMs(): number;
  schedule(callback: () => void, delayMs: number): ScheduledAnnouncementTask;
}
