// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecordShotToken, SwitchModeToken } from '@/main/composition/tokens';
import { createShotRecordedHandler } from '@/main/modules/competition/application/CompetitionEventHandlers';
import { createSetAthleteTargetModeHandler } from '@/main/modules/competition/application/handlers/SetAthleteTargetModeHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { resolveCompetitionTargetMode } from '@/main/modules/competition/domain/CompetitionTargetModePolicy';
import { ALL_COMPETITION_TYPES, AR60, R3P60, R3P_FINAL } from '@/main/modules/competition/domain/competitionTypes';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { CompetitionInterruptionService, type LaneInterruptionRecord } from '@/main/modules/competition-interruption';
import { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import { createShotIngestionHandler } from '@/main/modules/connection/infra/ShotIngestionHandler';
import { CompetitionShotPublisher } from '@/main/modules/mqtt/application/CompetitionShotPublisher';
import { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { createGetShotHistoryHandler } from '@/main/modules/session/application/handlers/GetShotHistoryHandler';
import { createRecordShotHandler } from '@/main/modules/session/application/handlers/RecordShotHandler';
import { createSwitchModeHandler } from '@/main/modules/session/application/handlers/SwitchModeHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ScoreDiscrepancyDetector } from '@/main/modules/session/domain/ScoreDiscrepancyDetector';
import { Session } from '@/main/modules/session/domain/Session';
import { ScoreCalculationServiceImpl } from '@/main/modules/session/infra/ScoreCalculationServiceImpl';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { laneVistaDefinition, projectLaneVista } from '@/main/modules/vista/application/LaneVistaProjection';
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

import { createMockCompetitionRepository, createMockStorage } from '../../../../helpers/mockDependencies';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));
const releases: Array<() => void> = [];
afterEach(() => releases.splice(0).forEach((release) => release()));

async function setup(type = R3P60) {
  const db = createSqliteDb(':memory:');
  releases.push(() => db.close());
  const sessions = new SqliteSessionRepository(db);
  const observations = new SqliteShotObservationRepository(db);
  const session = Session.create(Discipline.fromValue(type.discipline), type.config.acc);
  await sessions.save(session);
  let state = CompetitionState.create(randomUUID(), session.id, type.config)
    .startStage()
    .endStage()
    .advanceToNextStage()
    .startNextSeries();
  const competitions = createMockCompetitionRepository();
  vi.mocked(competitions.findActive).mockImplementation(async () => state);
  vi.mocked(competitions.findById).mockImplementation(async () => state);
  vi.mocked(competitions.save).mockImplementation(async (next) => {
    state = next;
  });
  const events = new TypedEventBus();
  const commands = new CommandBus();
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
  commands.register(SwitchModeToken, createSwitchModeHandler(sessions, events));
  let interruption: LaneInterruptionRecord | null = null;
  const interruptions = new CompetitionInterruptionService(
    {
      findByCompetitionId: () => interruption,
      save: (next) => {
        interruption = next;
      },
      delete: () => {
        interruption = null;
      },
    },
    competitions,
    {
      stop: vi.fn(),
      pause: async () => ({ remainingSeconds: 600, totalSeconds: 1320 }),
      resumeAt: async () => undefined,
    } as unknown as LaneTimerService,
    commands,
    events,
    sessions,
  );
  const ingest = createShotIngestionHandler({
    commandBus: commands,
    sessionRepository: sessions,
    competitionRepository: competitions,
    shotObservationRepository: observations,
    eventBus: events,
    interruptionReader: interruptions,
  });
  const publish = vi.fn().mockResolvedValue(undefined);
  const mqtt = { isConnected: () => true, publish } as unknown as IMqttClientService;
  const storage = createMockStorage();
  storage.set('mqtt.laneId', randomUUID());
  new CompetitionShotPublisher(mqtt, events, storage, competitions, sessions);
  new LaneScorePublisher(mqtt, events, storage, competitions, sessions);
  const select = createSetAthleteTargetModeHandler(competitions, events, interruptions, sessions);
  return {
    db,
    session,
    sessions,
    observations,
    competitions,
    events,
    interruptions,
    publish,
    get state() {
      return state;
    },
    fireUnreported: () => ingest({ x: 0, y: 0, score: 100, timestamp: new Date() }),
    fire: (mode: 'MATCH' | 'SIGHTING' = 'MATCH') => ingest({ x: 0, y: 0, score: 100, mode, timestamp: new Date() }),
    select: (mode: 'MATCH' | 'SIGHTING') =>
      select({
        competitionId: state.id,
        stageIndex: state.currentStageIndex,
        seriesIndex: state.currentSeriesIndex,
        mode,
      }),
    read: async () => (await sessions.findById(session.id))!,
    control: async () =>
      resolveCompetitionTargetMode(state, (await sessions.findById(session.id))!.allShots, interruptions.get(state.id)),
  };
}
const eventCodes = [
  'R3P60',
  'R3P60_INDOOR',
  'R3P60_ELIMINATION',
  'R300_3P60',
  'R300_3P60_ELIMINATION',
  'R300_STD60',
  'R300_STD60_ELIMINATION',
  'R3P_FINAL',
];

