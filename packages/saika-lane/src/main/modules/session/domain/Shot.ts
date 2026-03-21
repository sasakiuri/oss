// SPDX-License-Identifier: MIT
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * Shot entity
 *
 * An entity representing a single shot. Has an impact point, score, mode, timestamp,
 * and shot number. Entity identity is determined by ID.
 */
export class Shot {
  /**
   * Unique identifier (UUID)
   */
  readonly id: string;

  /**
   * Impact point (null for a miss shot)
   */
  readonly impactPoint: ImpactPoint | null;

  /**
   * Score
   */
  readonly score: Score;

  /**
   * Mode (sighting/match)
   */
  readonly mode: Mode;

  /**
   * Firing time
   */
  readonly timestamp: Date;

  /**
   * Shot number (1–N)
   */
  readonly shotNumber: number;

  /**
   * Series number (0=sighting, 1+=match series)
   */
  readonly seriesNumber: number;

  /**
   * Whether it is in the X ring (inner ten)
   * Based on physical X ring geometry determination (impactDistance <= xRingRadius)
   */
  readonly innerTen: boolean;

  /**
   * Score calculated by the target device (optional)
   */
  readonly deviceScore?: Score;

  /**
   * Private constructor
   * Prevents direct instantiation from outside; forces creation via static factory methods
   *
   * @param id - Unique identifier
   * @param impactPoint - Impact point (null for a miss shot)
   * @param score - Score
   * @param mode - Mode
   * @param timestamp - Firing time
   * @param shotNumber - Shot number
   * @param seriesNumber - Series number
   * @param innerTen - Whether it is in the X ring (inner ten)
   * @param deviceScore - Score calculated by the target device (optional)
   */
  private constructor(
    id: string,
    impactPoint: ImpactPoint | null,
    score: Score,
    mode: Mode,
    timestamp: Date,
    shotNumber: number,
    seriesNumber: number,
    innerTen: boolean,
    deviceScore?: Score,
  ) {
    this.id = id;
    this.impactPoint = impactPoint;
    this.score = score;
    this.mode = mode;
    this.timestamp = timestamp;
    this.shotNumber = shotNumber;
    this.seriesNumber = seriesNumber;
    this.innerTen = innerTen;
    this.deviceScore = deviceScore;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Creates a new Shot (static factory method)
   *
   * @param props - Shot properties
   * @returns New Shot instance
   * @throws {Error} If an invariant is violated
   */
  static create(props: {
    impactPoint: ImpactPoint | null;
    score: Score;
    mode: Mode;
    timestamp: Date;
    shotNumber: number;
    seriesNumber: number;
    innerTen: boolean;
    deviceScore?: Score;
  }): Shot {
    // Invariant: shotNumber must be an integer >= 1
    if (props.shotNumber < 1) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'shotNumber must be an integer >= 1' });
    }
    if (!Number.isInteger(props.shotNumber)) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'shotNumber must be an integer' });
    }

    // Invariant: seriesNumber must be an integer >= 0
    if (props.seriesNumber < 0) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'seriesNumber must be an integer >= 0' });
    }
    if (!Number.isInteger(props.seriesNumber)) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'seriesNumber must be an integer' });
    }

    // Invariant: timestamp must be a valid date/time
    if (isNaN(props.timestamp.getTime())) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'timestamp must be a valid date/time' });
    }

    // Auto-generate ID (UUID v4)
    const id = crypto.randomUUID();

    return new Shot(
      id,
      props.impactPoint,
      props.score,
      props.mode,
      props.timestamp,
      props.shotNumber,
      props.seriesNumber,
      props.innerTen,
      props.deviceScore,
    );
  }

  /**
   * Reconstructs a Shot from storage data (static factory method)
   *
   * @param data - Serialized data retrieved from storage
   * @returns Reconstructed Shot instance
   * @throws {Error} If the data is invalid
   */
  static reconstruct(data: {
    id: string;
    impactPoint: ImpactPoint | null;
    score: Score;
    mode: Mode;
    timestamp: Date;
    shotNumber: number;
    seriesNumber: number;
    innerTen: boolean;
    deviceScore?: Score;
  }): Shot {
    // Invariant: shotNumber must be an integer >= 1
    if (data.shotNumber < 1) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'shotNumber must be an integer >= 1' });
    }
    if (!Number.isInteger(data.shotNumber)) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'shotNumber must be an integer' });
    }

    // Invariant: seriesNumber must be an integer >= 0
    if (data.seriesNumber < 0) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'seriesNumber must be an integer >= 0' });
    }
    if (!Number.isInteger(data.seriesNumber)) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'seriesNumber must be an integer' });
    }

    // Invariant: timestamp must be a valid date/time
    if (isNaN(data.timestamp.getTime())) {
      throw ErrorCatalog.createError('INVALID_SHOT', { detail: 'timestamp must be a valid date/time' });
    }

    // Reconstruct using the existing ID
    return new Shot(
      data.id,
      data.impactPoint,
      data.score,
      data.mode,
      data.timestamp,
      data.shotNumber,
      data.seriesNumber,
      data.innerTen,
      data.deviceScore,
    );
  }

  /**
   * Checks equality with another Shot (determined by ID)
   *
   * @param other - The Shot to compare against
   * @returns true if IDs are equal, false otherwise
   */
  equals(other: Shot): boolean {
    return this.id === other.id;
  }

  /**
   * Determines whether this is an inner ten
   *
   * @deprecated Use the innerTen property directly
   * @returns true if in the X ring (inner ten), false otherwise
   */
  isInner(): boolean {
    return this.innerTen;
  }
}
