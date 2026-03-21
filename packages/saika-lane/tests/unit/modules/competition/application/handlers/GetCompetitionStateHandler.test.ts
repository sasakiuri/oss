// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createGetCompetitionStateHandler } from '@/main/modules/competition/application/handlers/GetCompetitionStateHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';

describe('createGetCompetitionStateHandler', () => {
  let mockCompetitionRepo: ICompetitionRepository;

  beforeEach(() => {
    mockCompetitionRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };
  });

  it('should return CompetitionStateDto', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createGetCompetitionStateHandler(mockCompetitionRepo);
    const dto = await handler({ competitionId: 'comp-1' });

    expect(dto.id).toBe('comp-1');
    expect(dto.sessionId).toBe('session-1');
    expect(dto.phase).toBe('ACTIVE');
    expect(dto.currentStageIndex).toBe(0);
    expect(dto.currentSeriesIndex).toBe(0);
    expect(dto.seriesShotCount).toBe(0);
    expect(dto.timer.remainingSeconds).toBe(600);
    expect(dto.timer.totalSeconds).toBe(600);
    expect(dto.timer.formattedRemaining).toBe('10:00');
    expect(dto.timer.isExpired).toBe(false);
    expect(dto.currentStageName).toBe('Sighting');
    expect(dto.scored).toBe(false);
    expect(dto.shotsPerSeries).toBe(10);
  });

  it('should correctly return state of match stage', async () => {
    let state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    state = state.startStage().expireTimer();
    state = state.advanceToNextStage(); // match stage
    state = state.startNextSeries();
    state = state.recordShotInSeries();
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createGetCompetitionStateHandler(mockCompetitionRepo);
    const dto = await handler({ competitionId: 'comp-1' });

    expect(dto.currentStageIndex).toBe(1);
    expect(dto.scored).toBe(true);
    expect(dto.seriesShotCount).toBe(1);
  });

  it('should throw an error for a non-existent competition ID', async () => {
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(null);

    const handler = createGetCompetitionStateHandler(mockCompetitionRepo);
    await expect(handler({ competitionId: 'nonexistent' })).rejects.toThrow();
  });
});
