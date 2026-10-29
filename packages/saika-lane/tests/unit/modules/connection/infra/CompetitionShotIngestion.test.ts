// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecordShotToken, SwitchModeToken } from '@/main/composition/tokens';
import { createShotRecordedHandler } from '@/main/modules/competition/application/CompetitionEventHandlers';
import { createGetCompetitionStateHandler } from '@/main/modules/competition/application/handlers/GetCompetitionStateHandler';
import { createSetAthleteTargetModeHandler } from '@/main/modules/competition/application/handlers/SetAthleteTargetModeHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { AR60_FINAL, BR60S, R3P60 } from '@/main/modules/competition/domain/competitionTypes';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { CompetitionInterruptionService, type LaneInterruptionRecord } from '@/main/modules/competition-interruption';
import { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import { createShotIngestionHandler } from '@/main/modules/connection/infra/ShotIngestionHandler';
import { resolveCompetitionShotPlacement } from '@/main/modules/mqtt/application/ShotCompetitionPlacement';
import { createRecordShotHandler } from '@/main/modules/session/application/handlers/RecordShotHandler';
import { createSwitchModeHandler } from '@/main/modules/session/application/handlers/SwitchModeHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { ScoreDiscrepancyDetector } from '@/main/modules/session/domain/ScoreDiscrepancyDetector';
import { Session } from '@/main/modules/session/domain/Session';
import { ScoreCalculationServiceImpl } from '@/main/modules/session/infra/ScoreCalculationServiceImpl';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

import {
  createMockCompetitionRepository,
  createMockShotObservationRepository,
} from '../../../../helpers/mockDependencies';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
const close: Array<() => void> = [];
afterEach(() => close.splice(0).forEach((release) => release()));

async function setup(type = BR60S) {
  const db = createSqliteDb(':memory:');
  close.push(() => db.close());
  const sessions = new SqliteSessionRepository(db);
  const session = Session.create(Discipline.fromValue(type.discipline)).resumeMode(Mode.match());
  await sessions.save(session);
  let competition = CompetitionState.create(randomUUID(), session.id, type.config)
    .startStage()
    .endStage()
    .advanceToNextStage()
    .startNextSeries();
  const competitions = createMockCompetitionRepository();
  competitions.findActive = vi.fn(async () => competition);
  competitions.findById = vi.fn(async () => competition);
  competitions.save = vi.fn(async (state) => {
    competition = state;
  });
  const events = new TypedEventBus();
  const commands = new CommandBus();
  commands.register(
    RecordShotToken,
    createRecordShotHandler(sessions, new ScoreCalculationServiceImpl(), events, {
      detect: vi.fn(),
    } as unknown as ScoreDiscrepancyDetector),
  );
  commands.register(SwitchModeToken, createSwitchModeHandler(sessions, events));
  let record: LaneInterruptionRecord | null = null;
  const interruption = new CompetitionInterruptionService(
    {
      findByCompetitionId: () => record,
      save: (value) => {
        record = value;
      },
      delete: () => {
        record = null;
      },
    },
    competitions,
    {
      stop: vi.fn(),
      pause: async () => ({ remainingSeconds: 2100, totalSeconds: 2700 }),
      resumeAt: async () => undefined,
    } as unknown as LaneTimerService,
    commands,
    events,
    sessions,
  );
  let progress = Promise.resolve();
  const recordProgress = createShotRecordedHandler({ competitionRepository: competitions, eventBus: events });
  events.on('ShotRecorded', (event) => {
    progress = recordProgress(event);
  });
  const ingest = createShotIngestionHandler({
    commandBus: commands,
    sessionRepository: sessions,
    competitionRepository: competitions,
    shotObservationRepository: createMockShotObservationRepository(),
    interruptionReader: interruption,
  });
  return {
    sessions,
    session,
    competitions,
    events,
    interruption,
    get competition() {
      return competition;
    },
    set competition(value: CompetitionState) {
      competition = value;
    },
    async fire(mode: 'MATCH' | 'SIGHTING' = 'MATCH') {
      await ingest({ x: 1, y: 1, score: 100, timestamp: new Date(), mode });
      await progress;
      return (await sessions.findById(session.id))!;
    },
  };
}

describe('competition shot acquisition and persistence', () => {
  it('records ordinary MATCH shots during a restart hold without treating it as a safety interlock', async () => {
    const rig = await setup();
    await rig.interruption.holdAfterRestart(rig.competition, 2100, true);
    const session = await rig.fire();
    expect(rig.interruption.get(rig.competition.id)).toMatchObject({ status: 'PAUSED', restartHold: true });
    expect(session.allShots).toHaveLength(1);
    expect(session.allShots[0]!.mode.value).toBe('MATCH');
    expect(session.totalScore).toBe(100);
    expect(rig.competition.seriesShotCount).toBe(1);
  });
  it('keeps authorized recovery sighting out of MATCH score and shot progress until explicit resume', async () => {
    const rig = await setup();
    await rig.fire();
    const interruptionId = randomUUID();
    await rig.interruption.pause({ competitionId: rig.competition.id, interruptionId, pausedAt: new Date() });
    await rig.interruption.resume({
      competitionId: rig.competition.id,
      interruptionId,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 2100,
      unlimitedSightingShots: true,
    });
    const sighting = await rig.fire('MATCH');
    expect(sighting.mode.value).toBe('SIGHTING');
    expect(sighting.allShots.at(-1)!.mode.value).toBe('SIGHTING');
    expect(sighting.totalScore).toBe(100);
    expect(rig.competition.seriesShotCount).toBe(1);
    await rig.interruption.resumeMatch({ competitionId: rig.competition.id, interruptionId });
    const resumed = await rig.fire('SIGHTING');
    expect(resumed.allShots.at(-1)!.mode.value).toBe('MATCH');
    expect(resumed.totalScore).toBe(200);
    expect(rig.competition.seriesShotCount).toBe(2);
  });

  it('excludes authorized interruption shots from the observed ATHLETE mode after resuming Match', async () => {
    const rig = await setup(R3P60);
    for (let i = 0; i < 20; i++) rig.competition = rig.competition.recordShotInSeries();
    const cache = new SessionContextCache(rig.events);
    cache.subscribeEvents(vi.fn());
    await cache.bootstrap(rig.sessions, rig.competitions);
    const interruptionId = randomUUID();
    await rig.interruption.pause({
      competitionId: rig.competition.id,
      interruptionId,
      pausedAt: new Date(Date.now() - 6 * 60_000),
    });
    await rig.interruption.resume({
      competitionId: rig.competition.id,
      interruptionId,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 2100,
      unlimitedSightingShots: true,
    });
    const sighting = await rig.fire('MATCH');
    expect(sighting.allShots.at(-1)!.mode.value).toBe('SIGHTING');
    expect(sighting.allShots.at(-1)!.competitionContext?.athleteModeObserved).toBeUndefined();
    expect(rig.competition.seriesShotCount).toBe(0);
    await rig.interruption.resumeMatch({ competitionId: rig.competition.id, interruptionId });
    const query = createGetCompetitionStateHandler(rig.competitions, rig.sessions, rig.interruption);
    expect(cache.getContext().mode.value).toBe('MATCH');
    expect((await query({ competitionId: rig.competition.id })).athleteTargetControl).toMatchObject({
      selected: null,
      effective: 'MATCH',
    });
    const matched = await rig.fire('MATCH');
    expect(matched.allShots.at(-1)!.competitionContext?.athleteModeObserved).toBe(true);
    expect(rig.competition.seriesShotCount).toBe(1);
    expect((await query({ competitionId: rig.competition.id })).athleteTargetControl).toMatchObject({
      sightingAllowed: false,
      effective: 'MATCH',
    });
  });

  it('keeps a pre-cutoff Lane selection in the cache when interruption Match fire resumes', async () => {
    const rig = await setup(R3P60);
    for (let i = 0; i < 20; i++) rig.competition = rig.competition.recordShotInSeries();
    const cache = new SessionContextCache(rig.events);
    cache.subscribeEvents(vi.fn());
    await cache.bootstrap(rig.sessions, rig.competitions);
    await createSetAthleteTargetModeHandler(
      rig.competitions,
      rig.events,
      rig.interruption,
    )({
      competitionId: rig.competition.id,
      stageIndex: rig.competition.currentStageIndex,
      seriesIndex: rig.competition.currentSeriesIndex,
      mode: 'SIGHTING',
    });
    const interruptionId = randomUUID();
    await rig.interruption.pause({ competitionId: rig.competition.id, interruptionId, pausedAt: new Date() });
    await rig.interruption.resume({
      competitionId: rig.competition.id,
      interruptionId,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 2100,
      unlimitedSightingShots: true,
    });
    await rig.interruption.resumeMatch({ competitionId: rig.competition.id, interruptionId });
    expect(cache.getContext().mode.value).toBe('SIGHTING');
    expect(rig.competition.athleteTargetMode).toBe('SIGHTING');
    const sighting = await rig.fire('MATCH');
    expect(sighting.allShots.at(-1)!.competitionContext?.athleteModeObserved).toBe(true);
    expect(sighting.allShots.at(-1)!.mode.value).toBe('SIGHTING');
    expect(sighting.totalScore).toBe(0);
    expect(rig.competition.seriesShotCount).toBe(0);
  });

  it('captures series positions before progress changes and retains incomplete boundaries after SQLite reload', async () => {
    const rig = await setup(AR60_FINAL);
    for (let index = 0; index < 3; index++) await rig.fire();
    rig.competition = rig.competition.expireTimer().advanceToNextStage().startNextSeries();
    const reloaded = await rig.fire();
    const latest = reloaded.allShots.at(-1)!;
    expect(latest.seriesNumber).toBe(1);
    expect(latest.competitionContext).toEqual({ competitionId: rig.competition.id, stageIndex: 1, seriesIndex: 1 });
    expect(resolveCompetitionShotPlacement(latest, reloaded.allShots, rig.competition)).toEqual({
      stageIndex: 1,
      seriesIndex: 1,
      shotNumberInSeries: 1,
    });
  });
});
