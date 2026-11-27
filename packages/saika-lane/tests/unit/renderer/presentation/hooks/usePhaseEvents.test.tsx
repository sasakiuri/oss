// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePhaseEvents } from '@/renderer/presentation/hooks/usePhaseEvents';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type { PhaseChangedEventPayload, ShotDto } from '@/shared/ipc/contracts';

import { emit, installMockElectronAPI, type MockedElectronAPI } from '../../../../helpers/mockElectronAPI';

function competitionStarted(acc: 'RING' | 'DECIMAL') {
  return {
    competitionId: 'competition-1',
    competitionTypeId: 'AR60',
    sessionId: 'session-1',
    config: {},
    shotsPerSeries: 10,
    acc,
  };
}

describe('usePhaseEvents', () => {
  let api: MockedElectronAPI;

  beforeEach(() => {
    useCompetitionStore.getState().resetCompetition();
    useSessionStore.getState().resetSession();
    api = installMockElectronAPI();
  });

  describe('event subscription registration', () => {
    it('registers required event listeners on mount', () => {
      renderHook(() => usePhaseEvents());

      expect(api.on.phaseChanged).toHaveBeenCalledTimes(1);
      expect(api.on.seriesCompleted).toHaveBeenCalledTimes(1);
      expect(api.on.competitionStarted).toHaveBeenCalledTimes(1);
      expect(api.on.competitionFinished).toHaveBeenCalledTimes(1);
    });

    it('unregisters all event listeners on unmount', () => {
      const unsubPhaseChanged = vi.fn();
      const unsubSeriesCompleted = vi.fn();
      const unsubCompetitionStarted = vi.fn();
      const unsubCompetitionFinished = vi.fn();

      api.on.phaseChanged.mockReturnValue(unsubPhaseChanged);
      api.on.seriesCompleted.mockReturnValue(unsubSeriesCompleted);
      api.on.competitionStarted.mockReturnValue(unsubCompetitionStarted);
      api.on.competitionFinished.mockReturnValue(unsubCompetitionFinished);

      const { unmount } = renderHook(() => usePhaseEvents());

      unmount();

      expect(unsubPhaseChanged).toHaveBeenCalledTimes(1);
      expect(unsubSeriesCompleted).toHaveBeenCalledTimes(1);
      expect(unsubCompetitionStarted).toHaveBeenCalledTimes(1);
      expect(unsubCompetitionFinished).toHaveBeenCalledTimes(1);
    });
  });

  describe('phaseChanged event', () => {
    it('tracks the current preparation separately from earlier shots across stage entry and start', () => {
      const shot: ShotDto = {
        id: 'shot-1',
        shotNumber: 1,
        x: 0,
        y: 0,
        score: 100,
        innerTen: false,
        timestamp: '2026-10-29T00:00:00Z',
        mode: 'SIGHTING',
        isRecorded: false,
      };
      useSessionStore.getState().addShot(shot);
      useCompetitionStore.getState().applyPhaseChange('SERIES_COMPLETE', 1, 0, true);
      renderHook(() => usePhaseEvents());
      const phase: PhaseChangedEventPayload = {
        previousPhase: 'SERIES_COMPLETE',
        newPhase: 'STAGE_ENTERED',
        stageIndex: 2,
        seriesIndex: 0,
        stageName: 'Preparation',
        scored: false,
      };
      emit('phaseChanged', phase);
      expect(useSessionStore.getState().currentSeriesStartIndex).toBe(1);
      emit('phaseChanged', { ...phase, previousPhase: 'STAGE_ENTERED', newPhase: 'ACTIVE' });
      useSessionStore.getState().addShot({ ...shot, id: 'shot-2', shotNumber: 2 });
      emit('phaseChanged', { ...phase, previousPhase: 'ACTIVE', newPhase: 'ACTIVE' });
      expect(useSessionStore.getState().currentSeriesStartIndex).toBe(1);
      expect(useSessionStore.getState().shots).toHaveLength(2);
    });

    it('starts preparation after IDLE without counting earlier practice shots', () => {
      useSessionStore.getState().addShot({
        id: 'shot-1',
        shotNumber: 1,
        x: 0,
        y: 0,
        score: 100,
        innerTen: false,
        timestamp: '2026-10-29T00:00:00Z',
        mode: 'SIGHTING',
        isRecorded: false,
      });
      renderHook(() => usePhaseEvents());
      emit('phaseChanged', {
        previousPhase: 'IDLE',
        newPhase: 'ACTIVE',
        stageIndex: 0,
        seriesIndex: 0,
        stageName: 'Preparation',
        scored: false,
      });
      expect(useSessionStore.getState().currentSeriesStartIndex).toBe(1);
      expect(useSessionStore.getState().shots).toHaveLength(1);
    });

    it('updates the store on phase change event', () => {
      renderHook(() => usePhaseEvents());

      emit('phaseChanged', {
        previousPhase: 'STAGE_ENTERED',
        newPhase: 'ACTIVE',
        stageIndex: 1,
        seriesIndex: 2,
        stageName: 'Qualification',
        scored: true,
      });

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('ACTIVE');
      expect(state.stageIndex).toBe(1);
      expect(state.seriesIndex).toBe(2);
      expect(state.scored).toBe(true);
    });

    it('clears the expired timer flag during ACTIVE phase', () => {
      useCompetitionStore.getState().setTimerExpired(true);
      renderHook(() => usePhaseEvents());

      emit('phaseChanged', {
        previousPhase: 'STAGE_ENTERED',
        newPhase: 'ACTIVE',
        stageIndex: 0,
        seriesIndex: 0,
        stageName: 'Match',
        scored: true,
      });

      expect(useCompetitionStore.getState().isTimerExpired).toBe(false);
    });

    it('correctly updates stageIndex/seriesIndex/scored via phaseChanged on stage advance', () => {
      renderHook(() => usePhaseEvents());

      // Stage advance: STAGE_ENTERED, new stageIndex=2, seriesIndex=0 reset
      emit('phaseChanged', {
        previousPhase: 'SERIES_COMPLETE',
        newPhase: 'STAGE_ENTERED',
        stageIndex: 2,
        seriesIndex: 0,
        stageName: 'Final',
        scored: true,
      });

      const state = useCompetitionStore.getState();
      expect(state.stageIndex).toBe(2);
      expect(state.scored).toBe(true);
      expect(state.seriesIndex).toBe(0);
    });
  });

  describe('seriesCompleted event', () => {
    it('advances seriesIndex on series completed event', () => {
      renderHook(() => usePhaseEvents());

      emit('seriesCompleted', { stageIndex: 0, seriesIndex: 2, shotCount: 10 });

      const state = useCompetitionStore.getState();
      // advanceSeries(data.seriesIndex + 1) so 2+1=3
      expect(state.seriesIndex).toBe(3);
    });
  });

  describe('competitionStarted event', () => {
    it('resets the store on competition started event', () => {
      // Set state in the store
      useCompetitionStore.getState().applyPhaseChange('ACTIVE', 2, 3, true);

      renderHook(() => usePhaseEvents());

      emit('competitionStarted', competitionStarted('DECIMAL'));

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('IDLE');
      expect(state.stageIndex).toBe(0);
      expect(state.seriesIndex).toBe(0);
      expect(state.shotsPerSeries).toBe(10);
    });

    it('acc: RING -> store is set to RING', () => {
      renderHook(() => usePhaseEvents());

      emit('competitionStarted', competitionStarted('RING'));

      const state = useCompetitionStore.getState();
      expect(state.acc).toBe('RING');
    });

    it('acc: DECIMAL -> store is set to DECIMAL', () => {
      renderHook(() => usePhaseEvents());

      emit('competitionStarted', competitionStarted('DECIMAL'));

      const state = useCompetitionStore.getState();
      expect(state.acc).toBe('DECIMAL');
    });

    it('calls setAcc on competitionStarted event', () => {
      renderHook(() => usePhaseEvents());

      emit('competitionStarted', competitionStarted('RING'));

      // Verify that acc is correctly set in the store
      expect(useCompetitionStore.getState().acc).toBe('RING');
    });
  });

  describe('competitionFinished event', () => {
    it('sets FINISHED phase on competition finished event', () => {
      useCompetitionStore.getState().applyPhaseChange('ACTIVE', 1, 5, true);

      renderHook(() => usePhaseEvents());

      emit('competitionFinished', { sessionId: 'session-1' });

      const state = useCompetitionStore.getState();
      expect(state.phase).toBe('FINISHED');
    });
  });
});
