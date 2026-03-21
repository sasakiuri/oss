// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { competitionService } from '@/renderer/services/competitionService';
import { ServiceError } from '@/renderer/services/createServiceMethod';

describe('competitionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startCompetition', () => {
    it('success -> returns data', async () => {
      vi.mocked(window.electronAPI.competition.startCompetition).mockResolvedValue({
        success: true,
        data: { competitionId: 'comp-1', sessionId: 'sess-1' },
      });

      const result = await competitionService.startCompetition({
        competitionTypeId: 'BR60S',
      });

      expect(result).toEqual({ competitionId: 'comp-1', sessionId: 'sess-1' });
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.competition.startCompetition).mockResolvedValue({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Invalid competition type' },
      });

      await expect(competitionService.startCompetition({ competitionTypeId: 'UNKNOWN' })).rejects.toThrow(ServiceError);
    });
  });

  describe('startStage', () => {
    it('success -> returns { sessionId }', async () => {
      vi.mocked(window.electronAPI.competition.startStage).mockResolvedValue({
        success: true,
        data: { sessionId: 'sess-new' },
      });

      const result = await competitionService.startStage({ competitionId: 'comp-1' });
      expect(result).toEqual({ sessionId: 'sess-new' });
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.competition.startStage).mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Competition not found' },
      });

      await expect(competitionService.startStage({ competitionId: 'bad-id' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('endStage', () => {
    it('success → void', async () => {
      vi.mocked(window.electronAPI.competition.endStage).mockResolvedValue({
        success: true,
      });

      await expect(competitionService.endStage({ competitionId: 'comp-1' })).resolves.toBeUndefined();
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.competition.endStage).mockResolvedValue({
        success: false,
        error: { code: 'INVALID_PHASE', message: 'Cannot end stage' },
      });

      await expect(competitionService.endStage({ competitionId: 'comp-1' })).rejects.toMatchObject({
        code: 'INVALID_PHASE',
      });
    });
  });

  describe('startNextSeries', () => {
    it('success → void', async () => {
      vi.mocked(window.electronAPI.competition.startNextSeries).mockResolvedValue({
        success: true,
      });

      await expect(competitionService.startNextSeries({ competitionId: 'comp-1' })).resolves.toBeUndefined();
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.competition.startNextSeries).mockResolvedValue({
        success: false,
        error: { code: 'INVALID_PHASE', message: 'Cannot start next series' },
      });

      await expect(competitionService.startNextSeries({ competitionId: 'comp-1' })).rejects.toMatchObject({
        code: 'INVALID_PHASE',
      });
    });
  });

  describe('advanceStage', () => {
    it('success → void', async () => {
      vi.mocked(window.electronAPI.competition.advanceStage).mockResolvedValue({
        success: true,
      });

      await expect(competitionService.advanceStage({ competitionId: 'comp-1' })).resolves.toBeUndefined();
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.competition.advanceStage).mockResolvedValue({
        success: false,
        error: { code: 'STAGE_ERROR', message: 'Cannot advance' },
      });

      await expect(competitionService.advanceStage({ competitionId: 'comp-1' })).rejects.toMatchObject({
        code: 'STAGE_ERROR',
      });
    });
  });

  describe('finishCompetition', () => {
    it('success → void', async () => {
      vi.mocked(window.electronAPI.competition.finishCompetition).mockResolvedValue({
        success: true,
      });

      await expect(competitionService.finishCompetition({ competitionId: 'comp-1' })).resolves.toBeUndefined();
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.competition.finishCompetition).mockResolvedValue({
        success: false,
        error: { code: 'ALREADY_FINISHED', message: 'Already finished' },
      });

      await expect(competitionService.finishCompetition({ competitionId: 'comp-1' })).rejects.toMatchObject({
        code: 'ALREADY_FINISHED',
      });
    });
  });

  describe('getCompetitionState', () => {
    it('success -> returns CompetitionStateDto', async () => {
      const stateDto = {
        id: 'comp-1',
        sessionId: 'sess-1',
        phase: 'ACTIVE' as const,
        currentStageIndex: 0,
        currentSeriesIndex: 0,
        seriesShotCount: 0,
        timer: {
          remainingSeconds: 120,
          totalSeconds: 900,
          formattedRemaining: '02:00',
          isExpired: false,
        },
        currentStageName: 'Stage 1',
        scored: true,
        shotsPerSeries: 10,
      };
      vi.mocked(window.electronAPI.competition.getCompetitionState).mockResolvedValue({
        success: true,
        data: stateDto,
      });

      const result = await competitionService.getCompetitionState({ competitionId: 'comp-1' });

      expect(result).toEqual(stateDto);
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.competition.getCompetitionState).mockResolvedValue({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });

      await expect(competitionService.getCompetitionState({ competitionId: 'bad' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('getCompetitionTypes', () => {
    it('success -> returns CompetitionTypeDto[]', async () => {
      const types = [
        { id: 'BR60S', name: 'BR60S Qualification' },
        { id: 'BP60', name: 'BP60 Qualification' },
      ];
      vi.mocked(window.electronAPI.competition.getCompetitionTypes).mockResolvedValue({
        success: true,
        data: types,
      });

      const result = await competitionService.getCompetitionTypes();

      expect(result).toEqual(types);
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.competition.getCompetitionTypes).mockResolvedValue({
        success: false,
        data: null,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });

      await expect(competitionService.getCompetitionTypes()).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });
  });
});
