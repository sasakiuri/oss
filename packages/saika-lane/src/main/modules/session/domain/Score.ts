// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * Score value object
 *
 * An immutable value object representing a shooting score.
 * Managed as an ×10 integer representation: integer values from 0 to 109
 * (e.g., 10.9 points → 109, 0.0 points → 0).
 * Designed to avoid floating-point precision issues.
 */
export class Score {
  /**
   * Score value (×10 integer, read-only)
   * Example: 109 = 10.9 points, 100 = 10.0 points, 0 = 0.0 points
   */
  readonly value: number;

  /**
   * Constructor
   *
   * @param value - Score (×10 integer, 0–109)
   * @throws {Error} If the value is out of range, non-integer, NaN, or Infinity
   */
  constructor(value: number) {
    // Check for invalid values
    if (Number.isNaN(value)) {
      throw ErrorCatalog.createError('INVALID_SCORE', { detail: 'Score value cannot be NaN' });
    }

    if (!Number.isFinite(value)) {
      throw ErrorCatalog.createError('INVALID_SCORE', { detail: 'Score value must be finite' });
    }

    if (!Number.isInteger(value)) {
      throw ErrorCatalog.createError('INVALID_SCORE', { detail: `Score value must be an integer, got ${value}` });
    }

    // Range check
    if (value < 0 || value > 109) {
      throw ErrorCatalog.createError('INVALID_SCORE', {
        detail: `Score value must be between 0 and 109, got ${value}`,
      });
    }

    this.value = value;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Determines whether this is an inner ten (10.9 points = 109)
   *
   * @deprecated Use the Shot.innerTen property instead. Score's isInner() is inaccurate as it uses a fixed value check.
   * @returns true if 109 (10.9 points), false otherwise
   */
  isInner(): boolean {
    return this.value === 109;
  }

  /**
   * Checks equality with another Score
   *
   * @param other - The Score to compare against
   * @returns true if values are equal, false otherwise
   */
  equals(other: Score): boolean {
    return this.value === other.value;
  }

  /**
   * Compares magnitude with another Score
   *
   * @param other - The Score to compare against
   * @returns positive if this Score is larger, negative if smaller, 0 if equal
   */
  compareTo(other: Score): number {
    return this.value - other.value;
  }

  /**
   * Creates a Score instance with 0 points (static factory method)
   *
   * @returns Score of 0 points
   */
  static zero(): Score {
    return new Score(0);
  }

  /**
   * Creates a Score instance for a miss (0 points) (static factory method)
   *
   * @returns Score of 0 points (miss)
   */
  static miss(): Score {
    return new Score(0);
  }

  /**
   * Returns the string representation (decimal notation)
   *
   * @returns String representation of the score (e.g., "10.5", "0.0")
   */
  toString(): string {
    return (this.value / 10).toFixed(1);
  }
}
