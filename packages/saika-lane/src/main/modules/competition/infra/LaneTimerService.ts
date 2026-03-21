// SPDX-License-Identifier: MIT
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

/**
 * LaneTimerService
 *
 * 1-second interval countdown timer with real-time drift correction.
 * Manages remaining timer time in memory, persisting only on expiry.
 * - start(): Start timer with specified competitionId + timer info
 * - stop(): Stop timer
 * - processTick(): Process 1 tick (in-memory update + event emit, persist only on expiry)
 */
export class LaneTimerService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number = 0;
  private competitionId: string | null = null;
  private remainingSeconds: number = 0;
  private totalSeconds: number = 0;

  constructor(
    private readonly competitionRepository: ICompetitionRepository,
    private readonly eventBus: IEventBus,
  ) {}

  /**
   * Starts the timer
   *
   * @param competitionId - Target competition ID
   * @param remainingSeconds - Remaining seconds
   * @param totalSeconds - Total duration of the timer in seconds
   */
  start(competitionId: string, remainingSeconds: number, totalSeconds: number): void {
    this.stop();
    this.competitionId = competitionId;
    this.remainingSeconds = remainingSeconds;
    this.totalSeconds = totalSeconds;
    this.lastTickTime = Date.now();

    // Emit the initial tick immediately to eliminate UI delay
    this.emitInitialTick();

    this.intervalId = setInterval(() => {
      void this.processTick();
    }, 1000);
  }

  /**
   * Starts the timer at an absolute time
   *
   * Starts the timer with remaining time calculated by subtracting elapsed time
   * from the absolute start time received via MQTT.
   * If the full duration has already elapsed, immediately processes expiry.
   *
   * @param competitionId - Target competition ID
   * @param absoluteTime - Start time in ISO 8601 format
   * @param durationSeconds - Total duration of the timer in seconds
   */
  async startAt(competitionId: string, absoluteTime: string, durationSeconds: number): Promise<void> {
    this.stop();

    const startMs = new Date(absoluteTime).getTime();
    const elapsedSeconds = Math.floor((Date.now() - startMs) / 1000);
    const remainingSeconds = durationSeconds - elapsedSeconds;

    if (remainingSeconds <= 0) {
      // Already expired: execute expiry immediately (expire directly without delegating to processTick)
      try {
        const state = await this.competitionRepository.findById(competitionId);
        if (!state || state.phase !== 'ACTIVE') return;

        const updated = state.tickTimerBy(durationSeconds);
        await this.competitionRepository.save(updated);

        const expired = updated.expireTimer();
        await this.competitionRepository.save(expired);

        this.eventBus.emit({
          type: 'TimerExpired',
          timestamp: Date.now(),
          aggregateId: expired.id,
          stageIndex: expired.currentStageIndex,
        });

        emitPhaseChanged(this.eventBus, expired, 'ACTIVE');
      } catch (error) {
        getLogger().error(
          'Failed to expire timer in startAt',
          'domain',
          error instanceof Error ? { error: error.stack } : { error: String(error) },
        );
      }
      return;
    }

    // Update CompetitionState for the elapsed time before starting the normal timer
    try {
      const state = await this.competitionRepository.findById(competitionId);
      if (!state || state.phase !== 'ACTIVE') return;

      if (elapsedSeconds > 0) {
        const updated = state.tickTimerBy(elapsedSeconds);
        await this.competitionRepository.save(updated);
      }

      this.start(competitionId, remainingSeconds, durationSeconds);
    } catch (error) {
      getLogger().error(
        'Failed to adjust timer for startAt',
        'domain',
        error instanceof Error ? { error: error.stack } : { error: String(error) },
      );
    }
  }

  /**
   * Stops the timer
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.competitionId = null;
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
  }

  /**
   * Emits the initial tick immediately when the timer starts
   *
   * Unlike processTick(), this does not calculate elapsed seconds or persist state;
   * it simply notifies the Renderer with the current in-memory timer state.
   */
  private emitInitialTick(): void {
    if (!this.competitionId) return;
    this.eventBus.emit({
      type: 'TimerTick',
      timestamp: Date.now(),
      aggregateId: this.competitionId,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
      formattedRemaining: this.formatRemaining(this.remainingSeconds),
    });
  }

  /**
   * Processes one tick
   *
   * Calculates accurate elapsed seconds with Date.now()-based drift correction.
   * For normal ticks, decrements in-memory remainingSeconds and emits only a TimerTick event.
   * Persists to the repository only on expiry.
   */
  async processTick(): Promise<void> {
    if (!this.competitionId) return;

    const now = Date.now();
    const elapsedSeconds = Math.round((now - this.lastTickTime) / 1000);
    this.lastTickTime = now;

    if (elapsedSeconds <= 0) return;

    this.remainingSeconds = Math.max(0, this.remainingSeconds - elapsedSeconds);

    // Emit TimerTick event (from in-memory state)
    this.eventBus.emit({
      type: 'TimerTick',
      timestamp: Date.now(),
      aggregateId: this.competitionId,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
      formattedRemaining: this.formatRemaining(this.remainingSeconds),
    });

    // Persist only on timer expiry
    if (this.remainingSeconds <= 0) {
      try {
        const state = await this.competitionRepository.findById(this.competitionId);
        if (!state || state.phase !== 'ACTIVE') {
          this.stop();
          return;
        }

        const updated = state.tickTimerBy(state.timer.remainingSeconds);
        await this.competitionRepository.save(updated);

        const expired = updated.expireTimer();
        await this.competitionRepository.save(expired);

        this.eventBus.emit({
          type: 'TimerExpired',
          timestamp: Date.now(),
          aggregateId: expired.id,
          stageIndex: expired.currentStageIndex,
        });

        emitPhaseChanged(this.eventBus, expired, 'ACTIVE');
        this.stop();
      } catch (error) {
        getLogger().error(
          'Timer expiry failed',
          'domain',
          error instanceof Error ? { error: error.stack } : { error: String(error) },
        );
      }
    }
  }

  /**
   * Formats remaining seconds into "MM:SS" format
   */
  private formatRemaining(seconds: number): string {
    const clamped = Math.max(0, seconds);
    const min = Math.floor(clamped / 60);
    const sec = clamped % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
}
