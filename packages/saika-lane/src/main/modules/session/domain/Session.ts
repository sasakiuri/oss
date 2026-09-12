// SPDX-License-Identifier: MIT

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Series } from '@/main/modules/session/domain/Series';
import type { ShotCompetitionContext } from '@/main/modules/session/domain/ShotCompetitionContext';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import type { ScoringGaugeProfileId, TargetScoringProfileId } from '@/shared/target';

import { Shot } from './Shot';

/** Immutable session state with shot history, scores, and series progression. */
export class Session {
  /** UUID. */
  readonly id: string;

  readonly discipline: Discipline;

  readonly mode: Mode;

  readonly series: readonly Series[];

  readonly allShots: readonly Shot[];

  readonly startedAt: Date;

  readonly finishedAt: Date | null;

  /**
   * Scoring mode (RING=integer points, DECIMAL=decimal points)
   */
  readonly scoringMode: 'RING' | 'DECIMAL';

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

    Object.freeze(this);
  }

  get currentSeries(): Series | undefined {
    return this.series[this.series.length - 1];
  }

  /** Match total in tenths of a point. Sighting shots are excluded. */
  get totalScore(): number {
    return this.matchShots.reduce((sum, shot) => sum + shot.score.value, 0);
  }

  get shotCount(): number {
    return this.allShots.length;
  }

  get isFinished(): boolean {
    return this.finishedAt !== null;
  }

  get matchShots(): readonly Shot[] {
    return this.allShots.filter((shot) => shot.mode.isMatch());
  }

  get sightingShots(): readonly Shot[] {
    return this.allShots.filter((shot) => shot.mode.isSighting());
  }

  /**
   * Records a shot; rejects a finished session.
   * shotMode defaults to the session mode, and innerTen defaults to false.
   */
  recordShot(
    impactPoint: ImpactPoint | null,
    score: Score,
    timestamp: Date,
    deviceScore?: Score,
    innerTen: boolean = false,
    shotMode?: Mode,
    evidence?: {
      calculatedScore?: Score;
      receivedAt?: Date;
      sourceObservationId?: string;
      targetProfileId?: TargetScoringProfileId;
      scoringGaugeProfileId?: ScoringGaugeProfileId;
      competitionContext?: ShotCompetitionContext;
    },
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
      calculatedScore: evidence?.calculatedScore,
      receivedAt: evidence?.receivedAt,
      sourceObservationId: evidence?.sourceObservationId,
      targetProfileId: evidence?.targetProfileId,
      scoringGaugeProfileId: evidence?.scoringGaugeProfileId,
      competitionContext: evidence?.competitionContext,
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

  /** Resumes the given mode without starting a new series; rejects a finished session. */
  resumeMode(newMode: Mode): Session {
    if (this.isFinished)
      throw ErrorCatalog.createError('SESSION_ALREADY_FINISHED', { detail: 'Cannot resume a finished session' });
    return new Session(
      this.id,
      this.discipline,
      newMode,
      this.series,
      this.allShots,
      this.startedAt,
      this.finishedAt,
      this.scoringMode,
    );
  }

  /** Switches mode and starts a new series, even when the mode is unchanged. */
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

  /** Starts an empty series; rejects a finished session. Defaults to ten shots. */
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
   * Clears all shooting data while keeping the current session active.
   *
   * Session identity, discipline, mode, start time, and scoring mode are
   * preserved so connected targets can continue using the same context.
   *
   * @returns A new Session instance with one empty series and no shots
   * @throws {Error} If the session is already finished
   */
  reset(): Session {
    if (this.isFinished) {
      throw ErrorCatalog.createError('SESSION_ALREADY_FINISHED', { detail: 'Cannot reset a finished session' });
    }

    const initialSeries = Series.create(1, this.currentSeries?.maxShots ?? 10);

    return new Session(
      this.id,
      this.discipline,
      this.mode,
      [initialSeries],
      [],
      this.startedAt,
      this.finishedAt,
      this.scoringMode,
    );
  }

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

  /** Compares session IDs. */
  equals(other: Session): boolean {
    return this.id === other.id;
  }

  static create(discipline: Discipline, scoringMode: 'RING' | 'DECIMAL' = 'DECIMAL'): Session {
    const id = crypto.randomUUID();
    const mode = Mode.sighting(); // Default is sighting mode
    const initialSeries = Series.create(1); // Create the first series
    const allShots: Shot[] = [];
    const startedAt = new Date();
    const finishedAt = null;

    return new Session(id, discipline, mode, [initialSeries], allShots, startedAt, finishedAt, scoringMode);
  }

  /** Restores domain objects. Use SessionFactory.fromStorageData() for serialized data. */
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
