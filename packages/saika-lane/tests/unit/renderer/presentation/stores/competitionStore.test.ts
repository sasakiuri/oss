// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { isSameCompetitionPosition, useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';

describe('competitionStore', () => {
  beforeEach(() => {
    useCompetitionStore.getState().resetCompetition();
  });

  describe('initial state', () => {
    it('phase is IDLE', () => {
      const { phase } = useCompetitionStore.getState();
      expect(phase).toBe('IDLE');
    });

    it('stageIndex is 0', () => {
      const { stageIndex } = useCompetitionStore.getState();
      expect(stageIndex).toBe(0);
    });

    it('seriesIndex is 0', () => {
      const { seriesIndex } = useCompetitionStore.getState();
      expect(seriesIndex).toBe(0);
    });

    it('scored is false', () => {
      const { scored } = useCompetitionStore.getState();
      expect(scored).toBe(false);
    });

    it('remainingSeconds is 0', () => {
      const { remainingSeconds } = useCompetitionStore.getState();
      expect(remainingSeconds).toBe(0);
    });

    it('totalSeconds is 0', () => {
      const { totalSeconds } = useCompetitionStore.getState();
      expect(totalSeconds).toBe(0);
    });

    it('isTimerExpired is false', () => {
      const { isTimerExpired } = useCompetitionStore.getState();
      expect(isTimerExpired).toBe(false);
    });

    it('shotsPerSeries is 10', () => {
      const { shotsPerSeries } = useCompetitionStore.getState();
      expect(shotsPerSeries).toBe(10);
    });

    it('has no interruption', () => {
      expect(useCompetitionStore.getState().interruption).toBeNull();
    });
  });

  describe('updateTimer', () => {
    it('updates remaining and total', () => {
      const { updateTimer } = useCompetitionStore.getState();

      updateTimer(180, 300);

      const state = useCompetitionStore.getState();
      expect(state.remainingSeconds).toBe(180);
      expect(state.totalSeconds).toBe(300);
    });

    it('can update timer to 0', () => {
      const { updateTimer } = useCompetitionStore.getState();

      updateTimer(180, 300);
      updateTimer(0, 300);

      const state = useCompetitionStore.getState();
      expect(state.remainingSeconds).toBe(0);
    });

    it('phase is not changed when timer is updated', () => {
      const { applyPhaseChange, updateTimer } = useCompetitionStore.getState();

      applyPhaseChange('ACTIVE', 1, 2, true);
      updateTimer(60, 300);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('ACTIVE');
      expect(state.stageIndex).toBe(1);
      expect(state.seriesIndex).toBe(2);
    });
  });

  describe('setTimerExpired', () => {
    it('can set timer expired state to true', () => {
      const { setTimerExpired } = useCompetitionStore.getState();

      setTimerExpired(true);

      const { isTimerExpired } = useCompetitionStore.getState();
      expect(isTimerExpired).toBe(true);
    });

    it('can set timer expired state to false', () => {
      const { setTimerExpired } = useCompetitionStore.getState();

      setTimerExpired(true);
      setTimerExpired(false);

      const { isTimerExpired } = useCompetitionStore.getState();
      expect(isTimerExpired).toBe(false);
    });
  });

  describe('advanceSeries', () => {
    it('updates seriesIndex', () => {
      const { advanceSeries } = useCompetitionStore.getState();

      advanceSeries(3);

      const { seriesIndex } = useCompetitionStore.getState();
      expect(seriesIndex).toBe(3);
    });

    it('can reset seriesIndex to 0', () => {
      const { advanceSeries } = useCompetitionStore.getState();

      advanceSeries(5);
      advanceSeries(0);

      const { seriesIndex } = useCompetitionStore.getState();
      expect(seriesIndex).toBe(0);
    });
  });

  describe('setShotsPerSeries', () => {
    it('updates shotsPerSeries', () => {
      const { setShotsPerSeries } = useCompetitionStore.getState();

      setShotsPerSeries(5);

      const { shotsPerSeries } = useCompetitionStore.getState();
      expect(shotsPerSeries).toBe(5);
    });

    it('can change from default value (10) and revert', () => {
      const { setShotsPerSeries } = useCompetitionStore.getState();

      setShotsPerSeries(5);
      setShotsPerSeries(10);

      const { shotsPerSeries } = useCompetitionStore.getState();
      expect(shotsPerSeries).toBe(10);
    });
  });

  describe('resetCompetition', () => {
    it('resets all fields to initial values', () => {
      const { applyPhaseChange, updateTimer, setTimerExpired, setShotsPerSeries, resetCompetition } =
        useCompetitionStore.getState();

      applyPhaseChange('ACTIVE', 2, 3, true);
      updateTimer(120, 300);
      setTimerExpired(true);
      setShotsPerSeries(5);

      resetCompetition();

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('IDLE');
      expect(state.stageIndex).toBe(0);
      expect(state.seriesIndex).toBe(0);
      expect(state.scored).toBe(false);
      expect(state.remainingSeconds).toBe(0);
      expect(state.totalSeconds).toBe(0);
      expect(state.isTimerExpired).toBe(false);
      expect(state.shotsPerSeries).toBe(10);
    });

    it('can reset multiple times without issues', () => {
      const { resetCompetition } = useCompetitionStore.getState();

      resetCompetition();
      resetCompetition();
      resetCompetition();

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('IDLE');
      expect(state.shotsPerSeries).toBe(10);
    });
  });

  describe('applyPhaseChange', () => {
    it('updates the position and clears isTimerExpired for ACTIVE phase', () => {
      const { applyPhaseChange, setTimerExpired } = useCompetitionStore.getState();

      // Set expired to true beforehand
      setTimerExpired(true);

      applyPhaseChange('ACTIVE', 1, 2, true);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('ACTIVE');
      expect(state.stageIndex).toBe(1);
      expect(state.seriesIndex).toBe(2);
      expect(state.scored).toBe(true);
      expect(state.isTimerExpired).toBe(false);
    });

    it('keeps isTimerExpired for non-ACTIVE phase', () => {
      const { applyPhaseChange, setTimerExpired } = useCompetitionStore.getState();

      // Set expired to true beforehand
      setTimerExpired(true);

      applyPhaseChange('SERIES_COMPLETE', 0, 3, true);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('SERIES_COMPLETE');
      expect(state.stageIndex).toBe(0);
      expect(state.seriesIndex).toBe(3);
      expect(state.scored).toBe(true);
      // isTimerExpired is not changed during non-ACTIVE phase
      expect(state.isTimerExpired).toBe(true);
    });

    it('can set FINISHED phase', () => {
      const { applyPhaseChange } = useCompetitionStore.getState();

      applyPhaseChange('FINISHED', 0, 0, false);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('FINISHED');
      expect(state.scored).toBe(false);
    });

    it('keeps the timer values', () => {
      const { applyPhaseChange, updateTimer } = useCompetitionStore.getState();

      updateTimer(120, 300);
      applyPhaseChange('ACTIVE', 0, 0, true);

      const state = useCompetitionStore.getState();
      expect(state.remainingSeconds).toBe(120);
      expect(state.totalSeconds).toBe(300);
    });
  });

  describe('integration scenarios', () => {
    it('competition start -> stage advance -> series advance -> reset flow works correctly', () => {
      const { applyPhaseChange, advanceSeries, updateTimer, resetCompetition } = useCompetitionStore.getState();

      applyPhaseChange('ACTIVE', 0, 0, false);
      updateTimer(600, 600);

      let state = useCompetitionStore.getState();
      expect(state.phase).toBe('ACTIVE');

      applyPhaseChange('STAGE_ENTERED', 1, 0, true);
      updateTimer(900, 900);

      state = useCompetitionStore.getState();
      expect(state.stageIndex).toBe(1);
      expect(state.scored).toBe(true);
      expect(state.seriesIndex).toBe(0);

      advanceSeries(1);
      state = useCompetitionStore.getState();
      expect(state.seriesIndex).toBe(1);

      advanceSeries(2);
      state = useCompetitionStore.getState();
      expect(state.seriesIndex).toBe(2);

      resetCompetition();

      state = useCompetitionStore.getState();
      expect(state.phase).toBe('IDLE');
      expect(state.stageIndex).toBe(0);
      expect(state.seriesIndex).toBe(0);
      expect(state.remainingSeconds).toBe(0);
    });
  });
});

describe('isSameCompetitionPosition', () => {
  const position = { competitionId: 'comp-1', phase: 'ACTIVE', stageIndex: 1, seriesIndex: 2 };

  it('compares the competition, phase, stage and series only', () => {
    expect(isSameCompetitionPosition(position, { ...position, scored: true } as typeof position)).toBe(true);
    expect(isSameCompetitionPosition(position, { ...position, competitionId: 'comp-2' })).toBe(false);
    expect(isSameCompetitionPosition(position, { ...position, phase: 'SERIES_COMPLETE' })).toBe(false);
    expect(isSameCompetitionPosition(position, { ...position, stageIndex: 2 })).toBe(false);
    expect(isSameCompetitionPosition(position, { ...position, seriesIndex: 3 })).toBe(false);
  });
});
