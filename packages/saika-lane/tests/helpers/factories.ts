// SPDX-License-Identifier: MIT
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Series } from '@/main/modules/session/domain/Series';
import { Session } from '@/main/modules/session/domain/Session';
import { Shot } from '@/main/modules/session/domain/Shot';

// ---------------------------------------------------------------------------
// Value Objects
// ---------------------------------------------------------------------------

export function buildImpactPoint(overrides?: Partial<{ x: number; y: number }>): ImpactPoint {
  return new ImpactPoint(overrides?.x ?? 1.5, overrides?.y ?? -2.3);
}

export function buildScore(value?: number): Score {
  return new Score(value ?? 98);
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export function buildShot(
  overrides?: Partial<{
    impactPoint: ImpactPoint | null;
    score: Score;
    mode: Mode;
    timestamp: Date;
    shotNumber: number;
    seriesNumber: number;
    innerTen: boolean;
    deviceScore: Score;
  }>,
): Shot {
  return Shot.create({
    impactPoint: overrides?.impactPoint ?? buildImpactPoint(),
    score: overrides?.score ?? buildScore(),
    mode: overrides?.mode ?? Mode.match(),
    timestamp: overrides?.timestamp ?? new Date('2026-01-15T10:00:00Z'),
    shotNumber: overrides?.shotNumber ?? 1,
    seriesNumber: overrides?.seriesNumber ?? 1,
    innerTen: overrides?.innerTen ?? false,
    deviceScore: overrides?.deviceScore,
  });
}

export function buildSeries(
  overrides?: Partial<{
    seriesNumber: number;
    maxShots: number;
  }>,
): Series {
  return Series.create(overrides?.seriesNumber ?? 1, overrides?.maxShots ?? 10);
}

export function buildSession(
  overrides?: Partial<{
    discipline: Discipline;
  }>,
): Session {
  return Session.create(overrides?.discipline ?? Discipline.airRifle10m());
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

type CompetitionStateProps = Parameters<typeof CompetitionState.reconstruct>[0];

/** A new (IDLE) BR60S competition `comp-1` on `session-1`; overrides replace stored fields. */
export function buildCompetitionState(overrides?: Partial<CompetitionStateProps>): CompetitionState {
  const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
  return overrides ? CompetitionState.reconstruct({ ...state, ...overrides }) : state;
}
