// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { AR60 } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { Timer } from '@/main/modules/competition/domain/Timer';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import { ReserveLaneTransferService } from '@/main/modules/reserve-lane-transfer/application/ReserveLaneTransferService';
import { ReserveTransferCommandGuard } from '@/main/modules/reserve-lane-transfer/infra/ReserveTransferCommandGuard';
import { SqliteReserveLaneTransferJournal } from '@/main/modules/reserve-lane-transfer/infra/SqliteReserveLaneTransferJournal';
import { StoredReserveLaneTransferState } from '@/main/modules/reserve-lane-transfer/infra/StoredReserveLaneTransferState';
import { LaneSafetyStopState } from '@/main/modules/safety-stop/domain/LaneSafetyStopState';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import type { ReserveLaneTransferRequest } from '@/shared/mqtt/ReserveLaneTransfer';

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
async function lane(id: string, withShots: boolean) {
  const db = createSqliteDb(':memory:');
  databases.push(db);
  const sessions = new SqliteSessionRepository(db);
  let session = Session.create(Discipline.airRifle10m()).resumeMode(Mode.match());
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
    config: AR60.config,
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
    port,
    journal,
    service: new ReserveLaneTransferService(journal, port, () => id),
    state: () => state,
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