async function enterProne(rig: Awaited<ReturnType<typeof setup>>) {
  const count = rig.state.config.round === 'FINAL' ? 10 : 20;
  for (let i = 0; i < count; i++) await rig.fire();
  expect(rig.state.currentSeriesConfig).toMatchObject({ targetModeControl: 'ATHLETE', position: 'PRONE' });
  return count;
}

describe('forgotten position-change target switch', () => {
  it.each(eventCodes)(
    'nullifies the first extra and resets Sighting without a score or slot in %s',
    async (eventCode) => {
      const rig = await setup(ALL_COMPETITION_TYPES.find((type) => type.id === eventCode)!);
      const count = await enterProne(rig);
      const timer = rig.state.timer;
      expect((await rig.control()).athleteTargetControl).toMatchObject({
        sightingAllowed: true,
        matchAllowed: false,
        matchUnavailableReason: 'SIGHTING_REQUIRED',
      });
      await expect(rig.select('MATCH')).rejects.toMatchObject({ code: 'ATHLETE_SIGHTING_REQUIRED' });
      rig.publish.mockClear();
      const reset = vi.fn();
      rig.events.on('AthleteTargetModeChanged', reset);
      await rig.fire();
      expect((await rig.read()).allShots).toHaveLength(count);
      expect(rig.state.seriesShotCount).toBe(0);
      expect(rig.state.timer).toBe(timer);
      expect(rig.state.athleteTargetMode).toBe('SIGHTING');
      expect(reset).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ newMode: expect.objectContaining({ value: 'SIGHTING' }) }),
      );
      expect(rig.publish.mock.calls.filter(([topic]) => topic.endsWith('/shot') || topic.endsWith('/score'))).toEqual(
        [],
      );
      const history = await createGetShotHistoryHandler(
        rig.sessions,
        rig.observations,
        rig.competitions,
      )({ sessionId: rig.session.id });
      expect(history.nullifiedExtras).toEqual([
        expect.objectContaining({
          previousPositionLabel: 'previous Kneeling position',
          reportedMode: 'MATCH',
          deviceScoreX10: 100,
        }),
      ]);
      expect(history.nullifiedExtras[0]!.detail).toContain('ISSF 6.10.4(c) / 7.7.3');
      await rig.fire();
      expect((await rig.read()).allShots.at(-1)!).toMatchObject({
        shotNumber: count + 1,
        mode: expect.objectContaining({ value: 'SIGHTING' }),
      });
      expect(rig.state.seriesShotCount).toBe(0);
      await rig.select('MATCH');
      await rig.fire();
      expect(rig.state.seriesShotCount).toBe(1);
      expect((await rig.read()).totalScore).toBe((count + 1) * 100);
      expect((await rig.control()).athleteTargetControl!.sightingAllowed).toBe(false);
    },
  );

  it('keeps one nullified outcome and visibly reports a failed Sighting reset save', async () => {
    const rig = await setup();
    await enterProne(rig);
    const notification = vi.fn(),
      modeChanged = vi.fn();
    rig.events.on('PositionExtraNullified', notification);
    rig.events.on('AthleteTargetModeChanged', modeChanged);
    vi.mocked(rig.competitions.save).mockRejectedValueOnce(new Error('Selection write failed'));
    await rig.fire();
    const extras = await rig.observations.findBySessionAndOutcome(rig.session.id, 'NULLIFIED_POSITION_EXTRA');
    expect(extras).toHaveLength(1);
    expect(await rig.observations.findOutcomes(extras[0]!.observationId)).toEqual([
      expect.objectContaining({ type: 'NULLIFIED_POSITION_EXTRA' }),
    ]);
    expect(notification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        resetError: expect.stringContaining('Sighting reset failed'),
      }),
    );
    expect(modeChanged).not.toHaveBeenCalled();
    expect(rig.state.athleteTargetMode).toBeUndefined();
    expect((await rig.read()).shotCount).toBe(20);
    expect((await rig.control()).athleteTargetControl!.matchAllowed).toBe(false);
    await rig.select('SIGHTING');
    expect(rig.state.athleteTargetMode).toBe('SIGHTING');
    expect((await rig.control()).athleteTargetControl!.matchAllowed).toBe(true);
    expect(await rig.observations.findOutcomes(extras[0]!.observationId)).toHaveLength(1);
  });

  it('keeps a failed reset unswitched when caching and retries on the next Match observation', async () => {
    const rig = await setup();
    await enterProne(rig);
    vi.mocked(rig.competitions.save).mockRejectedValueOnce(new Error('Selection save failed'));
    await rig.fire();
    const firstExtra = (await rig.observations.findBySessionAndOutcome(rig.session.id, 'NULLIFIED_POSITION_EXTRA'))[0]!;
    expect((await rig.control()).athleteTargetControl).toMatchObject({
      sightingAllowed: true,
      matchAllowed: false,
      matchUnavailableReason: 'SIGHTING_REQUIRED',
    });
    await expect(rig.select('MATCH')).rejects.toMatchObject({ code: 'ATHLETE_SIGHTING_REQUIRED' });
    const notification = vi.fn();
    rig.events.on('PositionExtraNullified', notification);
    vi.mocked(rig.competitions.save).mockClear();
    const context = new SessionContextCache(rig.events);
    await context.bootstrap(rig.sessions, rig.competitions);
    expect(context.getContext().mode.value).toBe('MATCH');
    expect(rig.competitions.save).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
    expect(rig.state.athleteTargetMode).toBeUndefined();
    await rig.fire();
    expect(rig.state.athleteTargetMode).toBe('SIGHTING');
    expect((await rig.read()).shotCount).toBe(20);
    expect(rig.state.seriesShotCount).toBe(0);
    const extras = await rig.observations.findBySessionAndOutcome(rig.session.id, 'NULLIFIED_POSITION_EXTRA');
    expect(extras).toHaveLength(2);
    expect(new Set(extras.map((extra) => extra.observationId)).size).toBe(2);
    expect(await rig.observations.findOutcomes(firstExtra.observationId)).toHaveLength(1);
    expect(await rig.observations.findOutcomes(extras[1]!.observationId)).toHaveLength(1);
    expect(notification).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ competitionId: rig.state.id }));
    expect(notification.mock.calls[0]![0].resetError).toBeUndefined();
  });

  it('awaits the last K2 progress before queued frames: one extra, then only sighters', async () => {
    const rig = await setup();
    for (let i = 0; i < 19; i++) await rig.fire();
    await Promise.all([rig.fire(), rig.fire(), rig.fire(), rig.fire()]);
    const session = await rig.read();
    expect(session.matchShots).toHaveLength(20);
    expect(session.sightingShots).toHaveLength(2);
    expect(session.shotCount).toBe(22);
    expect(session.allShots.map((shot) => shot.shotNumber)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(await rig.observations.findBySessionAndOutcome(session.id, 'NULLIFIED_POSITION_EXTRA')).toHaveLength(1);
    expect(rig.state.currentSeriesIndex).toBe(2);
    expect(rig.state.seriesShotCount).toBe(0);
  });

  it.each(eventCodes)(
    'checks the second position boundary and the sighting-only Final Standing in %s',
    async (eventCode) => {
      const type = ALL_COMPETITION_TYPES.find((entry) => entry.id === eventCode)!;
      const rig = await setup(type);
      await enterProne(rig);
      await rig.select('SIGHTING');
      await rig.select('MATCH');
      const final = type === R3P_FINAL;
      for (let i = 0; i < (final ? 10 : 20); i++) await rig.fire();
      await rig.fire();
      const extras = await rig.observations.findBySessionAndOutcome(rig.session.id, 'NULLIFIED_POSITION_EXTRA');
      expect(extras).toHaveLength(final ? 0 : 1);
      expect(extras.map((extra) => extra.detail?.includes('Prone'))).toEqual(final ? [] : [true]);
      expect(rig.state.seriesShotCount).toBe(0);
      expect(rig.state.currentSeriesConfig.purpose ?? 'MATCH').toBe(final ? 'POSITION_CHANGE_AND_SIGHTING' : 'MATCH');
      expect((await rig.read()).allShots.at(-1)!.mode.value).toBe(final ? 'SIGHTING' : 'MATCH');
      expect((await rig.control()).athleteTargetControl!.matchAllowed).toBe(!final);
    },
  );

  it('treats a missing device mode as Match before the required switch', async () => {
    const rig = await setup();
    await enterProne(rig);
    await rig.fireUnreported();
    const extras = await rig.observations.findBySessionAndOutcome(rig.session.id, 'NULLIFIED_POSITION_EXTRA');
    expect(extras).toHaveLength(1);
    expect(extras[0]!.reportedMode).toBeNull();
    expect(rig.state.athleteTargetMode).toBe('SIGHTING');
    expect((await rig.read()).matchShots).toHaveLength(20);
  });

  it('permits 1 then 2 without any sighter and permits device Sighting then 2', async () => {
    for (const deviceSighting of [false, true]) {
      const rig = await setup();
      await enterProne(rig);
      if (deviceSighting) await rig.fire('SIGHTING');
      else await rig.select('SIGHTING');
      await rig.select('MATCH');
      await rig.fire();
      expect(rig.state.seriesShotCount).toBe(1);
      expect(await rig.observations.findBySessionAndOutcome(rig.session.id, 'NULLIFIED_POSITION_EXTRA')).toEqual([]);
    }
  });

  it('official sighting supplies the commanded selection across resumeMatch', async () => {
    const rig = await setup();
    await enterProne(rig);
    const interruptionId = randomUUID();
    await rig.interruptions.pause({ competitionId: rig.state.id, interruptionId, pausedAt: new Date() });
    await rig.interruptions.resume({
      competitionId: rig.state.id,
      interruptionId,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 600,
      unlimitedSightingShots: true,
    });
    await rig.fire('MATCH');
    await rig.interruptions.resumeMatch({ competitionId: rig.state.id, interruptionId });
    await rig.fire('MATCH');
    expect((await rig.read()).sightingShots).toHaveLength(2);
    await rig.select('MATCH');
    await rig.fire();
    expect(rig.state.seriesShotCount).toBe(1);
    expect(await rig.observations.findBySessionAndOutcome(rig.session.id, 'NULLIFIED_POSITION_EXTRA')).toEqual([]);
  });

  it('restores the saved selection after nullification and keeps generic Vista totals clean', async () => {
    const rig = await setup();
    await enterProne(rig);
    await rig.fire();
    const storage = createMockStorage();
    await new CompetitionRepositoryImpl(storage).save(rig.state);
    const restored = (await new CompetitionRepositoryImpl(storage).findActive())!;
    const cache = new SessionContextCache(rig.events);
    await cache.bootstrap(rig.sessions, new CompetitionRepositoryImpl(storage));
    expect(cache.getContext().mode.value).toBe('SIGHTING');
    expect(
      resolveCompetitionTargetMode(restored, (await rig.read()).allShots, null).athleteTargetControl!.matchAllowed,
    ).toBe(true);
    const definitionSession = Session.create(Discipline.airRifle10m());
    const definition = laneVistaDefinition(
      CompetitionState.create('definition', definitionSession.id, AR60.config),
      definitionSession,
    )!;
    const session = await rig.read();
    rig.db
      .prepare('UPDATE shot_observation_evidence_outbox SET published_at = ? WHERE published_at IS NULL')
      .run(new Date().toISOString());
    expect(await rig.observations.findBySessionAndOutcome(session.id, 'NULLIFIED_POSITION_EXTRA')).toHaveLength(1);
    const snapshot = projectLaneVista({
      sourceId: 'lane-1',
      competition: restored,
      session,
      definition,
      history: [{ session, stage: 1, shotContexts: new Map(), shootOffSeries: new Map() }],
      historyComplete: true,
      generation: 'generation',
      revision: 1,
      laneName: 'Lane 1',
      clock: null,
      interruption: null,
      shootOffSeries: null,
    });
    expect(snapshot.participants[0]).toMatchObject({ total: 200, shotCount: 20, mode: 'sighting' });
    expect(laneVistaDefinition(restored, session)).toBeNull();
  });
});
