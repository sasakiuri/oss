// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStartStageHandler } from '@/main/modules/competition/application/handlers/StartStageHandler';
import { SessionLifecycleService } from '@/main/modules/competition/application/SessionLifecycleService';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createStartStageHandler', () => {
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

  it('transitions from IDLE to ACTIVE and saves', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
    const result = await handler({ competitionId: 'comp-1' });

    expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);
    const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
    expect(savedState.phase).toBe('ACTIVE');
    expect(result).toEqual({ sessionId: 'session-1' });
  });

  it('PhaseChanged event is emitted', async () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

    const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
    await handler({ competitionId: 'comp-1' });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PhaseChanged',
        previousPhase: 'IDLE',
        newPhase: 'ACTIVE',
      }),
    );
  });

  it('throws error for non-existent competition ID', async () => {
    vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(null);

    const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
    await expect(handler({ competitionId: 'nonexistent' })).rejects.toThrow();
  });

  describe('ACTIVE (unscored) → resetToIdle', () => {
    it('SessionLifecycleService.rotateSession is called', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      const activeState = idleState.startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(activeState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockSessionLifecycle.rotateSession).toHaveBeenCalledWith('old-session');
    });

    it('resets to IDLE state with new sessionId', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      const activeState = idleState.startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(activeState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      const result = await handler({ competitionId: 'comp-1' });

      expect(result.sessionId).toBe('new-session-id');
      const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(savedState.sessionId).toBe('new-session-id');
      expect(savedState.phase).toBe('IDLE');
    });

    it('resetToIdle resets seriesShotCount, stageIndex, and seriesIndex', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      const activeState = idleState.startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(activeState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(savedState.seriesShotCount).toBe(0);
      expect(savedState.currentStageIndex).toBe(0);
      expect(savedState.currentSeriesIndex).toBe(0);
      expect(savedState.timer.remainingSeconds).toBe(0);
    });

    it('PhaseChanged event is emitted (ACTIVE → IDLE)', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      const activeState = idleState.startStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(activeState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PhaseChanged',
          previousPhase: 'ACTIVE',
          newPhase: 'IDLE',
        }),
      );
    });

    it('rotateSession is not called in IDLE state', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(state);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockSessionLifecycle.rotateSession).not.toHaveBeenCalled();
    });
  });

  describe('ACTIVE (scored) → resetToIdle', () => {
    it('calls rotateSession + resetToIdle from ACTIVE[scored] and saves as IDLE', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      const matchActiveState = idleState.startStage().endStage().advanceToNextStage().startNextSeries();
      expect(matchActiveState.phase).toBe('ACTIVE');
      expect(matchActiveState.currentStageConfig.scored).toBe(true);
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(matchActiveState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      const result = await handler({ competitionId: 'comp-1' });

      expect(mockSessionLifecycle.rotateSession).toHaveBeenCalledWith('old-session');
      const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(savedState.phase).toBe('IDLE');
      expect(savedState.sessionId).toBe('new-session-id');
      expect(savedState.currentStageIndex).toBe(0);
      expect(savedState.currentSeriesIndex).toBe(0);
      expect(savedState.timer.remainingSeconds).toBe(0);
      expect(result.sessionId).toBe('new-session-id');
    });

    it('PhaseChanged event is emitted (ACTIVE → IDLE)', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      const matchActiveState = idleState.startStage().endStage().advanceToNextStage().startNextSeries();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(matchActiveState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PhaseChanged',
          previousPhase: 'ACTIVE',
          newPhase: 'IDLE',
        }),
      );
    });
  });

  describe('SERIES_COMPLETE / SERIES_ENTERED / STAGE_ENTERED → rewindToStage', () => {
    it('calls rewindToStage from SERIES_COMPLETE and rotates session', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      // IDLE → ACTIVE → endStage → SERIES_COMPLETE
      const seriesCompleteState = idleState.startStage().endStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(seriesCompleteState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockSessionLifecycle.rotateSession).toHaveBeenCalledWith('old-session');
      const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(savedState.phase).toBe('ACTIVE');
      expect(savedState.sessionId).toBe('new-session-id');
      expect(savedState.currentStageIndex).toBe(0);
    });

    it('calls rewindToStage from STAGE_ENTERED and rotates session', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      // IDLE → ACTIVE → endStage → SERIES_COMPLETE → advanceToNextStage → STAGE_ENTERED
      const stageEnteredState = idleState.startStage().endStage().advanceToNextStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(stageEnteredState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockSessionLifecycle.rotateSession).toHaveBeenCalledWith('old-session');
      const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(savedState.phase).toBe('ACTIVE');
      expect(savedState.sessionId).toBe('new-session-id');
      expect(savedState.currentStageIndex).toBe(0);
    });

    it('calls rewindToStage from SERIES_ENTERED and rotates session', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      // IDLE → ACTIVE → expireTimer → SERIES_COMPLETE → advanceToNextStage → STAGE_ENTERED
      // → startNextSeries → ACTIVE → 10 shots → SERIES_COMPLETE → advanceToNextStage → SERIES_ENTERED
      let state = idleState.startStage().expireTimer().advanceToNextStage().startNextSeries();
      for (let i = 0; i < 10; i++) {
        state = state.recordShotInSeries();
      }
      const seriesEnteredState = state.advanceToNextStage();
      expect(seriesEnteredState.phase).toBe('SERIES_ENTERED');
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(seriesEnteredState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockSessionLifecycle.rotateSession).toHaveBeenCalled();
      const savedState = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(savedState.phase).toBe('ACTIVE');
      expect(savedState.currentStageIndex).toBe(0);
    });

    it('returns new sessionId', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      const seriesCompleteState = idleState.startStage().endStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(seriesCompleteState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      const result = await handler({ competitionId: 'comp-1' });

      expect(result.sessionId).toBe('new-session-id');
    });

    it('PhaseChanged event is emitted with correct data', async () => {
      const idleState = CompetitionState.create('comp-1', 'old-session', BR60S.config);
      const seriesCompleteState = idleState.startStage().endStage();
      vi.mocked(mockCompetitionRepo.findById).mockResolvedValue(seriesCompleteState);

      const handler = createStartStageHandler(mockCompetitionRepo, mockSessionLifecycle, mockEventBus);
      await handler({ competitionId: 'comp-1' });

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PhaseChanged',
          previousPhase: 'SERIES_COMPLETE',
          newPhase: 'ACTIVE',
        }),
      );
    });
  });
});
