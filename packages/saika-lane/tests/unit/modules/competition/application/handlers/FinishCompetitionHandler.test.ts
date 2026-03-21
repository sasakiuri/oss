// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFinishCompetitionHandler } from '@/main/modules/competition/application/handlers/FinishCompetitionHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createFinishCompetitionHandler', () => {
  let mockCompetitionRepo: ICompetitionRepository;
  let mockSessionRepo: ISessionRepository;
  let mockEventBus: IEventBus;

  beforeEach(() => {
    mockCompetitionRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };

    mockSessionRepo = {
      save: vi.fn(),
      saveShot: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      findActive: vi.fn(),
    };

    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
  });

  it('transitions from ACTIVE to FINISHED and saves', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
    vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

    const handler = createFinishCompetitionHandler(mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);
    const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
    expect(savedState.phase).toBe('FINISHED');
  });

  it('CompetitionFinished and PhaseChanged events are emitted', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
    vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

    const handler = createFinishCompetitionHandler(mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CompetitionFinished',
        sessionId: 'session-1',
      }),
    );
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PhaseChanged',
        previousPhase: 'ACTIVE',
        newPhase: 'FINISHED',
      }),
    );
  });

  it('also finishes the associated Session', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const mockSession = {
      isFinished: false,
      finish: vi.fn().mockReturnValue({ isFinished: true }),
    };
    vi.mocked(mockSessionRepo.findById).mockResolvedValue(mockSession as any);

    const handler = createFinishCompetitionHandler(mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockSession.finish).toHaveBeenCalled();
    expect(mockSessionRepo.save).toHaveBeenCalledTimes(1);
  });

  it('does not call Session.finish when Session is already FINISHED', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const mockSession = {
      isFinished: true,
      finish: vi.fn(),
    };
    vi.mocked(mockSessionRepo.findById).mockResolvedValue(mockSession as any);

    const handler = createFinishCompetitionHandler(mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockSession.finish).not.toHaveBeenCalled();
    expect(mockSessionRepo.save).not.toHaveBeenCalled();
  });

  it('throws error for non-existent competition ID', async () => {
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(null);

    const handler = createFinishCompetitionHandler(mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await expect(handler({ competitionId: 'nonexistent' })).rejects.toThrow();
  });
});
