// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { P25 } from '@/main/modules/competition/domain/competitionTypes';
import {
  assertBoundToInterruptedSeries,
  type InterruptedSeriesBinding,
} from '@/main/modules/qualification-recovery/domain/QualificationRecoveryPlacement';

const WORDING = { decision: 'recovery authorization', expectedBy: 'recovery', action: 'adjudicated' };

/** A 25m Pistol competition entered into its first Match precision series. */
function enteredPrecisionSeries(sessionId = 'session-1'): CompetitionState {
  return CompetitionState.create('comp-1', sessionId, P25.config).startStage().expireTimer().advanceToNextStage();
}

/** The same competition two shots into that series. */
function interruptedPrecisionSeries(sessionId?: string): CompetitionState {
  return enteredPrecisionSeries(sessionId).startNextSeries().recordShotInSeries().recordShotInSeries();
}

function binding(overrides: Partial<InterruptedSeriesBinding> = {}): InterruptedSeriesBinding {
  return {
    competitionId: 'comp-1',
    stageIndex: 1,
    seriesIndex: 0,
    expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
    expectedSeriesShotLimit: 5,
    expectedRecordedShots: 2,
    ...overrides,
  };
}

describe('assertBoundToInterruptedSeries', () => {
  it('accepts a competition still at the interrupted series in the expected state', () => {
    expect(() => assertBoundToInterruptedSeries(interruptedPrecisionSeries(), binding(), WORDING)).not.toThrow();
  });

  it('accepts the interrupted series after it completed', () => {
    const completed = interruptedPrecisionSeries().expireTimer();
    expect(completed.phase).toBe('SERIES_COMPLETE');

    expect(() => assertBoundToInterruptedSeries(completed, binding(), WORDING)).not.toThrow();
  });

  it('rejects a competition without a session', () => {
    expect(() => assertBoundToInterruptedSeries(interruptedPrecisionSeries(''), binding(), WORDING)).toThrow(
      'Qualification recovery competition has no session',
    );
  });

  it.each([
    ['another stage', { stageIndex: 0 }],
    ['another series', { seriesIndex: 1 }],
  ])('rejects a competition that moved to %s', (_, position) => {
    expect(() => assertBoundToInterruptedSeries(interruptedPrecisionSeries(), binding(position), WORDING)).toThrow(
      'Competition comp-1 has moved away from the interrupted series',
    );
  });

  it('rejects a series that no longer runs the decided timed program', () => {
    expect(() =>
      assertBoundToInterruptedSeries(
        interruptedPrecisionSeries(),
        binding({ expectedMatchProgramId: 'P25_MATCH_RAPID_3_7' }),
        WORDING,
      ),
    ).toThrow('Competition comp-1 no longer uses P25_MATCH_RAPID_3_7');
  });

  it('names the decision whose series shot limit no longer matches', () => {
    expect(() =>
      assertBoundToInterruptedSeries(interruptedPrecisionSeries(), binding({ expectedSeriesShotLimit: 10 }), WORDING),
    ).toThrow('The current series shot limit no longer matches the recovery authorization');
  });

  it('reports the recorded and expected shot counts when they differ', () => {
    expect(() =>
      assertBoundToInterruptedSeries(interruptedPrecisionSeries(), binding({ expectedRecordedShots: 3 }), WORDING),
    ).toThrow('Competition has 2 recorded shot(s), but the recovery expects 3');
  });

  it('rejects a series that has not started yet', () => {
    const entered = enteredPrecisionSeries();

    expect(() => assertBoundToInterruptedSeries(entered, binding({ expectedRecordedShots: 0 }), WORDING)).toThrow(
      `Competition comp-1 cannot be adjudicated from phase ${entered.phase}`,
    );
  });
});
