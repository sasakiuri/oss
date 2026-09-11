// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPhaseChangedHandler,
  createShotRecordedHandler,
} from '@/main/modules/competition/application/CompetitionEventHandlers';
import { createAdvanceStageHandler } from '@/main/modules/competition/application/handlers/AdvanceStageHandler';
import { createStartNextSeriesHandler } from '@/main/modules/competition/application/handlers/StartNextSeriesHandler';
import { SessionLifecycleService } from '@/main/modules/competition/application/SessionLifecycleService';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { AP60_FINAL, AR60_FINAL, BP60_FINAL, BR60S_FINAL } from '@/main/modules/competition/domain/competitionTypes';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';

import { createMockSessionRepository, createMockStorage } from '../../../../helpers/mockDependencies';

describe('Final single-shot timer lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([BR60S_FINAL, BP60_FINAL, AR60_FINAL, AP60_FINAL])(
    'starts, expires and resets each $id single-shot window through competition events',
    async (definition) => {
      const repository = new CompetitionRepositoryImpl(createMockStorage());
      const events = new TypedEventBus();
      const timer = new LaneTimerService(repository, events);
      const lifecycle = new SessionLifecycleService(createMockSessionRepository(), events);
      const advance = createAdvanceStageHandler(repository, lifecycle, events);
      const start = createStartNextSeriesHandler(repository, events);
      const expired = vi.fn();
      events.on('PhaseChanged', createPhaseChangedHandler({ competitionRepository: repository, timerService: timer }));
      events.on('ShotRecorded', createShotRecordedHandler({ competitionRepository: repository, eventBus: events }));
      events.on('TimerExpired', expired);

      // Finish both five-shot series before their deadlines, leaving the old
      // 250-second value persisted when the single-shot stage is entered.
      let state = CompetitionState.create('final', 'session', definition.config)
        .startStage()
        .endStage()
        .advanceToNextStage()
        .startNextSeries();
      for (let series = 0; series < 2; series++) {
        for (let shot = 0; shot < 5; shot++) state = state.recordShotInSeries();
        if (series === 0) state = state.advanceToNextStage().startNextSeries();
      }
      await repository.save(state);

      const startFollowingShot = async () => {
        await advance({ competitionId: state.id });
        await start({ competitionId: state.id });
        await vi.advanceTimersByTimeAsync(0);
        expect(timer.sample(state.id)).toMatchObject({ running: true, remainingMs: 50_000 });
        expect((await repository.findById(state.id))?.timer).toMatchObject({
          remainingSeconds: 50,
          totalSeconds: 50,
        });
      };

      try {
        await startFollowingShot();
        await vi.advanceTimersByTimeAsync(49_999);
        expect((await repository.findById(state.id))?.phase).toBe('ACTIVE');
        expect(expired).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(expired).toHaveBeenCalledOnce();
        const completed = (await repository.findById(state.id))!;
        expect(completed.phase).toBe('SERIES_COMPLETE');
        expect(completed.canAcceptShot()).toBe(false);
        expect(timer.sample(state.id)).toMatchObject({ running: false, remainingMs: 0 });

        // The next window resets an expired timer; a later one also resets a
        // partially elapsed timer after its shot completes the series early.
        await startFollowingShot();
        await vi.advanceTimersByTimeAsync(17_000);
        expect(timer.sample(state.id)?.remainingMs).toBe(33_000);
        const shotCompleted = new Promise<void>((resolve) => {
          const stop = events.on('SeriesCompleted', () => {
            stop();
            resolve();
          });
        });
        events.emit({
          type: 'ShotRecorded',
          timestamp: Date.now(),
          aggregateId: 'session',
          scoringMode: 'DECIMAL',
          shot: Shot.create({
            impactPoint: null,
            score: new Score(0),
            mode: Mode.match(),
            timestamp: new Date(),
            shotNumber: 11,
            seriesNumber: 2,
            innerTen: false,
          }),
        });
        await shotCompleted;
        await startFollowingShot();
        expect((await repository.findById(state.id))?.currentSeriesIndex).toBe(2);
      } finally {
        timer.stop();
        events.clear();
      }
    },
  );
});
