// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEndStageHandler } from '@/main/modules/competition/application/handlers/EndStageHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createEndStageHandler', () => {
  let mockCompetitionRepo: ICompetitionRepository;
  let mockEventBus: IEventBus;

  beforeEach(() => {
    mockCompetitionRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
  });

  it('should transition from ACTIVE to SERIES_COMPLETE and save', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createEndStageHandler(mockCompetitionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);
    const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
    expect(savedState.phase).toBe('SERIES_COMPLETE');
  });

  it('should emit PhaseChanged event', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createEndStageHandler(mockCompetitionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PhaseChanged',
        previousPhase: 'ACTIVE',
        newPhase: 'SERIES_COMPLETE',
      }),
    );
  });

  it('should throw error for non-existent competition ID', async () => {
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(null);

    const handler = createEndStageHandler(mockCompetitionRepo, mockEventBus);
    await expect(handler({ competitionId: 'nonexistent' })).rejects.toThrow();
  });

  it('should throw error from IDLE phase', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createEndStageHandler(mockCompetitionRepo, mockEventBus);
    await expect(handler({ competitionId: 'comp-1' })).rejects.toThrow();
  });
});
