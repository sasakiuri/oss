// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { findAdvanceSeriesSource } from '@/renderer/presentation/features/competition-control/progressPlanning';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';

function lane(
  laneId: string,
  phase: NonNullable<DirectorLaneSnapshotDto['competitionState']>['phase'],
  seriesIndex: number,
  totalSeries = 6,
  awaitingSeriesStart = false,
): DirectorLaneSnapshotDto {
  return {
    laneId,
    laneAlias: laneId,
    firingPointNumber: 1,
    hardware: null,
    competitionState: {
      competitionId: COMPETITION_ID,
      laneId,
      sessionId: '22222222-2222-4222-8222-222222222222',
      phase,
      currentStage: { index: 1, name: 'Match', scored: true, totalSeries },
      currentSeries: { index: seriesIndex, shotsRecorded: 10, maxShots: 10 },
      awaitingSeriesStart,
      publishedAt: '2026-08-26T00:00:00.000Z',
    },
    assignment: null,
    score: null,
    lastRawShot: null,
    lastCompetitionShot: null,
    lastSeenAt: '2026-08-26T00:00:00.000Z',
  };
}

describe('findAdvanceSeriesSource', () => {
  it('uses the completed series shared by synchronized Lanes', () => {
    expect(
      findAdvanceSeriesSource(
        [
          lane('33333333-3333-4333-8333-333333333333', 'SERIES_COMPLETE', 2),
          lane('44444444-4444-4444-8444-444444444444', 'SERIES_COMPLETE', 2),
        ],
        COMPETITION_ID,
      ),
    ).toEqual({ stageIndex: 1, fromSeriesIndex: 2 });
  });

  it('selects the oldest completed series after a partial broadcast', () => {
    expect(
      findAdvanceSeriesSource(
        [
          lane('33333333-3333-4333-8333-333333333333', 'SERIES_COMPLETE', 1),
          lane('44444444-4444-4444-8444-444444444444', 'MATCH', 2),
          lane('55555555-5555-4555-8555-555555555555', 'SERIES_COMPLETE', 2, 6, true),
        ],
        COMPETITION_ID,
      ),
    ).toEqual({ stageIndex: 1, fromSeriesIndex: 1 });
  });

  it('does not offer an advance after the final series', () => {
    expect(
      findAdvanceSeriesSource([lane('33333333-3333-4333-8333-333333333333', 'SERIES_COMPLETE', 5)], COMPETITION_ID),
    ).toBeNull();
  });

  it('resumes a persisted destination that is still waiting to start', () => {
    expect(
      findAdvanceSeriesSource(
        [lane('33333333-3333-4333-8333-333333333333', 'SERIES_COMPLETE', 5, 6, true)],
        COMPETITION_ID,
      ),
    ).toEqual({ stageIndex: 1, fromSeriesIndex: 5, resumeOnly: true });
  });

  it('prioritizes resuming when another Lane already completed the same destination', () => {
    expect(
      findAdvanceSeriesSource(
        [
          lane('33333333-3333-4333-8333-333333333333', 'SERIES_COMPLETE', 2),
          lane('44444444-4444-4444-8444-444444444444', 'SERIES_COMPLETE', 2, 6, true),
        ],
        COMPETITION_ID,
      ),
    ).toEqual({ stageIndex: 1, fromSeriesIndex: 2, resumeOnly: true });
  });
});
