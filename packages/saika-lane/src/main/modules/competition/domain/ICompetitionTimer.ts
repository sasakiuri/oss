// SPDX-License-Identifier: MIT

/** Read-only sample of the in-memory competition clock. */
export interface CompetitionClockSample {
  running: boolean;
  remainingMs: number;
  sampledAt: number;
  generation: number;
}

/**
 * ICompetitionTimer — the Lane competition clock used by feature modules
 *
 * The clock is authoritative in memory; the competition aggregate stores its
 * persisted remaining time.
 */
export interface ICompetitionTimer {
  /** Starts counting down `remainingSeconds` from now. */
  start(competitionId: string, remainingSeconds: number, totalSeconds: number, stageTimerIndex?: number | null): void;
  /** Starts a clock that began at `absoluteTime` (ISO 8601); expires at once when already elapsed. */
  startAt(competitionId: string, absoluteTime: string, durationSeconds: number): Promise<void>;
  /** Whether the running clock is the stage clock of `stageIndex`. */
  isStageTimerRunning(competitionId: string, stageIndex: number): boolean;
  /** Stops the clock and retains its actual remaining time for sampling. */
  stop(): void;
  /** Freezes and persists the exact in-memory countdown. */
  pause(competitionId: string): Promise<{ remainingSeconds: number; totalSeconds: number }>;
  /** Persists an authorized timer value and starts it at `absoluteTime`. */
  resumeAt(competitionId: string, absoluteTime: string, durationSeconds: number): Promise<void>;
  /** Expires the competition clock immediately and idempotently. */
  expire(competitionId: string): Promise<void>;
  /** Samples the actual in-memory clock; persisted timer values may be stale. */
  sample(competitionId: string): CompetitionClockSample | null;
}
