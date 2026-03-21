// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceError } from '@/renderer/services/createServiceMethod';
import { reportService } from '@/renderer/services/reportService';
import type { Discipline } from '@/shared/ipc/contracts';

describe('reportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getScoreSheet', () => {
    it('success -> returns ScoreSheetDto', async () => {
      const scoreSheet = {
        sessionId: 'sess-1',
        laneNumber: 1,
        relay: 1,
        playerName: 'Test Player',
        affiliation: 'Test Club',
        allShots: [{ shotNumber: 1, value: 10.2, integerValue: 10, seriesNumber: 1, x: null, y: null }],
        seriesScores: [102.5],
        totalScore: 102.5,
        totalIntegerScore: 103,
        discipline: 'AIR_RIFLE_10M' as Discipline,
      };
      vi.mocked(window.electronAPI.report.getScoreSheet).mockResolvedValue({
        success: true,
        data: scoreSheet,
      });

      const result = await reportService.getScoreSheet({ sessionId: 'sess-1' });

      expect(result).toEqual(scoreSheet);
      expect(window.electronAPI.report.getScoreSheet).toHaveBeenCalledWith({ sessionId: 'sess-1' });
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.report.getScoreSheet).mockResolvedValue({
        success: false,
        data: null,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
      });

      await expect(reportService.getScoreSheet({ sessionId: 'bad-id' })).rejects.toThrow(ServiceError);
      await expect(reportService.getScoreSheet({ sessionId: 'bad-id' })).rejects.toMatchObject({
        code: 'SESSION_NOT_FOUND',
      });
    });
  });

  describe('openPrintWindow', () => {
    it('success → void', async () => {
      vi.mocked(window.electronAPI.report.openPrintWindow).mockResolvedValue({
        success: true,
      });

      await expect(reportService.openPrintWindow({ sessionId: 'sess-1' })).resolves.toBeUndefined();
      expect(window.electronAPI.report.openPrintWindow).toHaveBeenCalledWith({ sessionId: 'sess-1' });
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.report.openPrintWindow).mockResolvedValue({
        success: false,
        error: { code: 'PRINT_ERROR', message: 'Print failed' },
      });

      await expect(reportService.openPrintWindow({ sessionId: 'sess-1' })).rejects.toMatchObject({
        code: 'PRINT_ERROR',
      });
    });
  });
});
