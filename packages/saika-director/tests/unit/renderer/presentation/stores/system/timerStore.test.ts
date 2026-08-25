import { describe, it, expect, beforeEach } from 'vitest';
import { useTimerStore } from '@/renderer/presentation/stores/system/timer.store';

describe('useTimerStore', () => {
  beforeEach(() => {
    useTimerStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have remainingTime as 0', () => {
      expect(useTimerStore.getState().remainingTime).toBe(0);
    });

    it('should have phase as IDLE', () => {
      expect(useTimerStore.getState().phase).toBe('IDLE');
    });

    it('should have isRunning as false', () => {
      expect(useTimerStore.getState().isRunning).toBe(false);
    });
  });

  describe('setTimer', () => {
    it('should set remaining time and phase', () => {
      useTimerStore.getState().setTimer(120, 'ACTIVE');

      const state = useTimerStore.getState();
      expect(state.remainingTime).toBe(120);
      expect(state.phase).toBe('ACTIVE');
    });

    it('should set isRunning to true when time > 0', () => {
      useTimerStore.getState().setTimer(60, 'SERIES_COMPLETE');

      expect(useTimerStore.getState().isRunning).toBe(true);
    });

    it('should set isRunning to false when time is 0', () => {
      useTimerStore.getState().setTimer(60, 'ACTIVE');
      useTimerStore.getState().setTimer(0, 'ACTIVE');

      expect(useTimerStore.getState().isRunning).toBe(false);
    });

    it('should handle SERIES_COMPLETE phase', () => {
      useTimerStore.getState().setTimer(300, 'SERIES_COMPLETE');

      const state = useTimerStore.getState();
      expect(state.phase).toBe('SERIES_COMPLETE');
      expect(state.remainingTime).toBe(300);
      expect(state.isRunning).toBe(true);
    });

    it('should handle FINISHED phase', () => {
      useTimerStore.getState().setTimer(0, 'FINISHED');

      const state = useTimerStore.getState();
      expect(state.phase).toBe('FINISHED');
      expect(state.remainingTime).toBe(0);
      expect(state.isRunning).toBe(false);
    });
  });

  describe('setExpired', () => {
    it('should set time to 0 and stop running', () => {
      useTimerStore.getState().setTimer(60, 'ACTIVE');
      useTimerStore.getState().setExpired('FINISHED');

      const state = useTimerStore.getState();
      expect(state.remainingTime).toBe(0);
      expect(state.phase).toBe('FINISHED');
      expect(state.isRunning).toBe(false);
    });

    it('should update phase', () => {
      useTimerStore.getState().setExpired('ACTIVE');

      expect(useTimerStore.getState().phase).toBe('ACTIVE');
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      useTimerStore.getState().setTimer(120, 'ACTIVE');

      useTimerStore.getState().reset();

      const state = useTimerStore.getState();
      expect(state.remainingTime).toBe(0);
      expect(state.phase).toBe('IDLE');
      expect(state.isRunning).toBe(false);
    });
  });
});
