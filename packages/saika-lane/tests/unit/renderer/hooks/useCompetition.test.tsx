// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompetition } from '@/renderer/presentation/hooks/useCompetition';
import { competitionService } from '@/renderer/services/competitionService';

// Mock service modules
vi.mock('@/renderer/services/competitionService', () => ({
  competitionService: {
    startCompetition: vi.fn(),
    startStage: vi.fn(),
    endStage: vi.fn(),
    startNextSeries: vi.fn(),
    advanceStage: vi.fn(),
    finishCompetition: vi.fn(),
    getCompetitionState: vi.fn(),
    getCompetitionTypes: vi.fn(),
  },
}));

const mockStartCompetition = vi.mocked(competitionService.startCompetition);
const mockStartStage = vi.mocked(competitionService.startStage);
const mockEndStage = vi.mocked(competitionService.endStage);
const mockStartNextSeries = vi.mocked(competitionService.startNextSeries);
const mockAdvanceStage = vi.mocked(competitionService.advanceStage);
const mockFinishCompetition = vi.mocked(competitionService.finishCompetition);

describe('useCompetition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('loading is false', () => {
      const { result } = renderHook(() => useCompetition());
      expect(result.current.loading).toBe(false);
    });

    it('error is null', () => {
      const { result } = renderHook(() => useCompetition());
      expect(result.current.error).toBeNull();
    });
  });

  describe('startCompetition', () => {
    it('succeeds in starting competition', async () => {
      mockStartCompetition.mockResolvedValue({
        competitionId: 'comp-123',
        sessionId: 'session-456',
      });

      const { result } = renderHook(() => useCompetition());

      let returnValue: { competitionId: string; sessionId: string } | undefined;
      await act(async () => {
        returnValue = await result.current.startCompetition('BR60S');
      });

      expect(mockStartCompetition).toHaveBeenCalledWith({ competitionTypeId: 'BR60S' });
      expect(returnValue).toEqual({ competitionId: 'comp-123', sessionId: 'session-456' });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets error state on competition start error', async () => {
      mockStartCompetition.mockRejectedValue(new Error('Failed to start competition'));

      const { result } = renderHook(() => useCompetition());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.startCompetition('BR60S');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to start competition');
      expect(result.current.error?.message).toBe('Failed to start competition');
      expect(result.current.loading).toBe(false);
    });

    it('wraps non-Error exceptions with the default message', async () => {
      mockStartCompetition.mockRejectedValue('string error');

      const { result } = renderHook(() => useCompetition());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.startCompetition('BR60S');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('An error occurred while starting the competition');
      expect(result.current.error?.message).toBe('An error occurred while starting the competition');
    });

    it('loading is true while starting competition', async () => {
      let resolveStart: (value: { competitionId: string; sessionId: string }) => void;
      const startPromise = new Promise<{ competitionId: string; sessionId: string }>((resolve) => {
        resolveStart = resolve;
      });

      mockStartCompetition.mockReturnValue(startPromise);

      const { result } = renderHook(() => useCompetition());

      act(() => {
        result.current.startCompetition('BR60S');
      });

      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveStart!({ competitionId: 'comp-123', sessionId: 'session-456' });
        await startPromise;
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('startStage', () => {
    it('succeeds in starting stage', async () => {
      mockStartStage.mockResolvedValue({ sessionId: 'sess-new' });

      const { result } = renderHook(() => useCompetition());

      await act(async () => {
        await result.current.startStage('comp-123');
      });

      expect(mockStartStage).toHaveBeenCalledWith({ competitionId: 'comp-123' });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets error state on stage start error', async () => {
      mockStartStage.mockRejectedValue(new Error('Failed to start stage'));

      const { result } = renderHook(() => useCompetition());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.startStage('comp-123');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to start stage');
      expect(result.current.error?.message).toBe('Failed to start stage');
    });
  });

  describe('endStage', () => {
    it('succeeds in ending stage', async () => {
      mockEndStage.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCompetition());

      await act(async () => {
        await result.current.endStage('comp-123');
      });

      expect(mockEndStage).toHaveBeenCalledWith({ competitionId: 'comp-123' });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets error state on end stage error', async () => {
      mockEndStage.mockRejectedValue(new Error('Failed to end stage'));

      const { result } = renderHook(() => useCompetition());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.endStage('comp-123');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to end stage');
      expect(result.current.error?.message).toBe('Failed to end stage');
    });
  });

  describe('startNextSeries', () => {
    it('succeeds in starting next series', async () => {
      mockStartNextSeries.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCompetition());

      await act(async () => {
        await result.current.startNextSeries('comp-123');
      });

      expect(mockStartNextSeries).toHaveBeenCalledWith({ competitionId: 'comp-123' });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets error state on start next series error', async () => {
      mockStartNextSeries.mockRejectedValue(new Error('Failed to start next series'));

      const { result } = renderHook(() => useCompetition());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.startNextSeries('comp-123');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to start next series');
      expect(result.current.error?.message).toBe('Failed to start next series');
    });
  });

  describe('advanceStage', () => {
    it('succeeds in advancing stage', async () => {
      mockAdvanceStage.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCompetition());

      await act(async () => {
        await result.current.advanceStage('comp-123');
      });

      expect(mockAdvanceStage).toHaveBeenCalledWith({ competitionId: 'comp-123' });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets error state on advance stage error', async () => {
      mockAdvanceStage.mockRejectedValue(new Error('Failed to advance stage'));

      const { result } = renderHook(() => useCompetition());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.advanceStage('comp-123');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to advance stage');
      expect(result.current.error?.message).toBe('Failed to advance stage');
    });
  });

  describe('finishCompetition', () => {
    it('succeeds in finishing competition', async () => {
      mockFinishCompetition.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCompetition());

      await act(async () => {
        await result.current.finishCompetition('comp-123');
      });

      expect(mockFinishCompetition).toHaveBeenCalledWith({ competitionId: 'comp-123' });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('sets error state on finish competition error', async () => {
      mockFinishCompetition.mockRejectedValue(new Error('Failed to finish competition'));

      const { result } = renderHook(() => useCompetition());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.finishCompetition('comp-123');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to finish competition');
      expect(result.current.error?.message).toBe('Failed to finish competition');
    });
  });

  describe('integration scenarios', () => {
    it('can retry after an error occurs', async () => {
      mockStartCompetition
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ competitionId: 'comp-retry', sessionId: 'session-retry' });

      const { result } = renderHook(() => useCompetition());

      // First call fails
      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.startCompetition('BR60S');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Temporary error');
      expect(result.current.error?.message).toBe('Temporary error');

      // Retry succeeds
      await act(async () => {
        await result.current.startCompetition('BR60S');
      });

      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it('full scenario: start competition → start stage → start series → advance stage → finish', async () => {
      mockStartCompetition.mockResolvedValue({
        competitionId: 'comp-full',
        sessionId: 'session-full',
      });
      mockStartStage.mockResolvedValue({ sessionId: 'sess-prep' });
      mockStartNextSeries.mockResolvedValue(undefined);
      mockAdvanceStage.mockResolvedValue(undefined);
      mockFinishCompetition.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCompetition());

      // Start competition
      await act(async () => {
        await result.current.startCompetition('BR60S');
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();

      // Start stage
      await act(async () => {
        await result.current.startStage('comp-full');
      });
      expect(result.current.loading).toBe(false);

      // Start series
      await act(async () => {
        await result.current.startNextSeries('comp-full');
      });
      expect(result.current.loading).toBe(false);

      // Advance stage
      await act(async () => {
        await result.current.advanceStage('comp-full');
      });
      expect(result.current.loading).toBe(false);

      // Finish competition
      await act(async () => {
        await result.current.finishCompetition('comp-full');
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});
