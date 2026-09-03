import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

export type RangeClockStatus = 'UNAVAILABLE' | 'IDLE' | 'SCHEDULED' | 'RUNNING' | 'EXPIRED';

export interface RangeClockProjection {
  readonly source: 'DIRECTOR_COMPETITION_STATE';
  readonly ruleReference: '6.4.3.5';
  readonly status: RangeClockStatus;
  readonly competitionId: string | null;
  readonly competitionName: string | null;
  readonly phase: string | null;
  readonly remainingSeconds: number | null;
  readonly startsInSeconds: number | null;
  readonly timerScope: 'STAGE' | 'SERIES' | null;
  readonly synchronized: boolean;
  readonly observedAtMs: number;
}

/**
 * Projects the range display directly from Director's retained competition
 * timer. Lane-local countdowns are deliberately not accepted as a fallback.
 */
export function projectAuthoritativeRangeClock(
  snapshot: MqttControlSnapshotDto | null,
  requestedCompetitionId: string | undefined,
  nowMs: number,
): RangeClockProjection {
  const base = {
    source: 'DIRECTOR_COMPETITION_STATE' as const,
    ruleReference: '6.4.3.5' as const,
    synchronized: snapshot?.connected ?? false,
    observedAtMs: nowMs,
  };
  if (!snapshot) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      competitionId: requestedCompetitionId ?? null,
      competitionName: null,
      phase: null,
      remainingSeconds: null,
      startsInSeconds: null,
      timerScope: null,
    };
  }

  const competitionId = requestedCompetitionId ?? snapshot.activeCompetitionId ?? undefined;
  const competition = competitionId
    ? snapshot.competitions.find((candidate) => candidate.competitionId === competitionId)
    : undefined;
  if (!competition) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      competitionId: competitionId ?? null,
      competitionName: null,
      phase: null,
      remainingSeconds: null,
      startsInSeconds: null,
      timerScope: null,
    };
  }

  const timer = competition.activeTimer;
  if (!timer) {
    return {
      ...base,
      status: 'IDLE',
      competitionId: competition.competitionId,
      competitionName: competition.competitionTypeName,
      phase: competition.phase,
      remainingSeconds: null,
      startsInSeconds: null,
      timerScope: null,
    };
  }

  const startsAtMs = Date.parse(timer.timerStartAt);
  const endsAtMs = startsAtMs + timer.timerDurationSeconds * 1_000;
  if (!Number.isFinite(startsAtMs)) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      competitionId: competition.competitionId,
      competitionName: competition.competitionTypeName,
      phase: competition.phase,
      remainingSeconds: null,
      startsInSeconds: null,
      timerScope: timer.timerScope,
    };
  }

  const startsInSeconds = Math.max(0, Math.ceil((startsAtMs - nowMs) / 1_000));
  const remainingSeconds = Math.max(0, Math.ceil((endsAtMs - Math.max(nowMs, startsAtMs)) / 1_000));
  const status: RangeClockStatus = nowMs < startsAtMs ? 'SCHEDULED' : nowMs < endsAtMs ? 'RUNNING' : 'EXPIRED';

  return {
    ...base,
    status,
    competitionId: competition.competitionId,
    competitionName: competition.competitionTypeName,
    phase: competition.phase,
    remainingSeconds,
    startsInSeconds: status === 'SCHEDULED' ? startsInSeconds : null,
    timerScope: timer.timerScope,
  };
}
