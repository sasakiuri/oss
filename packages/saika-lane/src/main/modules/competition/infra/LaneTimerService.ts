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
  private expiresAtMs: number = 0;
  private competitionId: string | null = null;
  private remainingSeconds: number = 0;
  private totalSeconds: number = 0;
  private startGeneration: number = 0;
  private stoppedSample: {
    competitionId: string;
    running: boolean;
    remainingMs: number;
    sampledAt: number;
    generation: number;
  } | null = null;

  constructor(
    private readonly competitionRepository: ICompetitionRepository,
    private readonly eventBus: IEventBus,
    private readonly isRunPermitted: () => boolean = () => true,
  ) {}

  /**
   * Starts the timer
   *
   * @param competitionId - Target competition ID
   * @param remainingSeconds - Remaining seconds
   * @param totalSeconds - Total duration of the timer in seconds
   */
  start(competitionId: string, remainingSeconds: number, totalSeconds: number): void {
    this.startUntil(competitionId, Date.now() + remainingSeconds * 1000, totalSeconds);
  }

  private startUntil(competitionId: string, expiresAtMs: number, totalSeconds: number): void {
    this.stop();
    this.assertRunPermitted();
    this.competitionId = competitionId;
    this.expiresAtMs = expiresAtMs;
    this.remainingSeconds = this.remainingAt(Date.now());
    this.totalSeconds = totalSeconds;

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
    this.assertRunPermitted();

    const startMs = new Date(absoluteTime).getTime();
    const generation = this.startGeneration;
    const delayMs = startMs - Date.now();
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      if (generation !== this.startGeneration) return;
    }
    this.assertRunPermitted();

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    const remainingSeconds = durationSeconds - elapsedSeconds;

    if (remainingSeconds <= 0) {
      // Already expired: execute expiry immediately (expire directly without delegating to processTick)
      try {
        const state = await this.competitionRepository.findById(competitionId);
        if (generation !== this.startGeneration) return;
        this.assertRunPermitted();
        if (!state || state.phase !== 'ACTIVE') return;

        const updated = state.tickTimerBy(durationSeconds);
        await this.competitionRepository.save(updated);
        if (generation !== this.startGeneration) return;
        this.assertRunPermitted();

        const expired = updated.expireTimer();
        await this.competitionRepository.save(expired);
        this.sampleExpiry(competitionId, generation);

        this.eventBus.emit({
          type: 'TimerExpired',
          timestamp: Date.now(),
          aggregateId: expired.id,
          stageIndex: expired.currentStageIndex,
        });

        emitPhaseChanged(this.eventBus, expired, 'ACTIVE');
      } catch (error) {
        if (isTimerRunBlockedError(error)) throw error;
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
      if (generation !== this.startGeneration) return;
      this.assertRunPermitted();
      if (!state || state.phase !== 'ACTIVE') return;

      if (elapsedSeconds > 0) {
        const updated = state.tickTimerBy(elapsedSeconds);
        await this.competitionRepository.save(updated);
        if (generation !== this.startGeneration) return;
        this.assertRunPermitted();
      }

      this.startUntil(competitionId, startMs + durationSeconds * 1000, durationSeconds);
      if (this.remainingSeconds === 0) await this.processTick();
    } catch (error) {
      if (isTimerRunBlockedError(error)) throw error;
      getLogger().error(
        'Failed to adjust timer for startAt',
        'domain',
        error instanceof Error ? { error: error.stack } : { error: String(error) },
      );
    }
  }

  /** Read-only sample of the actual in-memory clock; persisted timer values may be stale. */
  sample(
    competitionId: string,
  ): { running: boolean; remainingMs: number; sampledAt: number; generation: number } | null {
    if (this.competitionId !== competitionId || this.intervalId === null) {
      return this.stoppedSample?.competitionId === competitionId ? this.stoppedSample : null;
    }
    // A stable sample until the next timer tick avoids new spectator revisions
    // on each read while preserving the exact authoritative expiration anchor.
    const remainingMs = this.remainingSeconds * 1000;
    const sampledAt = this.expiresAtMs - remainingMs;
    return { running: true, remainingMs, sampledAt, generation: this.startGeneration };
  }

  /** Stops the timer and retains its actual remaining time. */
  stop(): void {
    if (this.competitionId !== null && this.intervalId !== null) {
      const sampledAt = Date.now();
      this.stoppedSample = {
        competitionId: this.competitionId,
        running: false,
        remainingMs: Math.max(0, Math.min(this.remainingSeconds * 1000, this.expiresAtMs - sampledAt)),
        sampledAt,
        generation: this.startGeneration,
      };
    }
    this.startGeneration += 1;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.competitionId = null;
    this.expiresAtMs = 0;
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
  }

  /**
   * Freezes and persists the exact in-memory countdown for a Lane-specific interruption.
   */
  async pause(competitionId: string): Promise<{ remainingSeconds: number; totalSeconds: number }> {
    const readGeneration = this.startGeneration;
    const state = await this.competitionRepository.findById(competitionId);
    if (readGeneration !== this.startGeneration) throw new Error('Competition timer changed while pausing');
    if (!state || state.phase !== 'ACTIVE') throw new Error(`Competition ${competitionId} is not active`);

    let remainingSeconds = state.timer.remainingSeconds;
    let totalSeconds = state.timer.totalSeconds;
    if (this.competitionId === competitionId) {
      remainingSeconds = Math.min(this.remainingSeconds, this.remainingAt(Date.now()));
      totalSeconds = this.totalSeconds;
    }

    // Stop before persistence so a delayed or failed save cannot let the old
    // countdown expire or continue firing timer events during an interruption.
    this.stop();
    const pauseGeneration = this.startGeneration;
    await this.competitionRepository.save(state.replaceTimer(remainingSeconds, totalSeconds));
    if (pauseGeneration !== this.startGeneration) throw new Error('Competition timer changed while pausing');
    this.eventBus.emit({
      type: 'TimerTick',
      timestamp: Date.now(),
      aggregateId: competitionId,
      remainingSeconds,
      totalSeconds,
      formattedRemaining: this.formatRemaining(remainingSeconds),
    });
    return { remainingSeconds, totalSeconds };
  }

  /** Persists an authorized timer value and starts it at the supplied absolute time. */
  async resumeAt(competitionId: string, absoluteTime: string, durationSeconds: number): Promise<void> {
    this.assertRunPermitted();
    const state = await this.competitionRepository.findById(competitionId);
    this.assertRunPermitted();
    if (!state || state.phase !== 'ACTIVE') throw new Error(`Competition ${competitionId} is not active`);
    await this.competitionRepository.save(state.replaceTimer(durationSeconds, durationSeconds));
    this.assertRunPermitted();
    await this.startAt(competitionId, absoluteTime, durationSeconds);
  }

  /** Applies a Director timer-expired command immediately and idempotently. */
  async expire(competitionId: string): Promise<void> {
    this.stop();
    const generation = this.startGeneration;
    this.assertRunPermitted();
    const state = await this.competitionRepository.findById(competitionId);
    this.assertRunPermitted();
    if (!state || state.phase !== 'ACTIVE') return;

    const updated = state.tickTimerBy(state.timer.remainingSeconds);
    await this.competitionRepository.save(updated);
    this.assertRunPermitted();
    const expired = updated.expireTimer();
    await this.competitionRepository.save(expired);
    this.sampleExpiry(competitionId, generation);

    this.eventBus.emit({
      type: 'TimerExpired',
      timestamp: Date.now(),
      aggregateId: expired.id,
      stageIndex: expired.currentStageIndex,
    });
    emitPhaseChanged(this.eventBus, expired, 'ACTIVE');
  }

  private sampleExpiry(competitionId: string, generation: number): void {
    if (generation !== this.startGeneration) return;
    this.stoppedSample = { competitionId, running: false, remainingMs: 0, sampledAt: Date.now(), generation };
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
   * Derives remaining seconds from the deadline without rounding each callback's elapsed time.
   * For normal ticks, decrements in-memory remainingSeconds and emits only a TimerTick event.
   * Persists to the repository only on expiry.
   */
  async processTick(): Promise<void> {
    if (!this.competitionId) return;
    if (!this.isRunPermitted()) {
      this.stop();
      return;
    }
    const competitionId = this.competitionId;
    const generation = this.startGeneration;

    const remainingSeconds = this.remainingAt(Date.now());
    // Retain subsecond time across callbacks and do not increase the displayed
    // countdown after a wall-clock rollback. Only a new start authorizes more time.
    if (remainingSeconds >= this.remainingSeconds && this.remainingSeconds > 0) return;
    this.remainingSeconds = Math.min(this.remainingSeconds, remainingSeconds);

    // Emit TimerTick event (from in-memory state)
    this.eventBus.emit({
      type: 'TimerTick',
      timestamp: Date.now(),
      aggregateId: competitionId,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
      formattedRemaining: this.formatRemaining(this.remainingSeconds),
    });

    // Persist only on timer expiry
    if (this.remainingSeconds <= 0) {
      try {
        if (generation !== this.startGeneration) return;
        const state = await this.competitionRepository.findById(competitionId);
        if (generation !== this.startGeneration) return;
        if (!this.isRunPermitted()) {
          this.stop();
          return;
        }
        if (!state || state.phase !== 'ACTIVE') {
          this.stop();
          return;
        }

        const updated = state.tickTimerBy(state.timer.remainingSeconds);
        await this.competitionRepository.save(updated);
        if (generation !== this.startGeneration) return;
        if (!this.isRunPermitted()) {
          this.stop();
          return;
        }

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

  private remainingAt(nowMs: number): number {
    return Math.max(0, Math.ceil((this.expiresAtMs - nowMs) / 1000));
  }

  private assertRunPermitted(): void {
    if (this.isRunPermitted()) return;
    this.stop();
    const error = new Error('Competition timer operation is blocked by the Lane execution gate');
    (error as Error & { code: string }).code = 'LANE_TIMER_RUN_BLOCKED';
    throw error;
  }
}

function isTimerRunBlockedError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'LANE_TIMER_RUN_BLOCKED';
}
