// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Series } from '@/main/modules/session/domain/Series';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import { Shot } from './Shot';

/**
 * Session aggregate root
 *
 * The aggregate root that manages the entire shooting session. The most important entity.
 * Manages discipline, mode, series, and all shots, and handles score calculation and
 * automatic series switching.
 */
export class Session {
  /**
   * Unique identifier (UUID)
   */
  readonly id: string;

  /**
   * Discipline
   */
  readonly discipline: Discipline;

  /**
   * Current mode (sighting/match)
   */
  readonly mode: Mode;

  /**
   * Array of series
   */
  readonly series: readonly Series[];

  /**
   * History of all shots
   */
  readonly allShots: readonly Shot[];

  /**
   * Start time
   */
  readonly startedAt: Date;

  /**
   * End time (null if not finished)
   */
  readonly finishedAt: Date | null;

  /**
   * Scoring mode (RING=integer points, DECIMAL=decimal points)
   */
  readonly scoringMode: 'RING' | 'DECIMAL';

  /**
   * Private constructor
   * Prevents direct instantiation from outside; forces creation via static factory methods
   *
   * @param id - Unique identifier
   * @param discipline - Discipline
   * @param mode - Current mode
   * @param series - Array of series
   * @param allShots - History of all shots
   * @param startedAt - Start time
   * @param finishedAt - End time
   * @param scoringMode - Scoring mode (RING=integer points, DECIMAL=decimal points)
   */
  private constructor(
    id: string,
    discipline: Discipline,
    mode: Mode,
    series: readonly Series[],
    allShots: readonly Shot[],
    startedAt: Date,
    finishedAt: Date | null,
    scoringMode: 'RING' | 'DECIMAL' = 'DECIMAL',
  ) {
    // Invariant: at least one series is required
    if (series.length === 0) {
      throw ErrorCatalog.createError('INVALID_SESSION_STATE', {
        detail: 'A session must have at least one series',
      });
    }

    // Invariant: series numbers must be sequential starting from 1
    for (let i = 0; i < series.length; i++) {
      const expectedSeriesNumber = i + 1;
      const actualSeriesNumber = series[i]?.seriesNumber;
      if (actualSeriesNumber !== expectedSeriesNumber) {
        throw ErrorCatalog.createError('INVALID_SESSION_STATE', {
          detail: `Series numbers must be sequential starting from 1. Expected: ${expectedSeriesNumber}, Actual: ${actualSeriesNumber}`,
        });
      }
    }

    // Invariant: if finishedAt exists, it must be after startedAt
    if (finishedAt !== null && finishedAt < startedAt) {
      throw ErrorCatalog.createError('INVALID_SESSION_STATE', {
        detail: 'finishedAt must be after startedAt',
      });
    }

    this.id = id;
    this.discipline = discipline;
    this.mode = mode;
    this.series = series;
    this.allShots = allShots;
    this.startedAt = startedAt;
    this.finishedAt = finishedAt;
    this.scoringMode = scoringMode;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Gets the current series (computed property)
   *
   * @returns Current series, or undefined if not found
   */
  get currentSeries(): Series | undefined {
    return this.series[this.series.length - 1];
  }

  /**
   * Gets the total score (match shots only, ×10 integer) (computed property)
   *
   * @returns Total score of match shots (×10 integer; no precision issues since it uses integer addition)
   */
  get totalScore(): number {
    return this.matchShots.reduce((sum, shot) => sum + shot.score.value, 0);
  }

  /**
   * Gets the shot count (computed property)
   *
   * @returns Total number of shots
   */
  get shotCount(): number {
    return this.allShots.length;
  }

  /**
   * Determines whether the session is finished (computed property)
   *
   * @returns true if finished, false otherwise
   */
  get isFinished(): boolean {
    return this.finishedAt !== null;
  }

  /**
   * Gets the match shots (computed property)
   *
   * @returns Array of match shots
   */
  get matchShots(): readonly Shot[] {
    return this.allShots.filter((shot) => shot.mode.isMatch());
  }

  /**
   * Gets the sighting shots (computed property)
   *
   * @returns Array of sighting shots
   */
  get sightingShots(): readonly Shot[] {
    return this.allShots.filter((shot) => shot.mode.isSighting());
  }

  /**
   * Records a shot and returns a new Session instance
   *
   * @param impactPoint - Impact point (null for a miss shot)
   * @param score - Score
   * @param timestamp - Impact timestamp
   * @param deviceScore - Score calculated by the target device (optional)
   * @param innerTen - Whether it is an inner ten (default false)
   * @param shotMode - Mode for this shot (uses Session's current mode if omitted)
   * @returns New Session instance
   * @throws {Error} If the session is already finished
   */
  recordShot(
    impactPoint: ImpactPoint | null,
    score: Score,
    timestamp: Date,
    deviceScore?: Score,
    innerTen: boolean = false,
    shotMode?: Mode,
  ): Session {
    // Business rule: cannot add new shots to a finished session
    if (this.isFinished) {
      throw ErrorCatalog.createError('SESSION_ALREADY_FINISHED', {
        detail: 'Cannot add new shots to a finished session',
      });
    }

    const shotNumber = this.allShots.length + 1;
    const currentSeries = this.currentSeries;

    if (currentSeries === undefined) {
      throw ErrorCatalog.createError('CURRENT_SERIES_NOT_FOUND');
    }

    // Prioritize the mode supplied for this shot; use the session mode if omitted
    const effectiveMode = shotMode ?? this.mode;

    // Determine series number
    let seriesNumber: number;
    if (effectiveMode.isSighting()) {
      // Sighting shots do not belong to a series
      seriesNumber = 0;
    } else if (currentSeries.isComplete) {
      // Match shot and current series is complete → move to new series
      seriesNumber = this.series.length + 1;
    } else {
      // Match shot and current series is incomplete → stay in current series
      seriesNumber = this.series.length;
    }

    // Create a new Shot
    const newShot = Shot.create({
      impactPoint,
      score,
      mode: effectiveMode,
      timestamp,
      shotNumber,
      seriesNumber,
      innerTen,
      deviceScore,
    });

    // Add to all shots history
    const newAllShots = [...this.allShots, newShot];

    // Add score to current series
    let newSeries = [...this.series];

    // Business rule: do not add scores to series in sighting mode
    // Series are only managed in match mode
    if (effectiveMode.isSighting()) {
      // In sighting mode, do not add to series; maintain the current series as-is
      newSeries = [...this.series];
    } else if (currentSeries.isComplete) {
      // In match mode, if the current series is complete, create a new series (transfer maxShots)
      const nextSeriesNumber = this.series.length + 1;
      const newSeriesInstance = Series.create(nextSeriesNumber, currentSeries.maxShots).addScore(score);
      newSeries = [...newSeries, newSeriesInstance];
    } else {
      // In match mode, if the current series is incomplete, add the score
      const updatedSeries = currentSeries.addScore(score);
      newSeries = [...newSeries.slice(0, -1), updatedSeries];
    }

    return new Session(
      this.id,
      this.discipline,
      this.mode,
      newSeries,
      newAllShots,
      this.startedAt,
      this.finishedAt,
      this.scoringMode,
    );
  }

  /**
   * Switches the mode and returns a new Session instance
   *
   * @param newMode - New mode
   * @param maxShots - Maximum shot count for the new series (default 10 if omitted)
   * @returns New Session instance
   * @throws {Error} If the session is already finished
   */
  switchMode(newMode: Mode, maxShots?: number): Session {
    // Business rule: cannot switch mode on a finished session
    if (this.isFinished) {
      throw ErrorCatalog.createError('SESSION_ALREADY_FINISHED', {
        detail: 'Cannot switch mode on a finished session',
      });
    }

    // Start a new series
    const nextSeriesNumber = this.series.length + 1;
    const newSeriesInstance = Series.create(nextSeriesNumber, maxShots);
    const newSeries = [...this.series, newSeriesInstance];

    return new Session(
      this.id,
      this.discipline,
      newMode,
      newSeries,
      this.allShots,
      this.startedAt,
      this.finishedAt,
      this.scoringMode,
    );
  }

  /**
   * Resets the current series and returns a new Session instance
   *
   * @param maxShots - Maximum shot count for the new series (default 10 if omitted)
   * @returns New Session instance
   * @throws {Error} If the session is already finished
   */
  resetSeries(maxShots?: number): Session {
    // Business rule: cannot reset a finished session
    if (this.isFinished) {
      throw ErrorCatalog.createError('SESSION_ALREADY_FINISHED', { detail: 'Cannot reset a finished session' });
    }

    // Create a new series
    const nextSeriesNumber = this.series.length + 1;
    const newSeriesInstance = Series.create(nextSeriesNumber, maxShots);
    const newSeries = [...this.series, newSeriesInstance];

    return new Session(
      this.id,
      this.discipline,
      this.mode,
      newSeries,
      this.allShots,
      this.startedAt,
      this.finishedAt,
      this.scoringMode,
    );
  }

  /**
   * Finishes the session and returns a new Session instance
   *
   * @returns New Session instance
   */
  finish(): Session {
    return new Session(
      this.id,
      this.discipline,
      this.mode,
      this.series,
      this.allShots,
      this.startedAt,
      new Date(),
      this.scoringMode,
    );
  }

  /**
   * Checks equality with another Session (determined by ID)
   *
   * @param other - The Session to compare against
   * @returns true if IDs are equal, false otherwise
   */
  equals(other: Session): boolean {
    return this.id === other.id;
  }

  /**
   * Starts a new session (static factory method)
   *
   * @param discipline - Discipline
   * @param scoringMode - Scoring mode (DECIMAL if omitted)
   * @returns New Session instance
   */
  static create(discipline: Discipline, scoringMode: 'RING' | 'DECIMAL' = 'DECIMAL'): Session {
    const id = crypto.randomUUID();
    const mode = Mode.sighting(); // Default is sighting mode
    const initialSeries = Series.create(1); // Create the first series
    const allShots: Shot[] = [];
    const startedAt = new Date();
    const finishedAt = null;

    return new Session(id, discipline, mode, [initialSeries], allShots, startedAt, finishedAt, scoringMode);
  }

  /**
   * Reconstructs a Session from domain objects (static factory method)
   *
   * Use SessionFactory.fromStorageData() for restoring from storage data.
   *
   * @param params - Domain objects required for reconstruction
   * @returns Reconstructed Session instance
   */
  static reconstruct(params: {
    id: string;
    discipline: Discipline;
    mode: Mode;
    series: readonly Series[];
    allShots: readonly Shot[];
    startedAt: Date;
    finishedAt: Date | null;
    scoringMode?: 'RING' | 'DECIMAL';
  }): Session {
    return new Session(
      params.id,
      params.discipline,
      params.mode,
      params.series,
      params.allShots,
      params.startedAt,
      params.finishedAt,
      params.scoringMode ?? 'DECIMAL',
    );
  }
}
