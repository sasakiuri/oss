// SPDX-License-Identifier: MIT
import { Score } from '@/main/modules/session/domain/Score';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * Series value object
 *
 * An immutable value object representing a unit of shooting.
 * Has a series number, score list, total score, average score, and maximum shot count.
 * Scores are managed as ×10 integer representation (Score.value).
 */
export class Series {
  /**
   * Series number (read-only)
   */
  readonly seriesNumber: number;

  /**
   * Array of scores (read-only)
   */
  readonly scores: readonly Score[];

  /**
   * Maximum number of shots per series (0 = unlimited)
   */
  readonly maxShots: number;

  /**
   * Private constructor
   * Prevents direct instantiation from outside; forces creation via static factory methods
   *
   * @param seriesNumber - Series number (integer >= 1)
   * @param scores - Array of scores
   * @param maxShots - Maximum shot count (0 = unlimited)
   * @throws {Error} If an invariant is violated
   */
  private constructor(seriesNumber: number, scores: readonly Score[], maxShots: number) {
    // Invariant check for series number
    if (!Number.isInteger(seriesNumber)) {
      throw ErrorCatalog.createError('INVALID_SERIES', { detail: 'Series number must be an integer' });
    }
    if (seriesNumber < 1) {
      throw ErrorCatalog.createError('INVALID_SERIES', { detail: 'Series number must be at least 1' });
    }

    // Invariant check for score count
    if (maxShots > 0 && scores.length > maxShots) {
      throw ErrorCatalog.createError('INVALID_SERIES', { detail: `Series cannot have more than ${maxShots} scores` });
    }

    this.seriesNumber = seriesNumber;
    this.scores = Object.freeze([...scores]); // Defensive copy + freeze
    this.maxShots = maxShots;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Gets the total score (computed property, ×10 integer)
   *
   * @returns Total of all scores (×10 integer; no precision issues since it uses integer addition)
   */
  get total(): number {
    return this.scores.reduce((sum, score) => sum + score.value, 0);
  }

  /**
   * Gets the shot count (computed property)
   *
   * @returns Number of scores
   */
  get count(): number {
    return this.scores.length;
  }

  /**
   * Determines whether the series is complete (computed property)
   *
   * @returns true if maxShots shots have been completed (always false if maxShots=0)
   */
  get isComplete(): boolean {
    return this.maxShots > 0 && this.scores.length >= this.maxShots;
  }

  /**
   * Gets the average score (computed property, ×10 integer)
   *
   * @returns Average score (rounded to ×10 integer scale), 0 if no scores
   */
  get average(): number {
    if (this.scores.length === 0) {
      return 0;
    }
    return Math.round(this.total / this.scores.length);
  }

  /**
   * Returns a new Series instance with a new score added (immutable)
   *
   * @param score - Score to add
   * @returns New Series instance
   * @throws {Error} If the series already has maxShots scores
   */
  addScore(score: Score): Series {
    if (this.isComplete) {
      throw ErrorCatalog.createError('INVALID_SERIES', {
        detail: `Cannot add score to a complete series (already has ${this.maxShots} scores)`,
      });
    }

    const newScores = [...this.scores, score];
    return new Series(this.seriesNumber, newScores, this.maxShots);
  }

  /**
   * Checks equality with another Series
   *
   * @param other - The Series to compare against
   * @returns true if equal, false otherwise
   */
  equals(other: Series): boolean {
    if (this.seriesNumber !== other.seriesNumber) {
      return false;
    }
    if (this.scores.length !== other.scores.length) {
      return false;
    }
    return this.scores.every((score, index) => {
      const otherScore = other.scores[index];
      return otherScore !== undefined && score.equals(otherScore);
    });
  }

  /**
   * Creates an empty series (static factory method)
   *
   * @param seriesNumber - Series number (integer >= 1)
   * @param maxShots - Maximum shot count (default 10, 0 = unlimited)
   * @returns Empty Series instance
   * @throws {Error} If the series number is invalid
   */
  static create(seriesNumber: number, maxShots: number = 10): Series {
    return new Series(seriesNumber, [], maxShots);
  }
}
