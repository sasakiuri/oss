// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';

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

    it('currentStageName is empty string', () => {
      const { currentStageName } = useCompetitionStore.getState();
      expect(currentStageName).toBe('');
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

    it('isTimerRunning is false', () => {
      const { isTimerRunning } = useCompetitionStore.getState();
      expect(isTimerRunning).toBe(false);
    });

    it('isTimerExpired is false', () => {
      const { isTimerExpired } = useCompetitionStore.getState();
      expect(isTimerExpired).toBe(false);
    });

    it('shotsPerSeries is 10', () => {
      const { shotsPerSeries } = useCompetitionStore.getState();
      expect(shotsPerSeries).toBe(10);
    });
  });

  describe('setPhase', () => {
    it('updates phase, stageIndex, seriesIndex, currentStageName, scored', () => {
      const { setPhase } = useCompetitionStore.getState();

      setPhase('ACTIVE', 1, 2, 'Qualification', true);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('ACTIVE');
      expect(state.stageIndex).toBe(1);
      expect(state.seriesIndex).toBe(2);
      expect(state.currentStageName).toBe('Qualification');
      expect(state.scored).toBe(true);
    });

    it('sets scored to false', () => {
      const { setPhase } = useCompetitionStore.getState();

      setPhase('ACTIVE', 0, 0, 'Preparation', false);

      const state = useCompetitionStore.getState();
      expect(state.scored).toBe(false);
    });

    it('can set to FINISHED phase', () => {
      const { setPhase } = useCompetitionStore.getState();

      setPhase('FINISHED', 0, 0, '', false);

      const { phase } = useCompetitionStore.getState();
      expect(phase).toBe('FINISHED');
    });

    it('can set to SERIES_COMPLETE phase', () => {
      const { setPhase } = useCompetitionStore.getState();

      setPhase('SERIES_COMPLETE', 0, 3, 'Match', true);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('SERIES_COMPLETE');
      expect(state.seriesIndex).toBe(3);
    });

    it('can set to SERIES_ENTERED phase', () => {
      const { setPhase } = useCompetitionStore.getState();

      setPhase('SERIES_ENTERED', 1, 2, 'Match', true);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('SERIES_ENTERED');
      expect(state.stageIndex).toBe(1);
      expect(state.seriesIndex).toBe(2);
      expect(state.currentStageName).toBe('Match');
    });

    it('can set to STAGE_ENTERED phase', () => {
      const { setPhase } = useCompetitionStore.getState();

      setPhase('STAGE_ENTERED', 2, 0, 'Final', true);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('STAGE_ENTERED');
      expect(state.stageIndex).toBe(2);
      expect(state.currentStageName).toBe('Final');
    });

    it('timer state is not changed when phase is set', () => {
      const { setPhase, updateTimer, setTimerRunning } = useCompetitionStore.getState();

      updateTimer(120, 300);
      setTimerRunning(true);
      setPhase('ACTIVE', 0, 0, 'Qualification', true);

      const state = useCompetitionStore.getState();
      expect(state.remainingSeconds).toBe(120);
      expect(state.totalSeconds).toBe(300);
      expect(state.isTimerRunning).toBe(true);
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
      const { setPhase, updateTimer } = useCompetitionStore.getState();

      setPhase('ACTIVE', 1, 2, 'Match', true);
      updateTimer(60, 300);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('ACTIVE');
      expect(state.stageIndex).toBe(1);
      expect(state.seriesIndex).toBe(2);
    });
  });

  describe('setTimerRunning', () => {
    it('can set timer running state to true', () => {
      const { setTimerRunning } = useCompetitionStore.getState();

      setTimerRunning(true);

      const { isTimerRunning } = useCompetitionStore.getState();
      expect(isTimerRunning).toBe(true);
    });

    it('can set timer running state to false', () => {
      const { setTimerRunning } = useCompetitionStore.getState();

      setTimerRunning(true);
      setTimerRunning(false);

      const { isTimerRunning } = useCompetitionStore.getState();
      expect(isTimerRunning).toBe(false);
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

  describe('advanceStage', () => {
    it('updates stageIndex, currentStageName, scored and resets seriesIndex to 0', () => {
      const { advanceSeries, advanceStage } = useCompetitionStore.getState();

      advanceSeries(3);

      advanceStage(2, 'Final', true);

      const state = useCompetitionStore.getState();
      expect(state.stageIndex).toBe(2);
      expect(state.currentStageName).toBe('Final');
      expect(state.scored).toBe(true);
      expect(state.seriesIndex).toBe(0);
    });

    it('can advance to non-scored stage', () => {
      const { advanceStage } = useCompetitionStore.getState();

      advanceStage(0, 'Preparation', false);

      const state = useCompetitionStore.getState();
      expect(state.scored).toBe(false);
      expect(state.currentStageName).toBe('Preparation');
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
      const { setPhase, updateTimer, setTimerRunning, setTimerExpired, setShotsPerSeries, resetCompetition } =
        useCompetitionStore.getState();

      setPhase('ACTIVE', 2, 3, 'Final', true);
      updateTimer(120, 300);
      setTimerRunning(true);
      setTimerExpired(true);
      setShotsPerSeries(5);

      resetCompetition();

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('IDLE');
      expect(state.stageIndex).toBe(0);
      expect(state.seriesIndex).toBe(0);
      expect(state.currentStageName).toBe('');
      expect(state.scored).toBe(false);
      expect(state.remainingSeconds).toBe(0);
      expect(state.totalSeconds).toBe(0);
      expect(state.isTimerRunning).toBe(false);
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
    it('sets isTimerRunning=true and isTimerExpired=false in batch for ACTIVE phase', () => {
      const { applyPhaseChange, setTimerExpired } = useCompetitionStore.getState();

      // Set expired to true beforehand
      setTimerExpired(true);

      applyPhaseChange('ACTIVE', 1, 2, 'Qualification', true);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('ACTIVE');
      expect(state.stageIndex).toBe(1);
      expect(state.seriesIndex).toBe(2);
      expect(state.currentStageName).toBe('Qualification');
      expect(state.scored).toBe(true);
      expect(state.isTimerRunning).toBe(true);
      expect(state.isTimerExpired).toBe(false);
    });

    it('sets isTimerRunning=false for non-ACTIVE phase without changing isTimerExpired', () => {
      const { applyPhaseChange, setTimerExpired } = useCompetitionStore.getState();

      // Set expired to true beforehand
      setTimerExpired(true);

      applyPhaseChange('SERIES_COMPLETE', 0, 3, 'Match', true);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('SERIES_COMPLETE');
      expect(state.stageIndex).toBe(0);
      expect(state.seriesIndex).toBe(3);
      expect(state.currentStageName).toBe('Match');
      expect(state.scored).toBe(true);
      expect(state.isTimerRunning).toBe(false);
      // isTimerExpired is not changed during non-ACTIVE phase
      expect(state.isTimerExpired).toBe(true);
    });

    it('sets isTimerRunning=false for FINISHED phase', () => {
      const { applyPhaseChange, setTimerRunning } = useCompetitionStore.getState();

      // Set timer to running state beforehand
      setTimerRunning(true);

      applyPhaseChange('FINISHED', 0, 0, '', false);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('FINISHED');
      expect(state.isTimerRunning).toBe(false);
      expect(state.scored).toBe(false);
    });

    it('sets isTimerRunning=false for IDLE phase', () => {
      const { applyPhaseChange } = useCompetitionStore.getState();

      applyPhaseChange('IDLE', 0, 0, '', false);

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('IDLE');
      expect(state.isTimerRunning).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('competition start -> stage advance -> series advance -> reset flow works correctly', () => {
      const { setPhase, advanceStage, advanceSeries, updateTimer, setTimerRunning, resetCompetition } =
        useCompetitionStore.getState();

      setPhase('ACTIVE', 0, 0, 'Preparation', false);
      setTimerRunning(true);
      updateTimer(600, 600);

      let state = useCompetitionStore.getState();
      expect(state.phase).toBe('ACTIVE');
      expect(state.isTimerRunning).toBe(true);

      advanceStage(1, 'Qualification', true);
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
      expect(state.isTimerRunning).toBe(false);
      expect(state.remainingSeconds).toBe(0);
    });
  });
});
