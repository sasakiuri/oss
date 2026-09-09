// SPDX-License-Identifier: MIT
import type { ActiveCompetitionTimer, CompetitionStatePayload } from '@/shared/mqtt';

import type { DirectorMqttState } from './DirectorMqttState';
import type { CommandExecutionResult } from './DirectorMqttTypes';

interface CompetitionExpiryDependencies {
  state: Pick<DirectorMqttState, 'getCompetitions' | 'getCompetition' | 'getCompetitionIdForLane'>;
  isConnected(): boolean;
  runCompetitionOperation<T>(competitionId: string, operation: () => Promise<T>): Promise<T>;
  publishExpiry(
    competitionId: string,
    fields: {
      timerScope: ActiveCompetitionTimer['timerScope'];
      stageIndex: number;
      seriesIndex: ActiveCompetitionTimer['seriesIndex'];
      expiredAt: string;
    },
  ): Promise<CommandExecutionResult>;
  clearActiveTimer(state: CompetitionStatePayload): Promise<void>;
  onError(error: unknown): void;
}

const EXPIRED_TIMER_RETRY_DELAY_MS = 1_000;

/** Retries original timer deadlines until acknowledgements and retained cleanup succeed. */
export class CompetitionExpiryScheduler {
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private expiredTimerPublications = new Set<string>();
  private generation = 0;

  constructor(private readonly dependencies: CompetitionExpiryDependencies) {}

  restoreAll(): void {
    for (const state of this.dependencies.state.getCompetitions()) this.restore(state);
  }

  restore(state: CompetitionStatePayload, minimumDelayMs = 0): void {
    const competitionId = state.competitionId;
    this.clear(competitionId);
    // A replacement timer can be applied by only part of the Lane group. Until
    // the retry is confirmed, broadcasting the old expiry would prematurely
    // stop every Lane that already accepted an extension or restart.
    if (
      !state.activeTimer ||
      (state.phase !== 'SIGHTING' && state.phase !== 'MATCH') ||
      state.pendingTimer?.action === 'timer-started'
    ) {
      return;
    }

    const activeTimer = state.activeTimer;
    const timerKey = this.activeTimerKey(activeTimer);
    const expiredAtMs = Date.parse(activeTimer.timerStartAt) + activeTimer.timerDurationSeconds * 1_000;
    const delayMs = Math.max(minimumDelayMs, expiredAtMs - Date.now(), 0);
    const timer = setTimeout(() => {
      if (this.expiryTimers.get(competitionId) === timer) this.expiryTimers.delete(competitionId);
      void this.publishExpiredTimer(competitionId, timerKey).catch((error: unknown) =>
        this.dependencies.onError(error),
      );
    }, delayMs);
    this.expiryTimers.set(competitionId, timer);
  }

  private publishExpiredTimer(competitionId: string, expectedTimerKey: string): Promise<void> {
    const generation = this.generation;
    return this.dependencies.runCompetitionOperation(competitionId, () =>
      this.publishExpiredTimerNow(competitionId, expectedTimerKey, generation),
    );
  }

  private async publishExpiredTimerNow(
    competitionId: string,
    expectedTimerKey: string,
    generation: number,
  ): Promise<void> {
    if (generation !== this.generation) return;
    if (this.expiredTimerPublications.has(competitionId)) return;
    const state = this.dependencies.state.getCompetition(competitionId);
    const activeTimer = state?.activeTimer;
    if (
      !state ||
      !activeTimer ||
      state.pendingTimer?.action === 'timer-started' ||
      (state.phase !== 'SIGHTING' && state.phase !== 'MATCH') ||
      this.activeTimerKey(activeTimer) !== expectedTimerKey
    ) {
      return;
    }

    const expiredAtMs = Date.parse(activeTimer.timerStartAt) + activeTimer.timerDurationSeconds * 1_000;
    if (expiredAtMs > Date.now()) {
      this.restore(state);
      return;
    }

    this.expiredTimerPublications.add(competitionId);
    try {
      const result = await this.dependencies.publishExpiry(competitionId, {
        timerScope: activeTimer.timerScope,
        stageIndex: activeTimer.stageIndex,
        seriesIndex: activeTimer.seriesIndex,
        expiredAt: new Date(expiredAtMs).toISOString(),
      });
      const currentState = this.dependencies.state.getCompetition(competitionId);
      if (
        generation === this.generation &&
        result.success &&
        currentState?.activeTimer &&
        this.activeTimerKey(currentState.activeTimer) === expectedTimerKey
      ) {
        await this.dependencies.clearActiveTimer(currentState);
      }
    } finally {
      if (generation === this.generation) this.expiredTimerPublications.delete(competitionId);
      const retryState = this.dependencies.state.getCompetition(competitionId);
      if (
        generation === this.generation &&
        this.dependencies.isConnected() &&
        retryState?.activeTimer &&
        this.activeTimerKey(retryState.activeTimer) === expectedTimerKey
      ) {
        // The ACK batch or the retained state update may fail after the local
        // expiry timer has fired. Keep retrying with a small backoff until the
        // original deadline can be durably cleared.
        this.restore(retryState, EXPIRED_TIMER_RETRY_DELAY_MS);
      }
    }
  }

  retryForLane(laneId: string): void {
    const competitionId = this.dependencies.state.getCompetitionIdForLane(laneId);
    if (!competitionId) return;
    const state = this.dependencies.state.getCompetition(competitionId);
    const activeTimer = state?.activeTimer;
    if (!state || !activeTimer) return;
    const expiredAtMs = Date.parse(activeTimer.timerStartAt) + activeTimer.timerDurationSeconds * 1_000;
    if (expiredAtMs > Date.now()) return;
    void this.publishExpiredTimer(competitionId, this.activeTimerKey(activeTimer)).catch((error: unknown) =>
      this.dependencies.onError(error),
    );
  }

  private activeTimerKey(timer: ActiveCompetitionTimer): string {
    return [
      timer.timerScope,
      timer.timerStartAt,
      timer.timerDurationSeconds,
      timer.stageIndex,
      timer.seriesIndex ?? '',
    ].join(':');
  }

  clear(competitionId: string): void {
    const timer = this.expiryTimers.get(competitionId);
    if (!timer) return;
    clearTimeout(timer);
    this.expiryTimers.delete(competitionId);
  }

  stop(): void {
    this.generation += 1;
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    this.expiredTimerPublications.clear();
  }
}
