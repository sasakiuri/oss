// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * Timer — immutable timer value object
 *
 * An immutable object representing a countdown timer during competition.
 * All operations return a new instance.
 */
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

  /**
   * Creates a timer
   *
   * @param durationSeconds - Total duration of the timer in seconds
   * @returns A new Timer instance
   */
  static create(durationSeconds: number): Timer {
    return new Timer(durationSeconds, durationSeconds);
  }

  /**
   * Returns a new Timer with 1 second subtracted
   */
  tick(): Timer {
    return new Timer(this.remainingSeconds - 1, this.totalSeconds);
  }

  /**
   * Returns a new Timer with n seconds subtracted
   *
   * @param seconds - Number of seconds to subtract
   */
  tickBy(seconds: number): Timer {
    return new Timer(this.remainingSeconds - seconds, this.totalSeconds);
  }

  /**
   * Returns the remaining time string in "MM:SS" format
   */
  get formattedRemaining(): string {
    const clamped = Math.max(0, this.remainingSeconds);
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  /**
   * Determines whether the timer has expired
   */
  get isExpired(): boolean {
    return this.remainingSeconds <= 0;
  }

  /**
   * Equality check for timers
   */
  equals(other: Timer): boolean {
    return this.remainingSeconds === other.remainingSeconds && this.totalSeconds === other.totalSeconds;
  }

  /**
   * Reconstruction method for repository restoration
   */
  static reconstruct(remainingSeconds: number, totalSeconds: number): Timer {
    return new Timer(remainingSeconds, totalSeconds);
  }
}
