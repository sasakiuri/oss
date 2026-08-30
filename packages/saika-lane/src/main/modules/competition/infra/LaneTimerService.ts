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
  private startGeneration: number = 0;

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
    this.stop();
    this.assertRunPermitted();
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

      this.start(competitionId, remainingSeconds, durationSeconds);
    } catch (error) {
      if (isTimerRunBlockedError(error)) throw error;
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
    this.startGeneration += 1;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.competitionId = null;
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
  }

  /**
   * Freezes and persists the exact in-memory countdown for a Lane-specific interruption.
   */
  async pause(competitionId: string): Promise<{ remainingSeconds: number; totalSeconds: number }> {
    const state = await this.competitionRepository.findById(competitionId);
    if (!state || state.phase !== 'ACTIVE') throw new Error(`Competition ${competitionId} is not active`);

    let remainingSeconds = state.timer.remainingSeconds;
    let totalSeconds = state.timer.totalSeconds;
    if (this.competitionId === competitionId) {
      const elapsedSeconds = Math.max(0, Math.round((Date.now() - this.lastTickTime) / 1000));
      remainingSeconds = Math.max(0, this.remainingSeconds - elapsedSeconds);
      totalSeconds = this.totalSeconds;
    }

    await this.competitionRepository.save(state.replaceTimer(remainingSeconds, totalSeconds));
    this.eventBus.emit({
      type: 'TimerTick',
      timestamp: Date.now(),
      aggregateId: competitionId,
      remainingSeconds,
      totalSeconds,
      formattedRemaining: this.formatRemaining(remainingSeconds),
    });
    this.stop();
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
    this.assertRunPermitted();
    const state = await this.competitionRepository.findById(competitionId);
    this.assertRunPermitted();
    if (!state || state.phase !== 'ACTIVE') return;

    const updated = state.tickTimerBy(state.timer.remainingSeconds);
    await this.competitionRepository.save(updated);
    this.assertRunPermitted();
    const expired = updated.expireTimer();
    await this.competitionRepository.save(expired);

    this.eventBus.emit({
      type: 'TimerExpired',
      timestamp: Date.now(),
      aggregateId: expired.id,
      stageIndex: expired.currentStageIndex,
    });
    emitPhaseChanged(this.eventBus, expired, 'ACTIVE');
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
    if (!this.isRunPermitted()) {
      this.stop();
      return;
    }
    const competitionId = this.competitionId;
    const generation = this.startGeneration;

    const now = Date.now();
    const elapsedSeconds = Math.round((now - this.lastTickTime) / 1000);
    this.lastTickTime = now;

    if (elapsedSeconds <= 0) return;

    this.remainingSeconds = Math.max(0, this.remainingSeconds - elapsedSeconds);

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
