// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdvanceStageHandler } from '@/main/modules/competition/application/handlers/AdvanceStageHandler';
import { SessionLifecycleService } from '@/main/modules/competition/application/SessionLifecycleService';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { RoundConfig } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createAdvanceStageHandler', () => {
  let mockCompetitionRepo: ICompetitionRepository;
  let mockSessionLifecycle: SessionLifecycleService;
  let mockEventBus: IEventBus;

  beforeEach(() => {
    mockCompetitionRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };
    mockSessionLifecycle = {
      rotateSession: vi.fn().mockResolvedValue('new-session-id'),
    } as unknown as SessionLifecycleService;
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
  });

  it('should advance from SERIES_COMPLETE to the next stage', async () => {
    let state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    state = state.startStage().expireTimer(); // SERIES_COMPLETE

    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createAdvanceStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);
    const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
    expect(savedState.currentStageIndex).toBe(1);
  });

  it('should emit StageAdvanced event when stage changes', async () => {
    let state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    state = state.startStage().expireTimer();

    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createAdvanceStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'StageAdvanced' }));
    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'PhaseChanged' }));
  });

  describe('stage transition where next stage has requiresNewSession: true', () => {
    it('should call SessionLifecycleService.rotateSession', async () => {
      let state = CompetitionState.create('comp-1', 'old-session-id', BR60S.config);
      state = state.startStage().expireTimer();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      const handler = createAdvanceStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockSessionLifecycle.rotateSession).toHaveBeenCalledWith('old-session-id');
    });

    it('should update sessionId of CompetitionState to the new session', async () => {
      let state = CompetitionState.create('comp-1', 'old-session-id', BR60S.config);
      state = state.startStage().expireTimer();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      const handler = createAdvanceStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      const savedCompState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(savedCompState.sessionId).toBe('new-session-id');
      expect(savedCompState.currentStageIndex).toBe(1);
    });

    it('should emit PhaseChanged event', async () => {
      let state = CompetitionState.create('comp-1', 'old-session-id', BR60S.config);
      state = state.startStage().expireTimer();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      const handler = createAdvanceStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'PhaseChanged' }));
    });
  });

  describe('stage transition where next stage has requiresNewSession: false', () => {
    const noRotateConfig: RoundConfig = {
      name: 'NoRotateTest',
      shotsPerSeries: 10,
      acc: 'DECIMAL',
      stages: [
        {
          name: 'Match',
          scored: true,
          series: [{ maxShots: 1 }],
          timer: { durationSeconds: 2700 },
          requiresNewSession: false,
        },
        {
          name: 'Additional Sighting',
          scored: false,
          series: [{ maxShots: 0 }],
          timer: { durationSeconds: 300 },
          requiresNewSession: false,
        },
      ],
    };

    it('should not call rotateSession', async () => {
      let state = CompetitionState.create('comp-1', 'old-session-id', noRotateConfig);
      // Bring scored stage (stage 0) to SERIES_COMPLETE via startStage → recordShotInSeries
      state = state.startStage().recordShotInSeries();
      // maxShots: 1, so 1 shot causes SERIES_COMPLETE
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      const handler = createAdvanceStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockSessionLifecycle.rotateSession).not.toHaveBeenCalled();
      const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(savedState.sessionId).toBe('old-session-id');
      expect(savedState.currentStageIndex).toBe(1);
    });
  });

  describe('series progression (within the same stage)', () => {
    it('should not call rotateSession', async () => {
      // Progressing within BR60S match stage (6 series)
      let state = CompetitionState.create('comp-1', 'old-session-id', BR60S.config);
      // Advance from stage 0 (sighting) to stage 1 (match)
      state = state.startStage().expireTimer(); // SERIES_COMPLETE (stage 0)

      // Move to stage 1 via advanceToNextStage
      state = state.advanceToNextStage(); // STAGE_ENTERED (stage 1)
      state = state.startNextSeries(); // ACTIVE (stage 1, series 0)

      // Fire 10 shots in series 0 to reach SERIES_COMPLETE
      for (let i = 0; i < 10; i++) {
        state = state.recordShotInSeries();
      }
      // SERIES_COMPLETE (stage 1, series 0)

      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);
      vi.mocked(mockSessionLifecycle.rotateSession).mockClear();

      const handler = createAdvanceStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      // Series progression — no rotation
      expect(mockSessionLifecycle.rotateSession).not.toHaveBeenCalled();
      const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(savedState.phase).toBe('SERIES_ENTERED');
      expect(savedState.currentStageIndex).toBe(1); // same stage
      expect(savedState.currentSeriesIndex).toBe(1); // next series
    });

    it('should not emit StageAdvanced event', async () => {
      let state = CompetitionState.create('comp-1', 'old-session-id', BR60S.config);
      state = state.startStage().expireTimer();
      state = state.advanceToNextStage();
      state = state.startNextSeries();
      for (let i = 0; i < 10; i++) {
        state = state.recordShotInSeries();
      }

      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      const handler = createAdvanceStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      // PhaseChanged is emitted but StageAdvanced is not
      expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'PhaseChanged' }));
      expect(mockEventBus.emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'StageAdvanced' }));
    });
  });
});
