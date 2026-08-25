import { DomainError, ErrorCatalog } from '@/shared/errors';
import { PROTOCOL } from '@/shared/constants';

export class Score {
  private constructor(public readonly value: number) {}

  static create(value: number): Score {
    if (!Number.isFinite(value)) {
      throw DomainError.from(ErrorCatalog.SCORE.NOT_FINITE);
    }
    if (value < PROTOCOL.SCORE.MIN || value > PROTOCOL.SCORE.MAX) {
      throw DomainError.from(ErrorCatalog.SCORE.OUT_OF_RANGE);
    }
    return new Score(Math.round(value * 10) / 10);
  }

  static zero(): Score {
    return new Score(0.0);
  }

  isZero(): boolean {
    return this.value === 0.0;
  }

  add(other: Score): number {
    return Math.round((this.value + other.value) * 10) / 10;
  }

  toString(): string {
    return this.value.toFixed(1);
  }

  equals(other: Score): boolean {
    return this.value === other.value;
  }
}
