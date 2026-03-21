// SPDX-License-Identifier: MIT
/**
 * SessionFactory — factory for reconstructing a Session from storage data
 *
 * Session.create() is responsible for creating new sessions,
 * while SessionFactory.fromStorageData() is responsible for restoring from persisted data.
 */

import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import { Discipline } from './Discipline';
import { ImpactPoint } from './ImpactPoint';
import { Mode } from './Mode';
import { Score } from './Score';
import { Series } from './Series';
import { Session } from './Session';
import { Shot } from './Shot';

/**
 * Type definition for session data persisted to storage
 */
export interface SessionStorageData {
  id: string;
  discipline: string;
  mode: string;
  series: Array<{
    seriesNumber: number;
    totalScore: number;
    maxShots?: number;
  }>;
  allShots: Array<{
    id: string;
    shotNumber: number;
    impactPoint: {
      x: number;
      y: number;
    } | null;
    score: number;
    innerTen: boolean;
    timestamp: string;
    seriesNumber: number;
    mode: string;
    deviceScore?: number;
  }>;
  startedAt: string;
  finishedAt: string | null;
  /** Scoring mode (treated as DECIMAL if omitted) */
  scoringMode?: 'RING' | 'DECIMAL';
}

export class SessionFactory {
  /**
   * Reconstructs a Session from storage data
   *
   * @param data - Serialized data retrieved from storage
   * @returns Reconstructed Session instance
   * @throws {Error} If the data is invalid
   */
  static fromStorageData(data: SessionStorageData): Session {
    // Reconstruct Discipline
    const discipline = Discipline.fromValue(data.discipline);

    // Reconstruct Mode
    const mode = Mode.fromValue(data.mode);

    // Reconstruct Series (recalculated from Shots)
    const reconstructedSeries: Series[] = [];
    for (const seriesData of data.series) {
      const seriesShots = data.allShots
        .filter((shot) => shot.seriesNumber === seriesData.seriesNumber && shot.mode === 'MATCH')
        .sort((a, b) => a.shotNumber - b.shotNumber);

      let series = Series.create(seriesData.seriesNumber, seriesData.maxShots ?? 10);
      for (const shotData of seriesShots) {
        series = series.addScore(new Score(shotData.score));
      }
      reconstructedSeries.push(series);
    }

    // Invariant guarantee: if series is empty
    if (reconstructedSeries.length === 0) {
      // Match shots exist but series is empty → data corruption
      const hasMatchShots = data.allShots.some((shot) => shot.mode === 'MATCH');
      if (hasMatchShots) {
        throw ErrorCatalog.createError('INVALID_SESSION_STATE', {
          detail: 'Series is empty but match shots exist. Data may be corrupted.',
        });
      }
      // Sighting only or no shots → supplement with initial series
      reconstructedSeries.push(Series.create(1));
    }

    // Reconstruct Shots
    const allShots = data.allShots.map((shotData) => {
      const impactPoint =
        shotData.impactPoint !== null ? new ImpactPoint(shotData.impactPoint.x, shotData.impactPoint.y) : null;
      const score = new Score(shotData.score);
      const shotMode = Mode.fromValue(shotData.mode);
      const timestamp = new Date(shotData.timestamp);
      const deviceScore = shotData.deviceScore !== undefined ? new Score(shotData.deviceScore) : undefined;

      return Shot.reconstruct({
        id: shotData.id,
        impactPoint,
        score,
        mode: shotMode,
        timestamp,
        shotNumber: shotData.shotNumber,
        seriesNumber: shotData.seriesNumber,
        innerTen: shotData.innerTen,
        deviceScore,
      });
    });

    // Reconstruct dates
    const startedAt = new Date(data.startedAt);
    const finishedAt = data.finishedAt ? new Date(data.finishedAt) : null;

    return Session.reconstruct({
      id: data.id,
      discipline,
      mode,
      series: reconstructedSeries,
      allShots,
      startedAt,
      finishedAt,
      scoringMode: data.scoringMode ?? 'DECIMAL',
    });
  }
}
