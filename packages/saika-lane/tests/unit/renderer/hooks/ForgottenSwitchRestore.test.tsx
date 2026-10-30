// SPDX-License-Identifier: MIT
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { RecordShotToken } from '@/main/composition/tokens';
import { createShotRecordedHandler } from '@/main/modules/competition/application/CompetitionEventHandlers';
import { createGetCompetitionStateHandler } from '@/main/modules/competition/application/handlers/GetCompetitionStateHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { R3P60 } from '@/main/modules/competition/domain/competitionTypes';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { CompetitionInterruptionService } from '@/main/modules/competition-interruption/application/CompetitionInterruptionService';
import { LocalCompetitionInterruptionRepository } from '@/main/modules/competition-interruption/infra/LocalCompetitionInterruptionRepository';
import { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import { createShotIngestionHandler } from '@/main/modules/connection/infra/ShotIngestionHandler';
import { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import { createGetSessionScoreHandler } from '@/main/modules/session/application/handlers/GetSessionScoreHandler';
import { createGetShotHistoryHandler } from '@/main/modules/session/application/handlers/GetShotHistoryHandler';
import { createRecordShotHandler } from '@/main/modules/session/application/handlers/RecordShotHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ScoreDiscrepancyDetector } from '@/main/modules/session/domain/ScoreDiscrepancyDetector';
import { Session } from '@/main/modules/session/domain/Session';
import { ScoreCalculationServiceImpl } from '@/main/modules/session/infra/ScoreCalculationServiceImpl';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import { ActiveRunStartup } from '@/main/startup/restoreActiveRun';
import { ShotHistory } from '@/renderer/presentation/components/side-panel/ShotHistory';
import { useAppNavigation } from '@/renderer/presentation/hooks/useAppNavigation';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

import { createMockStorage } from '../../../helpers/mockDependencies';
import { createMockElectronAPI } from '../../../helpers/mockElectronAPI';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function RestoredHistory() {
  const { screen: activeScreen } = useAppNavigation();
  const { shots, nullifiedExtras } = useSessionStore();
  const acc = useCompetitionStore((state) => state.acc);
  return activeScreen === 'main' ? <ShotHistory shots={shots} nullifiedExtras={nullifiedExtras} acc={acc} /> : null;
}

it.each([false, true])(
  'restores and hydrates the saved switch requirement after X (reset save failed=%s)',
  async (resetFailed) => {
    vi.useFakeTimers();
    const db = createSqliteDb(':memory:');
    const storage = createMockStorage();
    const sessions = new SqliteSessionRepository(db);
    const competitions = new CompetitionRepositoryImpl(storage);
    const observations = new SqliteShotObservationRepository(db);
    const events = new TypedEventBus();
    const commands = new CommandBus();
    const session = Session.create(Discipline.rifle50m(), 'RING');
    await sessions.save(session);
    const active = CompetitionState.create(crypto.randomUUID(), session.id, R3P60.config)
      .startStage()
      .endStage()
      .advanceToNextStage()
      .startNextSeries();
    await competitions.save(active);
    commands.register(
      RecordShotToken,
      createRecordShotHandler(
        sessions,
        new ScoreCalculationServiceImpl(),
        events,
        new ScoreDiscrepancyDetector({ log: vi.fn() }),
        createShotRecordedHandler({ competitionRepository: competitions, eventBus: events }),
      ),
    );
    const ingest = createShotIngestionHandler({
      commandBus: commands,
      sessionRepository: sessions,
      competitionRepository: competitions,
      shotObservationRepository: observations,
      eventBus: events,
    });
    for (let index = 0; index < 20; index++) {
      await ingest({ x: 0, y: 0, score: 100, mode: 'MATCH', timestamp: new Date() });
      vi.setSystemTime(Date.now() + 1);
    }
    if (resetFailed)
      vi.mocked(storage.setMany).mockImplementationOnce(() => {
        throw new Error('Selection save failed');
      });
    await ingest({ x: 0, y: 0, score: 100, mode: 'MATCH', timestamp: new Date() });
    expect((await sessions.findById(session.id))!.shotCount).toBe(20);

    // Reconstruct the main services from persisted state, then use their real queries through the bridge.
    const restoredCompetitions = new CompetitionRepositoryImpl(storage);
    const restoredSessions = new SqliteSessionRepository(db);
    const restartEvents = new TypedEventBus();
    const resetNotification = vi.fn();
    restartEvents.on('PositionExtraNullified', resetNotification);
    const timer = new LaneTimerService(restoredCompetitions, restartEvents, storage);
    storage.set('competitionClock', {
      competitionId: active.id,
      expiresAtMs: Date.now() + 600_000,
      totalSeconds: active.timer.totalSeconds,
      stageTimerIndex: 1,
    });
    const interruptions = new CompetitionInterruptionService(
      new LocalCompetitionInterruptionRepository(storage),
      restoredCompetitions,
      timer,
      new CommandBus(),
      restartEvents,
      restoredSessions,
    );
    const context = new SessionContextCache(restartEvents);
    const createCompetition = vi.fn();
    const startup = new ActiveRunStartup({
      competitions: restoredCompetitions,
      sessions: restoredSessions,
      membership: new DirectorMembership(storage, restartEvents),
      timer,
      interruptions,
      context,
      safetyStopped: () => false,
      safetyCompetitionId: () => null,
      transferPending: () => false,
      createCompetition,
      setAsideActiveRun: () => restoredCompetitions.clearActivePointer(),
      restoreIndependentWorkflows: vi.fn(),
      stopIndependentWorkflows: vi.fn(),
    });
    const api = createMockElectronAPI();
    window.electronAPI = api as unknown as typeof window.electronAPI;
    api.startup.getStartupState.mockImplementation(async () => ({ success: true, data: await startup.restore() }));
    const queryState = createGetCompetitionStateHandler(restoredCompetitions, restoredSessions, interruptions);
    const queryHistory = createGetShotHistoryHandler(
      restoredSessions,
      new SqliteShotObservationRepository(db),
      restoredCompetitions,
    );
    const queryScore = createGetSessionScoreHandler(restoredSessions);
    api.competition.getCompetitionState.mockImplementation(async (input) => ({
      success: true,
      data: await queryState(input),
    }));
    api.queries.getShotHistory.mockImplementation(async (input) => ({
      success: true,
      data: await queryHistory(input),
    }));
    api.queries.getSessionScore.mockImplementation(async (input) => ({ success: true, data: await queryScore(input) }));
    useSessionStore.getState().resetSession();
    useCompetitionStore.getState().resetCompetition();
    const view = render(<RestoredHistory />);
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(startup.isReady()).toBe(true);
      expect(createCompetition).not.toHaveBeenCalled();
      expect(context.getContext().mode.value).toBe(resetFailed ? 'MATCH' : 'SIGHTING');
      expect(useCompetitionStore.getState()).toMatchObject({
        seriesIndex: 2,
        athleteTargetControl: {
          selected: resetFailed ? null : 'SIGHTING',
          effective: resetFailed ? 'MATCH' : 'SIGHTING',
          matchAllowed: !resetFailed,
          matchUnavailableReason: resetFailed ? 'SIGHTING_REQUIRED' : null,
        },
      });
      expect(useSessionStore.getState().nullifiedExtras).toHaveLength(1);
      const extra = (await observations.findBySessionAndOutcome(session.id, 'NULLIFIED_POSITION_EXTRA'))[0]!;
      expect(await observations.findOutcomes(extra.observationId)).toHaveLength(1);
      expect((await restoredCompetitions.findActive())!.athleteTargetMode).toBe(resetFailed ? undefined : 'SIGHTING');
      expect(resetNotification).not.toHaveBeenCalled();
      expect(screen.getByText(/Nullified extra — previous Kneeling position/)).toBeVisible();
      expect(screen.getByLabelText('No shot ordinal')).toHaveTextContent('—');
      expect(screen.getByText('Not scored · ISSF 6.10.4(c) / 7.7.3')).toBeVisible();
    } finally {
      view.unmount();
      timer.stop();
      db.close();
    }
  },
);
