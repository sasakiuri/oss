// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecordShotToken, SwitchModeToken, type SwitchModeInput } from '@/main/composition/tokens';
import { createShotRecordedHandler } from '@/main/modules/competition/application/CompetitionEventHandlers';
import { createGetCompetitionStateHandler } from '@/main/modules/competition/application/handlers/GetCompetitionStateHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { CompetitionTypeDefinition } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import { AR60, R3P60 } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { Timer } from '@/main/modules/competition/domain/Timer';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import { CompetitionInterruptionService } from '@/main/modules/competition-interruption/application/CompetitionInterruptionService';
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import { createShotIngestionHandler } from '@/main/modules/connection/infra/ShotIngestionHandler';
import { ReserveLaneTransferService } from '@/main/modules/reserve-lane-transfer/application/ReserveLaneTransferService';
import { ReserveTransferCommandGuard } from '@/main/modules/reserve-lane-transfer/infra/ReserveTransferCommandGuard';
import { SqliteReserveLaneTransferJournal } from '@/main/modules/reserve-lane-transfer/infra/SqliteReserveLaneTransferJournal';
import { StoredReserveLaneTransferState } from '@/main/modules/reserve-lane-transfer/infra/StoredReserveLaneTransferState';
import { LaneSafetyStopState } from '@/main/modules/safety-stop/domain/LaneSafetyStopState';
import { createRecordShotHandler } from '@/main/modules/session/application/handlers/RecordShotHandler';
import { createSwitchModeHandler } from '@/main/modules/session/application/handlers/SwitchModeHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import type { ScoreDiscrepancyDetector } from '@/main/modules/session/domain/ScoreDiscrepancyDetector';
import { Session } from '@/main/modules/session/domain/Session';
import { ScoreCalculationServiceImpl } from '@/main/modules/session/infra/ScoreCalculationServiceImpl';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { TypedEventBus, type IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import type { ReserveLaneTransferRequest } from '@/shared/mqtt/ReserveLaneTransfer';

import { athleteCompetition, selectAthlete } from '../../../helpers/athleteCompetition';
import { createMockShotObservationRepository } from '../../../helpers/mockDependencies';
import { projectVistaTargetMode } from '../../../helpers/projectVistaTargetMode';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

const competitionId = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const targetId = '33333333-3333-4333-8333-333333333333';
const request: ReserveLaneTransferRequest = {
  id: '44444444-4444-4444-8444-444444444444',
  competitionId,
  sourceLaneId: sourceId,
  destinationLaneId: targetId,
  officialName: 'Jury',
  statement: 'IR 12: target replacement',
};
const databases: Database.Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
async function lane(id: string, withShots: boolean, type: CompetitionTypeDefinition = AR60) {
  const db = createSqliteDb(':memory:');
  databases.push(db);
  const sessions = new SqliteSessionRepository(db);
  let session = Session.create(Discipline.fromValue(type.discipline)).resumeMode(Mode.match());
  if (withShots)
    session = session.recordShot(null, new Score(100), new Date(), new Score(100), false, undefined, {
      sourceObservationId: crypto.randomUUID(),
      competitionContext: { competitionId, stageIndex: 1, seriesIndex: 0 },
      calculatedScore: new Score(100),
    });
  await sessions.save(session);
  let state = CompetitionState.reconstruct({
    id: competitionId,
    sessionId: session.id,
    config: type.config,
    phase: 'ACTIVE',
    currentStageIndex: 1,
    currentSeriesIndex: 0,
    seriesShotCount: withShots ? 1 : 0,
    timer: Timer.reconstruct(240, 4500),
    startedAt: Date.now(),
    finishedAt: null,
  });
  const competitions = {
    findActive: async () => (state.phase === 'FINISHED' ? null : state),
    findById: async () => state,
    save: async (updated: CompetitionState) => {
      state = updated;
    },
  } as unknown as ICompetitionRepository;
  let assignment: { athlete: { id: string; name: string; startNumber: number } | null } = {
    athlete: withShots ? { id: 'athlete', name: 'Alex', startNumber: 1 } : null,
  };
  const stop = LaneSafetyStopState.create({
    safetyStopId: '55555555-5555-4555-8555-555555555555',
    status: 'STOPPED',
    reason: 'Transfer',
    stoppedBy: 'Jury',
    stoppedAt: new Date(),
    timerSnapshot: { competitionId, remainingSeconds: 240, totalSeconds: 4500, frozenAt: new Date() },
  });
  let stopped = true;
  const pause = vi.fn(async () => undefined);
  const events = { emit: vi.fn(), on: vi.fn() } as unknown as IEventBus;
  const port = new StoredReserveLaneTransferState(
    competitions,
    sessions,
    {
      read: () => assignment,
      restore: async (_id, json) => {
        assignment = json ? (JSON.parse(json) as typeof assignment) : { athlete: null };
      },
    },
    { getState: () => (stopped ? stop : null) },
    { get: () => null, pause } as unknown as ICompetitionInterruptionControl,
    events,
  );
  const journal = new SqliteReserveLaneTransferJournal(db);
  return {
    db,
    sessions,
    competitions,
    port,
    journal,
    service: new ReserveLaneTransferService(journal, port, () => id),
    state: () => state,
    setState: (updated: CompetitionState) => {
      state = updated;
    },
    original: session,
    clearStop: () => {
      stopped = false;
    },
    pause,
    events,
    assignment: () => assignment,
  };
}

describe('reserve Lane state transfer', () => {
  it('stages before retiring, preserves every shot identity and the frozen timer, and retries without rewinding the target', async () => {
    const source = await lane(sourceId, true),
      target = await lane(targetId, false);
    const bundle = await source.service.execute(competitionId, { operation: 'PREPARE_SOURCE', request });
    expect(JSON.parse(bundle.competitionJson).athleteTargetMode).toBeUndefined();
    expect(bundle.summary).toMatchObject({ matchShots: 1, totalScoreX10: 100, remainingSeconds: 240 });
    await target.service.execute(competitionId, { operation: 'STAGE_TARGET', bundle });
    expect(target.state().sessionId).toBe(target.original.id);
    expect(() => target.service.assertMutationAllowed()).toThrow(/pending reserve transfer/);
    await expect(
      new ReserveTransferCommandGuard(() => target.journal.pending()).execute(
        'ResetSession',
        { sessionId: target.original.id },
        async () => undefined,
      ),
    ).rejects.toThrow(/pending reserve transfer/);
    expect(source.state().phase).toBe('ACTIVE');
    await source.service.execute(competitionId, { operation: 'RETIRE_SOURCE', id: request.id, digest: bundle.digest });
    expect(source.state().phase).toBe('FINISHED');
    expect((await source.sessions.findById(source.original.id))!.allShots).toEqual(source.original.allShots);
    expect(source.assignment().athlete).toBeNull();
    const activate = {
      operation: 'ACTIVATE_TARGET' as const,
      id: request.id,
      digest: bundle.digest,
      sourceRetired: true as const,
    };
    await target.service.execute(competitionId, activate);
    expect(target.state()).toMatchObject({
      sessionId: source.original.id,
      phase: 'ACTIVE',
      currentStageIndex: 1,
      seriesShotCount: 1,
      athleteTargetMode: null,
      timer: { remainingSeconds: 240 },
    });
    expect(target.pause).toHaveBeenCalledWith(expect.objectContaining({ interruptionId: request.id }));
    const transferred = (await target.sessions.findById(source.original.id))!;
    expect(transferred.allShots).toEqual(source.original.allShots);
    const progressed = transferred.recordShot(null, new Score(90), new Date());
    await target.sessions.save(progressed);
    await new ReserveLaneTransferService(target.journal, target.port, () => targetId).execute(competitionId, activate);
    expect((await target.sessions.findById(source.original.id))!.shotCount).toBe(2);
    expect(target.pause).toHaveBeenCalledOnce();
    expect(() => target.db.exec('DELETE FROM reserve_lane_transfer_events')).toThrow(/append-only/);
  });

  it('retries source retirement against a snapshot without an athlete target-mode field', async () => {
    const source = await lane(sourceId, true);
    const bundle = await source.service.execute(competitionId, { operation: 'PREPARE_SOURCE', request });
    expect(Object.hasOwn(JSON.parse(bundle.competitionJson), 'athleteTargetMode')).toBe(false);
    await source.port.retireSource(bundle, false);
    await expect(source.port.retireSource(bundle, true)).resolves.toBeUndefined();
    expect(source.state().phase).toBe('FINISHED');
  });

  it('requires a new athlete selection at the destination instead of carrying the source choice', async () => {
    const source = await lane(sourceId, true, R3P60);
    const target = await lane(targetId, false, R3P60);
    source.setState(
      CompetitionState.reconstruct({
        ...selectAthlete(athleteCompetition(), 'SIGHTING'),
        id: competitionId,
        sessionId: source.original.id,
        timer: source.state().timer,
      }),
    );
    const bundle = await source.service.execute(competitionId, { operation: 'PREPARE_SOURCE', request });
    expect(JSON.parse(bundle.competitionJson).athleteTargetMode).toBe('SIGHTING');
    await target.service.execute(competitionId, { operation: 'STAGE_TARGET', bundle });
    await source.service.execute(competitionId, { operation: 'RETIRE_SOURCE', id: request.id, digest: bundle.digest });
    await target.service.execute(competitionId, {
      operation: 'ACTIVATE_TARGET',
      id: request.id,
      digest: bundle.digest,
      sourceRetired: true,
    });
    await expect(source.port.retireSource(bundle, true)).resolves.toBeUndefined();
    expect(target.state().athleteTargetMode).toBeNull();
    expect(target.state().currentSeriesIndex).toBe(2);
    expect(target.state().seriesShotCount).toBe(0);
  });

  it('uses the transferred normal observation for resume, bootstrap and both displays without carrying the selection', async () => {
    const source = await lane(sourceId, true, R3P60);
    const target = await lane(targetId, false, R3P60);
    const state = CompetitionState.reconstruct({
      ...selectAthlete(athleteCompetition(), 'SIGHTING'),
      id: competitionId,
      sessionId: source.original.id,
      timer: source.state().timer,
    });
    source.setState(state);
    const sourceSession = source.original.recordShot(
      null,
      new Score(90),
      new Date(),
      undefined,
      false,
      Mode.sighting(),
      {
        competitionContext: {
          competitionId,
          stageIndex: state.currentStageIndex,
          seriesIndex: state.currentSeriesIndex,
          athleteModeObserved: true,
        },
      },
    );
    await source.sessions.save(sourceSession);
    const bundle = await source.service.execute(competitionId, { operation: 'PREPARE_SOURCE', request });
    await target.service.execute(competitionId, { operation: 'STAGE_TARGET', bundle });
    await source.service.execute(competitionId, { operation: 'RETIRE_SOURCE', id: request.id, digest: bundle.digest });
    await target.service.execute(competitionId, {
      operation: 'ACTIVATE_TARGET',
      id: request.id,
      digest: bundle.digest,
      sourceRetired: true,
    });
    expect(target.state().athleteTargetMode).toBeNull();
    const transferred = (await target.sessions.findById(sourceSession.id))!;
    expect(transferred.allShots.at(-1)!.competitionContext?.athleteModeObserved).toBe(true);

    const events = new TypedEventBus();
    const commands = new CommandBus();
    const sentModes: string[] = [];
    commands.use({
      execute: async (name, input, next) => {
        if (name === 'SwitchMode') sentModes.push((input as SwitchModeInput).mode.value);
        return next();
      },
    });
    commands.register(SwitchModeToken, createSwitchModeHandler(target.sessions, events));
    commands.register(
      RecordShotToken,
      createRecordShotHandler(target.sessions, new ScoreCalculationServiceImpl(), events, {
        detect: vi.fn(),
      } as unknown as ScoreDiscrepancyDetector),
    );
    events.on(
      'ShotRecorded',
      createShotRecordedHandler({ competitionRepository: target.competitions, eventBus: events }),
    );
    let record: LaneInterruptionRecord | null = null;
    const interruptions = new CompetitionInterruptionService(
      {
        findByCompetitionId: () => record,
        save: (next) => {
          record = next;
        },
        delete: () => {
          record = null;
        },
      },
      target.competitions,
      {
        pause: async () => ({ remainingSeconds: 240, totalSeconds: 4500 }),
        resumeAt: async () => undefined,
      } as unknown as LaneTimerService,
      commands,
      events,
      target.sessions,
    );
    await interruptions.pause({ competitionId, interruptionId: request.id, pausedAt: new Date() });
    const cache = new SessionContextCache(events);
    cache.subscribeEvents(vi.fn());
    await cache.bootstrap(target.sessions, target.competitions, interruptions);
    expect(cache.getContext().mode.value).toBe('SIGHTING');
    await interruptions.resume({
      competitionId,
      interruptionId: request.id,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 240,
      unlimitedSightingShots: false,
    });
    expect(sentModes).toEqual(['SIGHTING']);
    expect(cache.getContext().mode.value).toBe('SIGHTING');
    const projection = await createGetCompetitionStateHandler(
      target.competitions,
      target.sessions,
      interruptions,
    )({ competitionId });
    expect(projection.athleteTargetControl).toMatchObject({ selected: null, effective: 'SIGHTING' });
    expect(projectVistaTargetMode(target.state(), transferred, interruptions.get(competitionId))).toBe('sighting');
    const restored = new SessionContextCache(new TypedEventBus());
    await restored.bootstrap(target.sessions, target.competitions, interruptions);
    expect(restored.getContext().mode.value).toBe('SIGHTING');

    await createShotIngestionHandler({
      commandBus: commands,
      sessionRepository: target.sessions,
      competitionRepository: target.competitions,
      shotObservationRepository: createMockShotObservationRepository(),
      interruptionReader: interruptions,
    })({ x: 0, y: 0, score: 90, timestamp: new Date(), mode: cache.getContext().mode.value });
    const after = (await target.sessions.findById(sourceSession.id))!;
    expect(after.shotCount).toBe(sourceSession.shotCount + 1);
    expect(after.allShots.at(-1)!.mode.value).toBe('SIGHTING');
    expect(after.allShots.at(-1)!.competitionContext?.athleteModeObserved).toBe(true);
    expect(after.totalScore).toBe(sourceSession.totalScore);
    expect(target.state().seriesShotCount).toBe(0);
  });

  it('rejects a changed source and a stale STOP instead of retiring newer evidence', async () => {
    const source = await lane(sourceId, true);
    const bundle = await source.service.execute(competitionId, { operation: 'PREPARE_SOURCE', request });
    await source.sessions.save(source.original.recordShot(null, new Score(90), new Date()));
    await expect(
      source.service.execute(competitionId, { operation: 'RETIRE_SOURCE', id: request.id, digest: bundle.digest }),
    ).rejects.toThrow(/Source changed/);
    expect(source.state().phase).toBe('ACTIVE');
    expect(source.journal.pending()).toBe(true);
    await source.service.execute(competitionId, { operation: 'CANCEL_SOURCE', id: request.id, digest: bundle.digest });
    expect(source.journal.pending()).toBe(false);
    source.clearStop();
    await expect(
      source.service.execute(competitionId, { operation: 'RETIRE_SOURCE', id: request.id, digest: bundle.digest }),
    ).rejects.toThrow(/cancelled/);
  });

  it('rejects occupied targets, tampering and cross-competition references before state mutation', async () => {
    const source = await lane(sourceId, true),
      target = await lane(targetId, true);
    const bundle = await source.service.execute(competitionId, { operation: 'PREPARE_SOURCE', request });
    await expect(target.service.execute(competitionId, { operation: 'STAGE_TARGET', bundle })).rejects.toThrow(
      /no existing shots/,
    );
    await expect(
      target.service.execute(competitionId, { operation: 'STAGE_TARGET', bundle: { ...bundle, sessionJson: '{}' } }),
    ).rejects.toThrow(/digest/);
    await expect(
      source.service.execute('different-competition', {
        operation: 'RETIRE_SOURCE',
        id: request.id,
        digest: bundle.digest,
      }),
    ).rejects.toThrow(/does not belong/);
    expect(source.state().phase).toBe('ACTIVE');
  });
});
