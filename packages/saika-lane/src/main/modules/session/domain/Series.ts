// SPDX-License-Identifier: MIT
import { Score } from '@/main/modules/session/domain/Score';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Immutable series with scores in tenths of a point. */
export class Series {
  /** One-based series number. */
  readonly seriesNumber: number;

  readonly scores: readonly Score[];

  /**
   * Maximum number of shots per series (0 = unlimited)
   */
  readonly maxShots: number;

  private constructor(seriesNumber: number, scores: readonly Score[], maxShots: number) {
    if (!Number.isInteger(seriesNumber)) {
      throw ErrorCatalog.createError('INVALID_SERIES', { detail: 'Series number must be an integer' });
    }
    if (seriesNumber < 1) {
      throw ErrorCatalog.createError('INVALID_SERIES', { detail: 'Series number must be at least 1' });
    }

    if (maxShots > 0 && scores.length > maxShots) {
      throw ErrorCatalog.createError('INVALID_SERIES', { detail: `Series cannot have more than ${maxShots} scores` });
    }

    this.seriesNumber = seriesNumber;
    this.scores = Object.freeze([...scores]);
    this.maxShots = maxShots;

    Object.freeze(this);
  }

  /** Sum of scores in tenths of a point. */
  get total(): number {
    return this.scores.reduce((sum, score) => sum + score.value, 0);
  }

  get count(): number {
    return this.scores.length;
  }

  /** Always false for an unlimited series (maxShots = 0). */
  get isComplete(): boolean {
    return this.maxShots > 0 && this.scores.length >= this.maxShots;
  }

  /** Rounded average in tenths of a point, or zero for an empty series. */
  get average(): number {
    if (this.scores.length === 0) {
      return 0;
    }
    return Math.round(this.total / this.scores.length);
  }

  /** Appends a score; rejects a completed series. */
  addScore(score: Score): Series {
    if (this.isComplete) {
      throw ErrorCatalog.createError('INVALID_SERIES', {
        detail: `Cannot add score to a complete series (already has ${this.maxShots} scores)`,
      });
    }

    const newScores = [...this.scores, score];
    return new Series(this.seriesNumber, newScores, this.maxShots);
  }

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

  /** Creates an empty series. Use maxShots = 0 for unlimited shots. */
  static create(seriesNumber: number, maxShots: number = 10): Series {
    return new Series(seriesNumber, [], maxShots);
  }
}
