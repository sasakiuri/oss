// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { RoundConfig } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import { Timer } from '@/main/modules/competition/domain/Timer';
import { DomainError } from '@/shared/errors/DomainError';

const TEST_CONFIG = BR60S.config;

function createIdleState(config: RoundConfig = TEST_CONFIG): CompetitionState {
  return CompetitionState.create('comp-1', 'session-1', config);
}

describe('CompetitionState aggregate root', () => {
  describe('create()', () => {
    it('is created in IDLE phase', () => {
      const state = createIdleState();
      expect(state.id).toBe('comp-1');
      expect(state.sessionId).toBe('session-1');
      expect(state.phase).toBe('IDLE');
      expect(state.currentStageIndex).toBe(0);
      expect(state.currentSeriesIndex).toBe(0);
      expect(state.seriesShotCount).toBe(0);
      expect(state.startedAt).toBeNull();
      expect(state.finishedAt).toBeNull();
    });

    it('initial timer is 0 seconds', () => {
      const state = createIdleState();
      expect(state.timer.remainingSeconds).toBe(0);
      expect(state.timer.totalSeconds).toBe(0);
    });
  });

  describe('currentStageConfig / currentSeriesConfig', () => {
    it('can get current stage config', () => {
      const state = createIdleState();
      expect(state.currentStageConfig.name).toBe('Sighting');
      expect(state.currentStageConfig.scored).toBe(false);
    });

    it('can get current series config', () => {
      const state = createIdleState();
      expect(state.currentSeriesConfig.maxShots).toBe(0); // unscored is unlimited
    });
  });

  describe('startStage()', () => {
    it('transitions IDLE → ACTIVE', () => {
      const state = createIdleState();
      const active = state.startStage();
      expect(active.phase).toBe('ACTIVE');
      expect(active.startedAt).not.toBeNull();
    });

    it('timer for the first stage is set', () => {
      const state = createIdleState();
      const active = state.startStage();
      expect(active.timer.remainingSeconds).toBe(600);
      expect(active.timer.totalSeconds).toBe(600);
    });

    it('throws error from ACTIVE phase', () => {
      const state = createIdleState().startStage();
      expect(() => state.startStage()).toThrow();
    });

    it('throws error from FINISHED phase', () => {
      const state = createIdleState().finish();
      expect(() => state.startStage()).toThrow();
    });

    it('original state is not modified', () => {
      const state = createIdleState();
      state.startStage();
      expect(state.phase).toBe('IDLE');
    });
  });

  describe('recordShotInSeries()', () => {
    it('shot count increments in ACTIVE phase', () => {
      const state = createIdleState().startStage();
      const recorded = state.recordShotInSeries();
      expect(recorded.seriesShotCount).toBe(1);
      expect(recorded.phase).toBe('ACTIVE'); // unscored is unlimited
    });

    it('does not transition to SERIES_COMPLETE when maxShots=0 (unlimited)', () => {
      let state = createIdleState().startStage();
      // unscored stage maxShots is 0
      for (let i = 0; i < 20; i++) {
        state = state.recordShotInSeries();
      }
      expect(state.phase).toBe('ACTIVE');
      expect(state.seriesShotCount).toBe(20);
    });

    it('transitions to SERIES_COMPLETE when maxShots is reached', () => {
      // advance to scored stage
      let state = createIdleState().startStage();
      state = state.expireTimer(); // → SERIES_COMPLETE
      state = state.advanceToNextStage(); // → STAGE_ENTERED (scored stage)
      state = state.startNextSeries(); // → ACTIVE

      // fire 10 shots
      for (let i = 0; i < 9; i++) {
        state = state.recordShotInSeries();
        expect(state.phase).toBe('ACTIVE');
      }
      state = state.recordShotInSeries(); // 10th shot
      expect(state.phase).toBe('SERIES_COMPLETE');
    });

    it('throws error from IDLE phase', () => {
      const state = createIdleState();
      expect(() => state.recordShotInSeries()).toThrow();
    });
  });

  describe('expireTimer()', () => {
    it('transitions ACTIVE → SERIES_COMPLETE', () => {
      const state = createIdleState().startStage();
      const expired = state.expireTimer();
      expect(expired.phase).toBe('SERIES_COMPLETE');
    });

    it('timer becomes 0', () => {
      const state = createIdleState().startStage();
      const expired = state.expireTimer();
      expect(expired.timer.isExpired).toBe(true);
    });

    it('throws error from IDLE phase', () => {
      const state = createIdleState();
      expect(() => state.expireTimer()).toThrow();
    });
  });

  describe('startNextSeries()', () => {
    it('transitions SERIES_COMPLETE → ACTIVE', () => {
      const state = createIdleState().startStage().expireTimer();
      expect(state.phase).toBe('SERIES_COMPLETE');
      const next = state.startNextSeries();
      expect(next.phase).toBe('ACTIVE');
    });

    it('transitions SERIES_ENTERED → ACTIVE', () => {
      // after completing series 1 of scored stage, advancing to series 2
      let state = createIdleState().startStage();
      state = state.expireTimer();
      state = state.advanceToNextStage(); // STAGE_ENTERED (scored stage)
      state = state.startNextSeries(); // ACTIVE (series 0)
      for (let i = 0; i < 10; i++) {
        state = state.recordShotInSeries();
      }
      state = state.advanceToNextStage(); // SERIES_ENTERED (series 1)
      expect(state.phase).toBe('SERIES_ENTERED');
      const next = state.startNextSeries();
      expect(next.phase).toBe('ACTIVE');
    });

    it('transitions STAGE_ENTERED → ACTIVE', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer(); // SERIES_COMPLETE
      state = state.advanceToNextStage(); // STAGE_ENTERED (scored stage)
      const next = state.startNextSeries();
      expect(next.phase).toBe('ACTIVE');
    });

    it('seriesShotCount is reset', () => {
      let state = createIdleState().startStage();
      state = state.recordShotInSeries();
      state = state.recordShotInSeries();
      state = state.expireTimer();
      const next = state.startNextSeries();
      expect(next.seriesShotCount).toBe(0);
    });

    it('throws error from IDLE phase', () => {
      const state = createIdleState();
      expect(() => state.startNextSeries()).toThrow();
    });

    it('throws error from ACTIVE phase', () => {
      const state = createIdleState().startStage();
      expect(() => state.startNextSeries()).toThrow();
    });
  });

  describe('advanceToNextStage()', () => {
    it('transitions to SERIES_ENTERED when next series exists within the stage', () => {
      // after completing series 1 of scored stage, advancing to series 2
      let state = createIdleState().startStage();
      state = state.expireTimer();
      state = state.advanceToNextStage(); // → scored stage
      state = state.startNextSeries();
      // fire 10 shots to reach SERIES_COMPLETE
      for (let i = 0; i < 10; i++) {
        state = state.recordShotInSeries();
      }
      expect(state.phase).toBe('SERIES_COMPLETE');
      const advanced = state.advanceToNextStage();
      expect(advanced.phase).toBe('SERIES_ENTERED');
      expect(advanced.currentSeriesIndex).toBe(1); // series 2
    });

    it('transitions to STAGE_ENTERED when next stage exists', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer(); // SERIES_COMPLETE from unscored stage
      const advanced = state.advanceToNextStage();
      expect(advanced.phase).toBe('STAGE_ENTERED');
      expect(advanced.currentStageIndex).toBe(1); // scored stage
    });

    it('transitions to FINISHED when all stages are complete', () => {
      // complete all 6 series of scored stage
      let state = createIdleState().startStage();
      state = state.expireTimer();
      state = state.advanceToNextStage(); // → scored stage

      // consume 6 series × 10 shots
      for (let seriesIdx = 0; seriesIdx < 6; seriesIdx++) {
        state = state.startNextSeries();
        for (let shot = 0; shot < 10; shot++) {
          state = state.recordShotInSeries();
        }
        if (seriesIdx < 5) {
          state = state.advanceToNextStage(); // next series
        }
      }

      expect(state.phase).toBe('SERIES_COMPLETE');
      const finished = state.advanceToNextStage();
      expect(finished.phase).toBe('FINISHED');
      expect(finished.finishedAt).not.toBeNull();
    });

    it('throws error from ACTIVE phase', () => {
      const state = createIdleState().startStage();
      expect(() => state.advanceToNextStage()).toThrow();
    });
  });

  describe('finish()', () => {
    it('can transition to FINISHED from any phase', () => {
      const idle = createIdleState();
      expect(idle.finish().phase).toBe('FINISHED');

      const active = idle.startStage();
      expect(active.finish().phase).toBe('FINISHED');

      const complete = active.expireTimer();
      expect(complete.finish().phase).toBe('FINISHED');
    });

    it('finishedAt is set', () => {
      const state = createIdleState().finish();
      expect(state.finishedAt).not.toBeNull();
    });

    it('throws error from FINISHED phase', () => {
      const state = createIdleState().finish();
      expect(() => state.finish()).toThrow();
    });
  });

  describe('tickTimerBy()', () => {
    it('advances timer by n seconds', () => {
      const state = createIdleState().startStage();
      const ticked = state.tickTimerBy(10);
      expect(ticked.timer.remainingSeconds).toBe(590);
    });
  });

  describe('canAcceptShot()', () => {
    it('returns true in IDLE phase (training mode)', () => {
      const idle = createIdleState();
      expect(idle.canAcceptShot()).toBe(true);
    });

    it('returns true in ACTIVE phase', () => {
      const active = createIdleState().startStage();
      expect(active.canAcceptShot()).toBe(true);
    });

    it('returns false in SERIES_COMPLETE phase', () => {
      const complete = createIdleState().startStage().expireTimer();
      expect(complete.canAcceptShot()).toBe(false);
    });

    it('returns false in SERIES_ENTERED phase', () => {
      // after completing series 1 of scored stage
      let state = createIdleState().startStage().expireTimer().advanceToNextStage().startNextSeries();
      for (let i = 0; i < 10; i++) {
        state = state.recordShotInSeries();
      }
      const seriesEntered = state.advanceToNextStage();
      expect(seriesEntered.phase).toBe('SERIES_ENTERED');
      expect(seriesEntered.canAcceptShot()).toBe(false);
    });

    it('returns false in STAGE_ENTERED phase', () => {
      const stageEntered = createIdleState().startStage().expireTimer().advanceToNextStage();
      expect(stageEntered.canAcceptShot()).toBe(false);
    });

    it('returns false in FINISHED phase', () => {
      const finished = createIdleState().finish();
      expect(finished.canAcceptShot()).toBe(false);
    });
  });

  describe('reconstruct()', () => {
    it('can reconstruct with all properties specified', () => {
      const state = CompetitionState.reconstruct({
        id: 'comp-2',
        sessionId: 'session-2',
        config: TEST_CONFIG,
        phase: 'ACTIVE',
        currentStageIndex: 1,
        currentSeriesIndex: 2,
        seriesShotCount: 5,
        timer: Timer.create(300),
        startedAt: 1000,
        finishedAt: null,
      });
      expect(state.id).toBe('comp-2');
      expect(state.phase).toBe('ACTIVE');
      expect(state.currentStageIndex).toBe(1);
      expect(state.currentSeriesIndex).toBe(2);
      expect(state.seriesShotCount).toBe(5);
      expect(state.timer.remainingSeconds).toBe(300);
    });
  });

  describe('withSessionId()', () => {
    it('updates sessionId while retaining other state', () => {
      const state = createIdleState();
      const updated = state.withSessionId('new-session-id');
      expect(updated.sessionId).toBe('new-session-id');
      expect(updated.id).toBe(state.id);
      expect(updated.phase).toBe(state.phase);
      expect(updated.config).toBe(state.config);
    });

    it('original state sessionId is not changed', () => {
      const state = createIdleState();
      state.withSessionId('new-session-id');
      expect(state.sessionId).toBe('session-1');
    });
  });

  describe('restartStage()', () => {
    it('ACTIVE (unscored) → ACTIVE: timer reset, seriesShotCount=0', () => {
      let state = createIdleState().startStage();
      // record a few shots and advance the timer
      state = state.recordShotInSeries().recordShotInSeries().tickTimerBy(100);
      expect(state.seriesShotCount).toBe(2);
      expect(state.timer.remainingSeconds).toBe(500);

      const restarted = state.restartStage();
      expect(restarted.phase).toBe('ACTIVE');
      expect(restarted.seriesShotCount).toBe(0);
      expect(restarted.timer.remainingSeconds).toBe(600); // timer reset
      expect(restarted.currentStageIndex).toBe(0);
      expect(restarted.currentSeriesIndex).toBe(0);
    });

    it('throws error from ACTIVE (scored)', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer().advanceToNextStage().startNextSeries();
      expect(state.phase).toBe('ACTIVE');
      expect(state.currentStageConfig.scored).toBe(true);

      try {
        state.restartStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('throws error from IDLE', () => {
      const state = createIdleState();
      try {
        state.restartStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('throws error from FINISHED', () => {
      const state = createIdleState().finish();
      try {
        state.restartStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('COMPETITION_ALREADY_FINISHED');
      }
    });

    it('currentStageIndex is maintained for unscored stage at index > 0', () => {
      // 3-stage config: [unscored, scored(1series/1shot), unscored(300s timer)]
      const threeStageConfig: RoundConfig = {
        name: 'ThreeStageTest',
        shotsPerSeries: 10,
        acc: 'DECIMAL',
        stages: [
          {
            name: 'Sighting',
            scored: false,
            series: [{ maxShots: 0 }],
            timer: { durationSeconds: 600 },
            requiresNewSession: false,
          },
          {
            name: 'Match',
            scored: true,
            series: [{ maxShots: 1 }],
            timer: { durationSeconds: 2700 },
            requiresNewSession: true,
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

      // IDLE → stage 0 (unscored) → endStage → advanceToNextStage → stage 1 (scored)
      let state = createIdleState(threeStageConfig).startStage();
      state = state.endStage().advanceToNextStage();
      expect(state.currentStageIndex).toBe(1);

      // stage 1: startNextSeries → recordShot (1 shot causes SERIES_COMPLETE) → advanceToNextStage → stage 2
      state = state.startNextSeries().recordShotInSeries();
      expect(state.phase).toBe('SERIES_COMPLETE');
      state = state.advanceToNextStage();
      expect(state.currentStageIndex).toBe(2);

      // stage 2 (unscored): startNextSeries → ACTIVE
      state = state.startNextSeries();
      expect(state.phase).toBe('ACTIVE');
      expect(state.currentStageConfig.scored).toBe(false);
      expect(state.currentStageConfig.name).toBe('Additional Sighting');

      // record shots and advance timer
      state = state.recordShotInSeries().recordShotInSeries().tickTimerBy(50);
      expect(state.seriesShotCount).toBe(2);
      expect(state.timer.remainingSeconds).toBe(250);

      // restartStage() keeps currentStageIndex at 2
      const restarted = state.restartStage();
      expect(restarted.currentStageIndex).toBe(2);
      expect(restarted.timer.remainingSeconds).toBe(300); // stages[2] timer
      expect(restarted.phase).toBe('ACTIVE');
      expect(restarted.currentSeriesIndex).toBe(0);
      expect(restarted.seriesShotCount).toBe(0);
    });
  });

  describe('resetToIdle()', () => {
    it('ACTIVE (unscored) → resets to IDLE', () => {
      let state = createIdleState().startStage();
      state = state.recordShotInSeries().recordShotInSeries().tickTimerBy(100);
      expect(state.phase).toBe('ACTIVE');
      expect(state.currentStageConfig.scored).toBe(false);

      const reset = state.resetToIdle();
      expect(reset.phase).toBe('IDLE');
      expect(reset.currentStageIndex).toBe(0);
      expect(reset.currentSeriesIndex).toBe(0);
      expect(reset.seriesShotCount).toBe(0);
      expect(reset.timer.remainingSeconds).toBe(0);
      expect(reset.timer.totalSeconds).toBe(0);
    });

    it('ACTIVE (scored) → resets to IDLE', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer().advanceToNextStage().startNextSeries();
      expect(state.phase).toBe('ACTIVE');
      expect(state.currentStageConfig.scored).toBe(true);

      const reset = state.resetToIdle();
      expect(reset.phase).toBe('IDLE');
      expect(reset.currentStageIndex).toBe(0);
      expect(reset.currentSeriesIndex).toBe(0);
      expect(reset.seriesShotCount).toBe(0);
      expect(reset.timer.remainingSeconds).toBe(0);
    });

    it('throws error from IDLE', () => {
      const state = createIdleState();
      try {
        state.resetToIdle();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('throws error from SERIES_COMPLETE', () => {
      const state = createIdleState().startStage().expireTimer();
      expect(state.phase).toBe('SERIES_COMPLETE');
      try {
        state.resetToIdle();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('throws error from FINISHED', () => {
      const state = createIdleState().finish();
      try {
        state.resetToIdle();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('COMPETITION_ALREADY_FINISHED');
      }
    });

    it('original state is not modified', () => {
      const state = createIdleState().startStage();
      state.resetToIdle();
      expect(state.phase).toBe('ACTIVE');
    });
  });

  describe('endStage()', () => {
    it('transitions ACTIVE (unscored) → SERIES_COMPLETE', () => {
      const state = createIdleState().startStage();
      expect(state.phase).toBe('ACTIVE');
      expect(state.currentStageConfig.scored).toBe(false);

      const ended = state.endStage();
      expect(ended.phase).toBe('SERIES_COMPLETE');
    });

    it('timer expires', () => {
      const state = createIdleState().startStage();
      expect(state.timer.isExpired).toBe(false);

      const ended = state.endStage();
      expect(ended.timer.isExpired).toBe(true);
    });

    it('throws error from ACTIVE (scored)', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer().advanceToNextStage().startNextSeries();
      expect(state.phase).toBe('ACTIVE');
      expect(state.currentStageConfig.scored).toBe(true);

      try {
        state.endStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('throws error from IDLE', () => {
      const state = createIdleState();
      try {
        state.endStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('throws error from SERIES_COMPLETE', () => {
      const state = createIdleState().startStage().expireTimer();
      expect(state.phase).toBe('SERIES_COMPLETE');
      try {
        state.endStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('throws error from FINISHED', () => {
      const state = createIdleState().finish();
      try {
        state.endStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('COMPETITION_ALREADY_FINISHED');
      }
    });

    it('original state is not modified', () => {
      const state = createIdleState().startStage();
      state.endStage();
      expect(state.phase).toBe('ACTIVE');
    });
  });

  describe('rewindToStage()', () => {
    it('transitions SERIES_COMPLETE → ACTIVE (unscored)', () => {
      const state = createIdleState().startStage().expireTimer();
      expect(state.phase).toBe('SERIES_COMPLETE');

      const back = state.rewindToStage();
      expect(back.phase).toBe('ACTIVE');
      expect(back.currentStageConfig.scored).toBe(false);
    });

    it('transitions SERIES_ENTERED → ACTIVE (unscored)', () => {
      let state = createIdleState().startStage().expireTimer().advanceToNextStage().startNextSeries();
      for (let i = 0; i < 10; i++) {
        state = state.recordShotInSeries();
      }
      state = state.advanceToNextStage();
      expect(state.phase).toBe('SERIES_ENTERED');

      const back = state.rewindToStage();
      expect(back.phase).toBe('ACTIVE');
      expect(back.currentStageConfig.scored).toBe(false);
    });

    it('transitions STAGE_ENTERED → ACTIVE (unscored)', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer().advanceToNextStage();
      expect(state.phase).toBe('STAGE_ENTERED');

      const back = state.rewindToStage();
      expect(back.phase).toBe('ACTIVE');
      expect(back.currentStageConfig.scored).toBe(false);
    });

    it('throws error from IDLE', () => {
      const state = createIdleState();
      try {
        state.rewindToStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('transitions ACTIVE (scored) → ACTIVE (unscored)', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer().advanceToNextStage().startNextSeries();
      expect(state.phase).toBe('ACTIVE');
      expect(state.currentStageConfig.scored).toBe(true);

      const back = state.rewindToStage();
      expect(back.phase).toBe('ACTIVE');
      expect(back.currentStageConfig.scored).toBe(false);
      expect(back.currentStageIndex).toBe(0);
      expect(back.currentSeriesIndex).toBe(0);
      expect(back.seriesShotCount).toBe(0);
      expect(back.timer.remainingSeconds).toBe(600);
    });

    it('rewindToStage succeeds from ACTIVE (unscored) as well', () => {
      const state = createIdleState().startStage();
      expect(state.phase).toBe('ACTIVE');
      expect(state.currentStageConfig.scored).toBe(false);

      const back = state.rewindToStage();
      expect(back.phase).toBe('ACTIVE');
      expect(back.currentStageConfig.scored).toBe(false);
    });

    it('throws error from FINISHED', () => {
      const state = createIdleState().finish();
      try {
        state.rewindToStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('COMPETITION_ALREADY_FINISHED');
      }
    });

    it('stageIndex is reset to specified value', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer().advanceToNextStage();
      expect(state.currentStageIndex).toBe(1);

      const back = state.rewindToStage(0);
      expect(back.currentStageIndex).toBe(0);
    });

    it('seriesIndex is reset to 0', () => {
      // test after advancing to series 2 of scored stage
      let state = createIdleState().startStage();
      state = state.expireTimer().advanceToNextStage().startNextSeries();
      for (let i = 0; i < 10; i++) {
        state = state.recordShotInSeries();
      }
      state = state.advanceToNextStage(); // SERIES_ENTERED, series index = 1
      expect(state.phase).toBe('SERIES_ENTERED');
      expect(state.currentSeriesIndex).toBe(1);

      const back = state.rewindToStage();
      expect(back.currentSeriesIndex).toBe(0);
    });

    it('timer is recreated with config of specified stage', () => {
      const state = createIdleState().startStage().expireTimer();
      expect(state.timer.isExpired).toBe(true);

      const back = state.rewindToStage(0);
      expect(back.timer.remainingSeconds).toBe(600); // BR60S unscored = 600s
      expect(back.timer.totalSeconds).toBe(600);
    });

    it('returns to stage 0 without default argument', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer().advanceToNextStage();
      expect(state.currentStageIndex).toBe(1);

      const back = state.rewindToStage();
      expect(back.currentStageIndex).toBe(0);
    });
  });

  describe('immutability', () => {
    it('properties are read-only', () => {
      const state = createIdleState();
      expect(() => {
        (state as any).phase = 'ACTIVE';
      }).toThrow();
    });

    it('state transition methods do not modify the original instance', () => {
      const state = createIdleState();
      const active = state.startStage();
      expect(state.phase).toBe('IDLE');
      expect(active.phase).toBe('ACTIVE');
    });
  });

  // ============================
  // Invalid state transition error cases
  // ============================
  describe('invalid state transition error cases', () => {
    it('startStage() from SERIES_COMPLETE is an error', () => {
      const state = createIdleState().startStage().expireTimer();
      expect(state.phase).toBe('SERIES_COMPLETE');
      try {
        state.startStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('startStage() from STAGE_ENTERED is an error', () => {
      let state = createIdleState().startStage();
      state = state.expireTimer();
      state = state.advanceToNextStage();
      expect(state.phase).toBe('STAGE_ENTERED');
      try {
        state.startStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('recordShotInSeries() from SERIES_COMPLETE is an error', () => {
      const state = createIdleState().startStage().expireTimer();
      expect(state.phase).toBe('SERIES_COMPLETE');
      try {
        state.recordShotInSeries();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('recordShotInSeries() from FINISHED is an error', () => {
      const state = createIdleState().finish();
      try {
        state.recordShotInSeries();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('COMPETITION_ALREADY_FINISHED');
      }
    });

    it('expireTimer() from SERIES_COMPLETE is an error', () => {
      const state = createIdleState().startStage().expireTimer();
      expect(state.phase).toBe('SERIES_COMPLETE');
      try {
        state.expireTimer();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('INVALID_PHASE_TRANSITION');
      }
    });

    it('expireTimer() from FINISHED is an error', () => {
      const state = createIdleState().finish();
      try {
        state.expireTimer();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('COMPETITION_ALREADY_FINISHED');
      }
    });

    it('advanceToNextStage() from IDLE is an error', () => {
      const state = createIdleState();
      try {
        state.advanceToNextStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('SERIES_NOT_COMPLETE');
      }
    });

    it('advanceToNextStage() from FINISHED is an error', () => {
      const state = createIdleState().finish();
      try {
        state.advanceToNextStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('COMPETITION_ALREADY_FINISHED');
      }
    });

    it('startNextSeries() from FINISHED is an error', () => {
      const state = createIdleState().finish();
      try {
        state.startNextSeries();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('COMPETITION_ALREADY_FINISHED');
      }
    });

    it('startStage() from FINISHED is an error', () => {
      const state = createIdleState().finish();
      try {
        state.startStage();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('COMPETITION_ALREADY_FINISHED');
      }
    });
  });
});
