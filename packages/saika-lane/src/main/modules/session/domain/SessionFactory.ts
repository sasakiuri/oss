// SPDX-License-Identifier: MIT
/** Restores persisted sessions; Session.create() creates new sessions. */

import type { ShotCompetitionContext } from '@/main/modules/session/domain/ShotCompetitionContext';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import type { ScoringGaugeProfileId, TargetScoringProfileId } from '@/shared/target';

import { Discipline } from './Discipline';
import { ImpactPoint } from './ImpactPoint';
import { Mode } from './Mode';
import { Score } from './Score';
import { Series } from './Series';
import { Session } from './Session';
import { Shot } from './Shot';

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
    calculatedScore?: number;
    receivedAt?: string;
    sourceObservationId?: string;
    targetProfileId?: TargetScoringProfileId;
    scoringGaugeProfileId?: ScoringGaugeProfileId;
    competitionContext?: ShotCompetitionContext;
  }>;
  startedAt: string;
  finishedAt: string | null;
  /** Scoring mode (treated as DECIMAL if omitted) */
  scoringMode?: 'RING' | 'DECIMAL';
}

export class SessionFactory {
  static fromStorageData(data: SessionStorageData): Session {
    const discipline = Discipline.fromValue(data.discipline);

    const mode = Mode.fromValue(data.mode);

    // Recalculate series totals from match shots rather than stored totals.
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

    if (reconstructedSeries.length === 0) {
      const hasMatchShots = data.allShots.some((shot) => shot.mode === 'MATCH');
      if (hasMatchShots) {
        throw ErrorCatalog.createError('INVALID_SESSION_STATE', {
          detail: 'Series is empty but match shots exist. Data may be corrupted.',
        });
      }
      // A session with no match shots still needs an initial series.
      reconstructedSeries.push(Series.create(1));
    }

    const allShots = data.allShots.map((shotData) => {
      const impactPoint =
        shotData.impactPoint !== null ? new ImpactPoint(shotData.impactPoint.x, shotData.impactPoint.y) : null;
      const score = new Score(shotData.score);
      const shotMode = Mode.fromValue(shotData.mode);
      const timestamp = new Date(shotData.timestamp);
      const deviceScore = shotData.deviceScore !== undefined ? new Score(shotData.deviceScore) : undefined;
      const calculatedScore =
        shotData.calculatedScore !== undefined ? new Score(shotData.calculatedScore) : new Score(shotData.score);

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
        calculatedScore,
        receivedAt: shotData.receivedAt ? new Date(shotData.receivedAt) : timestamp,
        sourceObservationId: shotData.sourceObservationId,
        targetProfileId: shotData.targetProfileId,
        scoringGaugeProfileId: shotData.scoringGaugeProfileId,
        competitionContext: shotData.competitionContext,
      });
    });

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
