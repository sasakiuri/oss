// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceError } from '@/renderer/services/createServiceMethod';

const mockStartSession = vi.fn();
const mockSwitchMode = vi.fn();
const mockResetSession = vi.fn();
const mockGetSessionScore = vi.fn();
const mockGetShotHistory = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    commands: {
      startSession: mockStartSession,
      switchMode: mockSwitchMode,
      resetSession: mockResetSession,
    },
    queries: {
      getSessionScore: mockGetSessionScore,
      getShotHistory: mockGetShotHistory,
    },
  },
});

// Import after window mock is set up
const { sessionService } = await import('@/renderer/services/sessionService');

describe('sessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startSession', () => {
    it('returns sessionId on success', async () => {
      mockStartSession.mockResolvedValue({
        success: true,
        data: { sessionId: 'session-123' },
      });

      const result = await sessionService.startSession({ discipline: 'AIR_RIFLE_10M' });

      expect(result).toEqual({ sessionId: 'session-123' });
      expect(mockStartSession).toHaveBeenCalledWith({ discipline: 'AIR_RIFLE_10M' });
    });

    it('throws ServiceError on failure', async () => {
      mockStartSession.mockResolvedValue({
        success: false,
        error: { code: 'SESSION_ERROR', message: 'Failed to start' },
      });

      await expect(sessionService.startSession({ discipline: 'AIR_RIFLE_10M' })).rejects.toThrow(ServiceError);

      try {
        await sessionService.startSession({ discipline: 'AIR_RIFLE_10M' });
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceError);
        expect((err as ServiceError).code).toBe('SESSION_ERROR');
        expect((err as ServiceError).message).toBe('Failed to start');
      }
    });

    it('failure without error object results in UNKNOWN code', async () => {
      mockStartSession.mockResolvedValue({ success: false });

      try {
        await sessionService.startSession({ discipline: 'AIR_PISTOL_10M' });
      } catch (err) {
        expect((err as ServiceError).code).toBe('UNKNOWN');
      }
    });

    it('IPC communication error is wrapped with IPC_ERROR code', async () => {
      mockStartSession.mockRejectedValue(new Error('IPC channel closed'));

      try {
        await sessionService.startSession({ discipline: 'AIR_RIFLE_10M' });
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceError);
        expect((err as ServiceError).code).toBe('IPC_ERROR');
        expect((err as ServiceError).message).toBe('IPC channel closed');
      }
    });

    it('non-Error reject is also wrapped with IPC_ERROR', async () => {
      mockStartSession.mockRejectedValue('string error');

      try {
        await sessionService.startSession({ discipline: 'AIR_RIFLE_10M' });
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceError);
        expect((err as ServiceError).code).toBe('IPC_ERROR');
        expect((err as ServiceError).message).toBe('string error');
      }
    });

    it('can be called with each discipline', async () => {
      mockStartSession.mockResolvedValue({
        success: true,
        data: { sessionId: 'id' },
      });

      for (const discipline of [
        'AIR_RIFLE_10M',
        'AIR_PISTOL_10M',
        'RIFLE_50M',
        'PISTOL_25M',
        'BEAM_RIFLE_10M',
        'BEAM_PISTOL_10M',
      ] as const) {
        await sessionService.startSession({ discipline });
        expect(mockStartSession).toHaveBeenCalledWith({ discipline });
      }
    });
  });

  describe('switchMode', () => {
    it('returns void on success', async () => {
      mockSwitchMode.mockResolvedValue({ success: true });

      await expect(sessionService.switchMode({ sessionId: 's1', mode: 'MATCH' })).resolves.toBeUndefined();

      expect(mockSwitchMode).toHaveBeenCalledWith({ sessionId: 's1', mode: 'MATCH' });
    });

    it('throws ServiceError on failure', async () => {
      mockSwitchMode.mockResolvedValue({
        success: false,
        error: { code: 'MODE_ERROR', message: 'Cannot switch' },
      });

      await expect(sessionService.switchMode({ sessionId: 's1', mode: 'SIGHTING' })).rejects.toThrow(ServiceError);
    });

    it('IPC error is wrapped with IPC_ERROR', async () => {
      mockSwitchMode.mockRejectedValue(new Error('Connection lost'));

      try {
        await sessionService.switchMode({ sessionId: 's1', mode: 'MATCH' });
      } catch (err) {
        expect((err as ServiceError).code).toBe('IPC_ERROR');
      }
    });
  });

  describe('resetSession', () => {
    it('returns void on success', async () => {
      mockResetSession.mockResolvedValue({ success: true });

      await expect(sessionService.resetSession({ sessionId: 's1' })).resolves.toBeUndefined();

      expect(mockResetSession).toHaveBeenCalledWith({ sessionId: 's1' });
    });

    it('throws ServiceError on failure', async () => {
      mockResetSession.mockResolvedValue({
        success: false,
        error: { code: 'RESET_ERROR', message: 'Reset failed' },
      });

      await expect(sessionService.resetSession({ sessionId: 's1' })).rejects.toThrow(ServiceError);
    });
  });

  describe('getSessionScore', () => {
    const mockScore = {
      sessionId: 's1',
      totalScore: 95.5,
      seriesScores: [10.0, 9.5, 10.0, 9.0, 9.5, 10.0],
      shotCount: 6,
      discipline: 'AIR_RIFLE_10M',
      mode: 'MATCH',
    };

    it('returns SessionScoreDto on success', async () => {
      mockGetSessionScore.mockResolvedValue({
        success: true,
        data: mockScore,
      });

      const result = await sessionService.getSessionScore({ sessionId: 's1' });

      expect(result).toEqual(mockScore);
      expect(mockGetSessionScore).toHaveBeenCalledWith({ sessionId: 's1' });
    });

    it('throws ServiceError on failure', async () => {
      mockGetSessionScore.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });

      await expect(sessionService.getSessionScore({ sessionId: 's1' })).rejects.toThrow(ServiceError);
    });
  });

  describe('getShotHistory', () => {
    const mockHistory = {
      sessionId: 's1',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          x: 12.5,
          y: -8.3,
          score: 10.0,
          timestamp: '2026-01-13T12:00:00.000Z',
          mode: 'MATCH',
          isRecorded: true,
        },
      ],
    };

    it('returns ShotHistoryDto on success', async () => {
      mockGetShotHistory.mockResolvedValue({
        success: true,
        data: mockHistory,
      });

      const result = await sessionService.getShotHistory({ sessionId: 's1' });

      expect(result).toEqual(mockHistory);
      expect(mockGetShotHistory).toHaveBeenCalledWith({ sessionId: 's1' });
    });

    it('throws ServiceError on failure', async () => {
      mockGetShotHistory.mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No history' },
      });

      await expect(sessionService.getShotHistory({ sessionId: 's1' })).rejects.toThrow(ServiceError);
    });

    it('error with metadata is preserved', async () => {
      mockGetShotHistory.mockResolvedValue({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid session',
          metadata: { field: 'sessionId' },
        },
      });

      try {
        await sessionService.getShotHistory({ sessionId: 'bad' });
      } catch (err) {
        expect((err as ServiceError).metadata).toEqual({ field: 'sessionId' });
      }
    });
  });
});
