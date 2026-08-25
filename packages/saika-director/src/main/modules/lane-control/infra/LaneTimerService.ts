import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '../domain/ILaneControlRepository';

interface LaneTimerState {
  isRunning: boolean;
  lastTickTime: number;
}

export class LaneTimerService {
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private activeLanes = new Map<string, LaneTimerState>();
  private stopDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  private ensureGlobalTick(): void {
    if (this.stopDebounceTimer) {
      clearTimeout(this.stopDebounceTimer);
      this.stopDebounceTimer = null;
    }
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => {
      this.globalTick();
    }, 1000);
  }

  private stopGlobalTickIfEmpty(): void {
    if (this.activeLanes.size === 0) {
      if (this.stopDebounceTimer) return;

      this.stopDebounceTimer = setTimeout(() => {
        this.stopDebounceTimer = null;
        if (this.activeLanes.size === 0) {
          if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
          }
        }
      }, 0);
    }
  }

  private globalTick(): void {
    const now = Date.now();
    for (const [laneId, state] of this.activeLanes) {
      if (state.isRunning) {
        const elapsedMs = now - state.lastTickTime;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        if (elapsedSeconds > 0) {
          // Preserve sub-second remainder so repeated delayed ticks catch up
          // to wall-clock time instead of permanently discarding drift.
          state.lastTickTime += elapsedSeconds * 1000;
          this.tick(laneId, elapsedSeconds);
        }
      }
    }
  }

  startTimer(laneId: string): void {
    this.activeLanes.set(laneId, { isRunning: true, lastTickTime: Date.now() });
    this.ensureGlobalTick();
  }

  restoreActiveTimers(): void {
    for (const lane of this.repository.findActive()) {
      if (lane.phase === 'ACTIVE' && lane.timer) {
        this.startTimer(lane.id);
      }
    }
  }

  stopTimer(laneId: string): void {
    this.activeLanes.delete(laneId);
    this.stopGlobalTickIfEmpty();
  }

  stopAll(): void {
    this.activeLanes.clear();
    this.stopGlobalTickIfEmpty();
  }

  stopAllTimers(): void {
    this.activeLanes.clear();
    if (this.stopDebounceTimer) {
      clearTimeout(this.stopDebounceTimer);
      this.stopDebounceTimer = null;
    }
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private tick(laneId: string, elapsedSeconds: number = 1): void {
    const laneControl = this.repository.findById(laneId);
    if (!laneControl || !laneControl.timer) {
      this.activeLanes.delete(laneId);
      this.stopGlobalTickIfEmpty();
      return;
    }

    const updated = laneControl.tickTimer(elapsedSeconds);
    this.repository.save(updated);

    this.eventBus.emit({
      type: 'LaneTimerTick',
      timestamp: Date.now(),
      laneId,
      remainingTime: updated.remainingTime,
      phase: updated.phase,
    });

    if (updated.phase !== 'ACTIVE' || updated.timer?.isExpired) {
      // Phase transition (FINISHED, SERIES_COMPLETE, etc.) or timer expired while still ACTIVE
      this.eventBus.emit({
        type: 'LaneTimerExpired',
        timestamp: Date.now(),
        laneId,
        phase: updated.phase,
      });
      this.activeLanes.delete(laneId);
      this.stopGlobalTickIfEmpty();
    }
    // If still ACTIVE with non-expired timer (mode:shot reset), continue ticking
  }
}
