// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Immutable countdown in seconds. Negative remaining time is clamped to zero. */
export class Timer {
  readonly remainingSeconds: number;
  readonly totalSeconds: number;

  private constructor(remainingSeconds: number, totalSeconds: number) {
    if (!Number.isInteger(totalSeconds) || totalSeconds < 0) {
      throw ErrorCatalog.createError('INVALID_TIMER_DURATION', { value: totalSeconds });
    }

    this.remainingSeconds = Math.max(0, remainingSeconds);
    this.totalSeconds = totalSeconds;

    Object.freeze(this);
  }

  static create(durationSeconds: number): Timer {
    return new Timer(durationSeconds, durationSeconds);
  }

  tick(): Timer {
    return new Timer(this.remainingSeconds - 1, this.totalSeconds);
  }

  tickBy(seconds: number): Timer {
    return new Timer(this.remainingSeconds - seconds, this.totalSeconds);
  }

  /** Remaining time as MM:SS. */
  get formattedRemaining(): string {
    const clamped = Math.max(0, this.remainingSeconds);
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  get isExpired(): boolean {
    return this.remainingSeconds <= 0;
  }

  equals(other: Timer): boolean {
    return this.remainingSeconds === other.remainingSeconds && this.totalSeconds === other.totalSeconds;
  }

  static reconstruct(remainingSeconds: number, totalSeconds: number): Timer {
    return new Timer(remainingSeconds, totalSeconds);
  }
}
