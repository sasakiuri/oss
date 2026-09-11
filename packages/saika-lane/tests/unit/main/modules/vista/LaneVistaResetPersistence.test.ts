// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { VistaSnapshotSchema, vistaSnapshotPath } from '@sasakiuri/saika-protocol/Vista';
import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { AR60 } from '@/main/modules/competition/domain/competitionTypes';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import { createResetSessionHandler } from '@/main/modules/session/application/handlers/ResetSessionHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { SessionRepositoryImpl } from '@/main/modules/session/infra/SessionRepositoryImpl';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { LaneVistaSource } from '@/main/modules/vista/infra/LaneVistaSource';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
});
const read = async (source: LaneVistaSource, subjectId: string) =>
  VistaSnapshotSchema.parse(await source.handle('GET', vistaSnapshotPath(subjectId)));
const shoot = (session: Session) =>
  session.recordShot(null, new Score(104), new Date(), undefined, false, Mode.match());

function fixture(backend: 'sqlite' | 'local-storage') {
  const directory = mkdtempSync(join(tmpdir(), 'vista-reset-transaction-'));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const settings = join(directory, 'settings.json');
  writeFileSync(settings, '{}');
  const all = (): Record<string, unknown> => JSON.parse(readFileSync(settings, 'utf8')) as Record<string, unknown>;
  const storage = {
    get: (key: string) => all()[key],
    getAll: all,
    set: (key: string, value: unknown) => writeFileSync(settings, JSON.stringify({ ...all(), [key]: value })),
    setMany: (entries: Record<string, unknown>) => writeFileSync(settings, JSON.stringify({ ...all(), ...entries })),
    delete: (key: string) => {
      const data = all();
      delete data[key];
      writeFileSync(settings, JSON.stringify(data));
    },
  } as unknown as ILocalStorage;
  let database: Database.Database | undefined;
  const reopen = (): ISessionRepository => {
    database?.close();
    if (backend === 'local-storage') return new SessionRepositoryImpl(storage);
    database = createSqliteDb(join(directory, 'lane.db'));
    return new SqliteSessionRepository(database);
  };
  cleanup.push(() => {
    if (database?.open) database.close();
  });
  const competitions = new CompetitionRepositoryImpl(storage);
  const source = (sessions: ISessionRepository) =>
    new LaneVistaSource({
      identity: { protocolVersion: 1, sourceId: 'lane-one', bootId: 'boot-one', kind: 'lane', name: 'Lane 1' },
      directory: join(directory, 'snapshots'),
      storage,
      competitions,
      sessions,
      timer: { sample: () => null },
      readShotContexts: () => new Map(),
      interruptions: { get: () => null },
      shootOffs: { getState: () => null },
      readShootOffSeries: () => new Map(),
    });
  const blockEpochWrite = (): (() => void) => {
    if (database) {
      database.exec(`CREATE TRIGGER fail_reset_epoch BEFORE INSERT ON session_reset_epochs
        BEGIN SELECT RAISE(ABORT, 'Disk full'); END;`);
      return () => {
        database!.exec('DROP TRIGGER fail_reset_epoch');
      };
    }
    const write = storage.setMany.bind(storage);
    const blocked = vi.spyOn(storage, 'setMany').mockImplementation((entries) => {
      if (Object.keys(entries).some((key) => key.startsWith('session-reset-epoch:'))) throw new Error('Disk full');
      write(entries);
    });
    return () => blocked.mockRestore();
  };
  return { reopen, competitions, source, blockEpochWrite };
}

describe.each(['sqlite', 'local-storage'] as const)('Vista reset persistence using %s', (backend) => {
  it('commits an empty match reset before the event and preserves its boundary after immediate restart', async () => {
    const { reopen, competitions, source } = fixture(backend);
    let sessions = reopen();
    const session = Session.create(Discipline.airRifle10m()).resumeMode(Mode.match());
    await sessions.save(session);
    await competitions.save(CompetitionState.create('match', session.id, AR60.config));
    const original = await read(source(sessions), 'match');
    expect(await sessions.readResetEpoch(session.id)).toBeNull();
    const events = new TypedEventBus();
    let observedEpoch: Promise<string | null> | undefined;
    events.on('SessionReset', (event) => {
      observedEpoch = sessions.readResetEpoch(event.aggregateId);
    });
    // No Vista observer is registered and no archive is captured after this reset.
    await createResetSessionHandler(sessions, events)({ sessionId: session.id });
    expect(await observedEpoch).toEqual(expect.any(String));
    sessions = reopen();
    const committedEpoch = await sessions.readResetEpoch(session.id);
    expect(committedEpoch).toBe(await observedEpoch);
    const nextSession = shoot((await sessions.findById(session.id))!);
    await sessions.saveShot(nextSession, nextSession.allShots[0]!);
    expect(await sessions.readResetEpoch(session.id)).toBe(committedEpoch);
    const restored = source(sessions);
    const old = await read(restored, original.subjectId);
    expect(old.generation).toBe(original.generation);
    expect(old.participants[0]).toMatchObject({ shots: [], dataState: 'saved' });
    const nextId = restored.catalog().subjects.find((subject) => subject.id !== original.subjectId)!.id;
    const next = await read(restored, nextId);
    expect(next.generation).not.toBe(original.generation);
    expect(next.participants[0]?.shots).toHaveLength(1);
    sessions = reopen();
    expect((await read(source(sessions), nextId)).generation).toBe(next.generation);
  });

  it.each([0, 1])(
    'rolls back the reset and epoch together after write failure with %i existing shots',
    async (count) => {
      const { reopen, competitions, source, blockEpochWrite } = fixture(backend);
      let sessions = reopen();
      let session = Session.create(Discipline.airRifle10m()).resumeMode(Mode.match());
      await sessions.saveReset(session);
      if (count) {
        session = shoot(session);
        await sessions.save(session);
      }
      await competitions.save(CompetitionState.create('rollback', session.id, AR60.config));
      const original = await read(source(sessions), 'rollback');
      const originalEpoch = await sessions.readResetEpoch(session.id);
      const events = new TypedEventBus();
      const emitted = vi.fn();
      events.on('SessionReset', emitted);
      const unblock = blockEpochWrite();
      await expect(createResetSessionHandler(sessions, events)({ sessionId: session.id })).rejects.toThrow(
        'Repository operation failed',
      );
      expect(emitted).not.toHaveBeenCalled();
      sessions = reopen();
      expect((await sessions.findById(session.id))?.allShots.map((shot) => shot.id)).toEqual(
        session.allShots.map((shot) => shot.id),
      );
      expect(await sessions.readResetEpoch(session.id)).toBe(originalEpoch);
      const afterFailure = await read(source(sessions), original.subjectId);
      expect(afterFailure.generation).toBe(original.generation);
      expect(afterFailure.participants[0]?.shots).toHaveLength(count);
      unblock();
      await createResetSessionHandler(sessions, events)({ sessionId: session.id });
      sessions = reopen();
      expect(await sessions.readResetEpoch(session.id)).not.toBe(originalEpoch);
      const nextSession = shoot((await sessions.findById(session.id))!);
      await sessions.saveShot(nextSession, nextSession.allShots[0]!);
      const restored = source(sessions);
      expect((await read(restored, original.subjectId)).participants[0]?.shots).toHaveLength(count);
      const nextId = restored.catalog().subjects.find((subject) => subject.id !== original.subjectId)!.id;
      expect((await read(restored, nextId)).participants[0]?.shots).toHaveLength(1);
    },
  );
});
