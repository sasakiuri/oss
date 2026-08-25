import { DomainError, ErrorCatalog } from '@/shared/errors';

export class Timer {
  private constructor(
    public readonly remainingSeconds: number,
    public readonly totalSeconds: number,
  ) {}

  static create(totalSeconds: number): Timer {
    if (!Number.isInteger(totalSeconds) || totalSeconds < 0) {
      throw DomainError.from(ErrorCatalog.TIMER.INVALID_DURATION);
    }
    return new Timer(totalSeconds, totalSeconds);
  }

  static restore(remainingSeconds: number, totalSeconds: number): Timer {
    return new Timer(remainingSeconds, totalSeconds);
  }

  tick(): Timer {
    if (this.isExpired) {
      return this;
    }
    return new Timer(this.remainingSeconds - 1, this.totalSeconds);
  }

  tickBy(seconds: number): Timer {
    if (this.isExpired || seconds <= 0) {
      return this;
    }
    return new Timer(Math.max(0, this.remainingSeconds - seconds), this.totalSeconds);
  }

  get isExpired(): boolean {
    return this.remainingSeconds <= 0;
  }

  get elapsedSeconds(): number {
    return this.totalSeconds - this.remainingSeconds;
  }

  get formattedRemaining(): string {
    const minutes = Math.floor(this.remainingSeconds / 60);
    const seconds = this.remainingSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}
