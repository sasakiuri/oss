// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStartNextSeriesHandler } from '@/main/modules/competition/application/handlers/StartNextSeriesHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createStartNextSeriesHandler', () => {
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

  it('transitions from SERIES_COMPLETE to ACTIVE and saves', async () => {
    let state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    state = state.startStage().expireTimer(); // SERIES_COMPLETE
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createStartNextSeriesHandler(mockCompetitionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);
    const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
    expect(savedState.phase).toBe('ACTIVE');
  });

  it('transitions from SERIES_ENTERED to ACTIVE', async () => {
    let state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    state = state.startStage().expireTimer();
    state = state.advanceToNextStage(); // STAGE_ENTERED (scored stage)
    state = state.startNextSeries(); // ACTIVE (series 0)
    for (let i = 0; i < 10; i++) {
      state = state.recordShotInSeries();
    }
    state = state.advanceToNextStage(); // SERIES_ENTERED (series 1)
    expect(state.phase).toBe('SERIES_ENTERED');
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createStartNextSeriesHandler(mockCompetitionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
    expect(savedState.phase).toBe('ACTIVE');
  });

  it('transitions from STAGE_ENTERED to ACTIVE', async () => {
    let state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    state = state.startStage().expireTimer();
    state = state.advanceToNextStage(); // STAGE_ENTERED (scored stage)
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createStartNextSeriesHandler(mockCompetitionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
    expect(savedState.phase).toBe('ACTIVE');
  });

  it('PhaseChanged event is emitted', async () => {
    let state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    state = state.startStage().expireTimer();
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createStartNextSeriesHandler(mockCompetitionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PhaseChanged',
        previousPhase: 'SERIES_COMPLETE',
        newPhase: 'ACTIVE',
      }),
    );
  });

  it('throws error for non-existent competition ID', async () => {
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(null);

    const handler = createStartNextSeriesHandler(mockCompetitionRepo, mockEventBus);
    await expect(handler({ competitionId: 'nonexistent' })).rejects.toThrow();
  });
});
