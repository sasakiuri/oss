// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Immutable score in tenths of a point: 0–109 represents 0.0–10.9 points. */
export class Score {
  readonly value: number;

  /**
   * @param value - Score in tenths of a point (0–109).
   * @throws If the value is non-integer, non-finite, or outside 0–109.
   */
  constructor(value: number) {
    if (Number.isNaN(value)) {
      throw ErrorCatalog.createError('INVALID_SCORE', { detail: 'Score value cannot be NaN' });
    }

    if (!Number.isFinite(value)) {
      throw ErrorCatalog.createError('INVALID_SCORE', { detail: 'Score value must be finite' });
    }

    if (!Number.isInteger(value)) {
      throw ErrorCatalog.createError('INVALID_SCORE', { detail: `Score value must be an integer, got ${value}` });
    }

    if (value < 0 || value > 109) {
      throw ErrorCatalog.createError('INVALID_SCORE', {
        detail: `Score value must be between 0 and 109, got ${value}`,
      });
    }

    this.value = value;

    Object.freeze(this);
  }

  /** @deprecated Use Shot.innerTen. A fixed score of 10.9 does not determine the inner ten. */
  isInner(): boolean {
    return this.value === 109;
  }

  equals(other: Score): boolean {
    return this.value === other.value;
  }

  /** Returns a positive number if this score is larger, a negative number if smaller, or zero if equal. */
  compareTo(other: Score): number {
    return this.value - other.value;
  }

  static zero(): Score {
    return new Score(0);
  }

  static miss(): Score {
    return new Score(0);
  }

  /** Decimal notation with one fractional digit, such as "10.5" or "0.0". */
  toString(): string {
    return (this.value / 10).toFixed(1);
  }
}
