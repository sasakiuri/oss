// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  VISTA_CATALOG_PATH,
  VistaCatalogSchema,
  vistaSnapshotPath,
  VistaSnapshotSchema,
} from '@sasakiuri/saika-protocol/Vista';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPhaseChangedHandler } from '@/main/modules/competition/application/CompetitionEventHandlers';
import { createAdvanceStageHandler } from '@/main/modules/competition/application/handlers/AdvanceStageHandler';
import { createStartCompetitionHandler } from '@/main/modules/competition/application/handlers/StartCompetitionHandler';
import { SessionLifecycleService } from '@/main/modules/competition/application/SessionLifecycleService';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { CompetitionTypeRegistry } from '@/main/modules/competition/domain/CompetitionTypeRegistry';
import {
  AP60,
  AR60,
  BP60,
  BP60_FINAL,
  BR60S,
  BR60S_FINAL,
  AR60_FINAL,
  AP60_FINAL,
} from '@/main/modules/competition/domain/competitionTypes';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import type { CompetitionShootOffWindow } from '@/main/modules/competition-shoot-off';
import { createResetSessionHandler } from '@/main/modules/session/application/handlers/ResetSessionHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { Shot } from '@/main/modules/session/domain/Shot';
import { parseShotObservationEvidence } from '@/main/modules/shot-observation/domain/ShotObservationEvidence';
import { laneVistaDefinition, type LaneVistaShotContext } from '@/main/modules/vista/application/LaneVistaProjection';
import { LaneVistaSource } from '@/main/modules/vista/infra/LaneVistaSource';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { createMockSessionRepository } from '../../../../helpers/mockDependencies';

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'lane-vista-'));
  directories.push(directory);
  const data: Record<string, unknown> = {};
  const storage = {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value;
    },
    setMany: (entries: Record<string, unknown>) => Object.assign(data, entries),
    getAll: () => data,
    delete: (key: string) => {
      delete data[key];
    },
  } as unknown as ILocalStorage;
  const competitions = new CompetitionRepositoryImpl(storage);
  const sessions = createMockSessionRepository();
  const sessionMap = new Map<string, Session>();
  const epochs = new Map<string, string>();
  vi.mocked(sessions.readResetEpoch).mockImplementation(async (id) => epochs.get(id) ?? null);
  vi.mocked(sessions.saveReset).mockImplementation(async (session) => {
    sessionMap.set(session.id, session);
    epochs.set(session.id, randomUUID());
  });
  const shotContexts = new Map<string, LaneVistaShotContext>();
  const shootOffSeries = new Map<string, number>();
  vi.mocked(sessions.findById).mockImplementation(async (id) => sessionMap.get(id) ?? null);
  vi.mocked(sessions.save).mockImplementation(async (session) => {
    sessionMap.set(session.id, session);
  });
  const options = {
    identity: {
      protocolVersion: 1 as const,
      sourceId: 'lane-1',
      bootId: 'boot-1',
      kind: 'lane' as const,
      name: 'Lane 1',
    },
    directory,
    storage,
    competitions,
    sessions,
    timer: { sample: () => null },
    readShotContexts: () => shotContexts,
    interruptions: { get: vi.fn<() => LaneInterruptionRecord | null>(() => null) },
    shootOffs: { getState: vi.fn<() => CompetitionShootOffWindow | null>(() => null) },
    readShootOffSeries: () => shootOffSeries,
  };
  return {
    options,
    competitions,
    sessions: sessionMap,
    shotContexts,
    shootOffSeries,
    source: new LaneVistaSource(options),
  };
}
const read = async (source: LaneVistaSource, id: string) =>
  VistaSnapshotSchema.parse(await source.handle('GET', vistaSnapshotPath(id)));
const shot = (session: Session) =>
  session.recordShot(new ImpactPoint(2, -3), new Score(104), new Date(), undefined, false, Mode.match());

describe('Lane spectator source', () => {
  it('refreshes only the changed competition and retains unrelated catalog errors', async () => {
    const { source, options, competitions, sessions } = fixture();
    for (const id of ['live', 'history', 'invalid']) {
      const session = Session.create(Discipline.beamRifle10m());
      sessions.set(session.id, session);
      await competitions.save(CompetitionState.create(id, session.id, BR60S.config));
    }
    options.storage.set('competition:invalid', { currentStageIndex: 99 });
    await source.refresh();
    const invalid = source.catalog().subjects.find((subject) => subject.id === 'invalid');
    expect(invalid?.availability).toBe('unsupported');
    vi.mocked(options.sessions.findById).mockClear();
    const all = vi.spyOn(options.storage, 'getAll');
    const active = (await competitions.findById('live'))!;
    sessions.set(active.sessionId, shot(sessions.get(active.sessionId)!));

    await source.refresh('live');

    expect(all).not.toHaveBeenCalled();
    expect(options.sessions.findById).toHaveBeenCalledTimes(1);
    expect(options.sessions.findById).toHaveBeenCalledWith(active.sessionId);
    expect(source.catalog().subjects.find((subject) => subject.id === 'invalid')).toEqual(invalid);
    const restored = new LaneVistaSource(options);
    expect(restored.catalog().subjects.find((subject) => subject.id === 'live')?.availability).toBe('available');
    const snapshot = JSON.parse(
      readFileSync(join(options.directory, `${Buffer.from('live').toString('hex')}.json`), 'utf8'),
    );
    expect(snapshot.snapshot.participants[0].shots).toHaveLength(1);
  });

  it('coalesces pending refreshes and yields before reading competition history', async () => {
    const { source, options, competitions, sessions } = fixture();
    for (const id of ['first', 'second']) {
      const session = Session.create(Discipline.beamRifle10m());
      sessions.set(session.id, session);
      await competitions.save(CompetitionState.create(id, session.id, BR60S.config));
    }
    const pending = [source.refresh('first'), source.refresh('first'), source.refresh('second')];
    await Promise.resolve();
    expect(options.sessions.findById).not.toHaveBeenCalled();

    await Promise.all(pending);

    expect(options.sessions.findById).toHaveBeenCalledTimes(2);
    expect(source.catalog().subjects).toHaveLength(2);
  });

  it('captures a later shot when another refresh arrives during a capture', async () => {
    const { source, options, competitions, sessions } = fixture();
    const session = Session.create(Discipline.beamRifle10m());
    sessions.set(session.id, session);
    await competitions.save(CompetitionState.create('ongoing', session.id, BR60S.config));
    let beginRead!: () => void;
    const reading = new Promise<void>((resolve) => {
      beginRead = resolve;
    });
    let finishRead!: () => void;
    const blocked = new Promise<void>((resolve) => {
      finishRead = resolve;
    });
    vi.mocked(options.sessions.findById).mockImplementationOnce(async () => {
      beginRead();
      await blocked;
      return session;
    });
    const first = source.refresh('ongoing');
    await reading;
    sessions.set(session.id, shot(session));
    const second = source.refresh('ongoing');
    finishRead();
    await Promise.all([first, second]);

    expect(options.sessions.findById).toHaveBeenCalledTimes(2);
    const saved = JSON.parse(
      readFileSync(join(options.directory, `${Buffer.from('ongoing').toString('hex')}.json`), 'utf8'),
    );
    expect(saved.snapshot.participants[0].shots).toHaveLength(1);
    expect(saved.snapshot.revision).toBe(1);
  });

  it.each(['competition', 'repository', 'evidence', 'stage-position', 'series-position'])(
    'isolates invalid %s data, preserves the affected archive, and recovers after repair',
    async (invalid) => {
      const { options, competitions, sessions, shotContexts } = fixture();
      let invalidEvidence = false;
      const sourceOptions = {
        ...options,
        readShotContexts: (competitionId: string) => {
          if (competitionId === 'affected' && invalidEvidence) parseShotObservationEvidence('{}');
          return shotContexts;
        },
      };
      const source = new LaneVistaSource(sourceOptions);
      const healthySession = shot(Session.create(Discipline.airRifle10m()));
      const affectedSession = shot(Session.create(Discipline.airRifle10m()));
      for (const [id, session] of [
        ['healthy', healthySession],
        ['affected', affectedSession],
      ] as const) {
        sessions.set(session.id, session);
        await competitions.save(CompetitionState.create(id, session.id, AR60.config));
      }
      const healthy = await read(source, 'healthy');
      await options.sessions.saveReset(affectedSession.reset());
      sessions.set(affectedSession.id, shot(affectedSession.reset()));
      await source.refresh();
      const affectedId = source.catalog().subjects.find((subject) => subject.id.startsWith('run:'))!.id;
      const originalRun = await read(source, 'affected');
      const affected = await read(source, affectedId);
      const file = join(options.directory, `${Buffer.from(affectedId).toString('hex')}.json`);
      const saved = readFileSync(file, 'utf8');
      const stored = options.storage.get<Record<string, unknown>>('competition:affected')!;
      if (invalid === 'competition') options.storage.set('competition:affected', { ...stored, currentStageIndex: 99 });
      if (invalid === 'repository') options.storage.set('competition:affected', { ...stored, timerTotal: -1 });
      invalidEvidence = invalid === 'evidence';
      sessions.set(healthySession.id, shot(healthySession));
      sessions.set(affectedSession.id, shot(sessions.get(affectedSession.id)!));
      const affectedShotId = sessions.get(affectedSession.id)!.allShots[0]!.id;
      if (invalid === 'stage-position') shotContexts.set(affectedShotId, { stage: 99, series: 0 });
      if (invalid === 'series-position') shotContexts.set(affectedShotId, { stage: 1, series: 6 });

      // The failed subject may be the active competition and a restored reset run.
      const restored = new LaneVistaSource(sourceOptions);
      const catalog = VistaCatalogSchema.parse(await restored.handle('GET', VISTA_CATALOG_PATH));
      expect(catalog.subjects.find((subject) => subject.id === affectedId)).toMatchObject({
        availability: 'unsupported',
        reason: expect.stringContaining('cannot be confirmed'),
      });
      const updatedHealthy = await read(restored, 'healthy');
      expect(updatedHealthy.revision).toBeGreaterThan(healthy.revision);
      expect(updatedHealthy.participants[0]?.shots).toHaveLength(2);
      await expect(read(restored, affectedId)).rejects.toThrow('cannot be confirmed');
      expect(restored.getError()).toContain(affectedId);
      expect(readFileSync(file, 'utf8')).toBe(saved);
      expect((await read(restored, 'affected')).participants).toEqual(originalRun.participants);

      options.storage.set('competition:affected', stored);
      invalidEvidence = false;
      shotContexts.delete(affectedShotId);
      const repaired = await read(restored, affectedId);
      expect(repaired.generation).toBe(affected.generation);
      expect(repaired.revision).toBeGreaterThan(affected.revision);
      expect(repaired.participants[0]?.shots).toHaveLength(2);
      expect(restored.catalog().subjects.find((subject) => subject.id === affectedId)?.availability).toBe('available');
      expect(restored.getError()).toBeNull();
    },
  );

  it.each([false, true])('separates an empty reset before the next capture, including restart=%s', async (restart) => {
    const { source, options, competitions, sessions } = fixture();
    const session = Session.create(Discipline.airRifle10m());
    sessions.set(session.id, session);
    await competitions.save(CompetitionState.create('empty-reset', session.id, AR60.config));
    const original = await read(source, 'empty-reset');
    const events = new TypedEventBus();
    await createResetSessionHandler(options.sessions, events)({ sessionId: session.id });
    sessions.set(session.id, shot(sessions.get(session.id)!));
    const capturing = restart ? new LaneVistaSource(options) : source;
    await capturing.refresh();
    const nextId = capturing.catalog().subjects.find((subject) => subject.id !== original.subjectId)!.id;
    const next = await read(capturing, nextId);
    expect(next.generation).not.toBe(original.generation);
    expect(next.participants[0]?.shots).toHaveLength(1);
    expect((await read(capturing, original.subjectId)).participants[0]?.shots).toEqual([]);
    const rebooted = new LaneVistaSource(options);
    expect((await read(rebooted, nextId)).generation).toBe(next.generation);
    expect(rebooted.catalog().subjects).toHaveLength(2);
  });

  it('rejects a capture whose session read spans the reset boundary', async () => {
    const { source, options, competitions, sessions } = fixture();
    const session = Session.create(Discipline.airRifle10m());
    sessions.set(session.id, session);
    await competitions.save(CompetitionState.create('racing-reset', session.id, AR60.config));
    const original = await read(source, 'racing-reset');
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(options.sessions.findById).mockImplementationOnce(async () => {
      entered();
      await delayed;
      return session;
    });
    const capture = source.refresh();
    await started;
    const events = new TypedEventBus();
    await createResetSessionHandler(options.sessions, events)({ sessionId: session.id });
    sessions.set(session.id, shot(sessions.get(session.id)!));
    release();
    await capture;
    expect(source.catalog().subjects).toHaveLength(1);
    await source.refresh();
    const nextId = source.catalog().subjects.find((subject) => subject.id !== original.subjectId)!.id;
    expect((await read(source, nextId)).participants[0]?.shots).toHaveLength(1);
    expect((await read(source, original.subjectId)).participants[0]?.shots).toHaveLength(0);
  });

  it.each([false, true])(
    'excludes preceding stage sightings after a match reset and resumed sightings, including restart=%s',
    async (restart) => {
      const { source, options, competitions, sessions, shotContexts } = fixture();
      const sighting = Session.create(Discipline.airRifle10m()).recordShot(null, new Score(101), new Date());
      sessions.set(sighting.id, sighting);
      shotContexts.set(sighting.allShots[0]!.id, { stage: 0, series: 0 });
      let competition = CompetitionState.create('reset-after-stage', sighting.id, AR60.config).startStage();
      await competitions.save(competition);
      const match = shot(Session.create(sighting.discipline));
      sessions.set(sighting.id, sighting.finish());
      sessions.set(match.id, match);
      shotContexts.set(match.allShots[0]!.id, { stage: 1, series: 0 });
      competition = competition.endStage().withSessionId(match.id).advanceToNextStage().startNextSeries();
      await competitions.save(competition);
      const original = await read(source, competition.id);
      expect(original.participants[0]?.shots).toHaveLength(2);

      await createResetSessionHandler(options.sessions, new TypedEventBus())({ sessionId: match.id });
      const resumed = sessions
        .get(match.id)!
        .recordShot(null, new Score(103), new Date(), undefined, false, Mode.sighting());
      sessions.set(match.id, resumed);
      shotContexts.set(resumed.allShots[0]!.id, { stage: 1, series: 0 });
      options.interruptions.get.mockReturnValue(
        LaneInterruptionRecord.create({
          competitionId: competition.id,
          interruptionId: 'resumed-sightings',
          status: 'SIGHTING',
          pausedAt: new Date(),
          capturedAt: new Date(),
          capturedRemainingSeconds: 421,
          capturedTotalSeconds: 4500,
          unlimitedSightingShots: true,
          resumeAt: new Date(),
          authorizedRemainingSeconds: 421,
        }),
      );
      const capturing = restart ? new LaneVistaSource(options) : source;
      await capturing.refresh();
      const nextId = capturing.catalog().subjects.find((subject) => subject.id !== original.subjectId)!.id;
      const next = await read(capturing, nextId);
      expect(next.participants[0]).toMatchObject({ mode: 'sighting', historyComplete: true });
      expect(next.participants[0]?.shots.map((entry) => entry.id)).toEqual([resumed.allShots[0]!.id]);
      expect((await read(capturing, original.subjectId)).participants[0]?.shots).toEqual(
        original.participants[0]?.shots,
      );
      const restored = await read(new LaneVistaSource(options), nextId);
      expect(restored.generation).toBe(next.generation);
      expect(restored.participants[0]?.shots).toEqual(next.participants[0]?.shots);
    },
  );

  it('retains a consumed reset boundary through a new stage session without a reset', async () => {
    const { source, options, competitions, sessions } = fixture();
    const sighting = Session.create(Discipline.airRifle10m());
    sessions.set(sighting.id, sighting);
    let competition = CompetitionState.create('reset-stage', sighting.id, AR60.config).startStage();
    await competitions.save(competition);
    await read(source, competition.id);
    await options.sessions.saveReset(sighting.reset());
    await source.refresh();
    const resetId = source.catalog().subjects.find((subject) => subject.id !== competition.id)!.id;
    const reset = await read(source, resetId);
    const match = Session.create(sighting.discipline);
    sessions.set(match.id, match);
    competition = competition.endStage().withSessionId(match.id).advanceToNextStage();
    await competitions.save(competition);
    expect((await read(source, resetId)).generation).toBe(reset.generation);
    expect(source.catalog().subjects).toHaveLength(2);
  });

  it.each(['unsupported', 'truncated', 'invalid-position'])(
    'protects a %s archive while other subjects remain readable',
    async (kind) => {
      const { source, options, competitions, sessions } = fixture();
      for (const id of ['protected', 'healthy']) {
        const session = shot(Session.create(Discipline.airRifle10m()));
        sessions.set(session.id, session);
        await competitions.save(CompetitionState.create(id, session.id, AR60.config));
      }
      await source.refresh();
      const file = join(options.directory, `${Buffer.from('protected').toString('hex')}.json`);
      const saved = JSON.parse(readFileSync(file, 'utf8')) as {
        snapshot: { protocolVersion: number; participants: Array<{ currentStage: number }> };
      };
      if (kind === 'unsupported') saved.snapshot.protocolVersion = 2;
      if (kind === 'invalid-position') saved.snapshot.participants[0]!.currentStage = 99;
      const unreadable = kind === 'truncated' ? '{"competitionId":' : JSON.stringify(saved);
      writeFileSync(file, unreadable);
      const restored = new LaneVistaSource(options);
      const healthy = await read(restored, 'healthy');
      expect(healthy.participants[0]?.shots).toHaveLength(1);
      await expect(read(restored, 'protected')).rejects.toThrow('retained for recovery');
      expect(restored.catalog().subjects.find((subject) => subject.id === 'protected')?.availability).toBe(
        'unsupported',
      );
      expect(readFileSync(file, 'utf8')).toBe(unreadable);
    },
  );

  it('withholds a current run when an unreadable older run prevents its competition from updating', async () => {
    const { source, options, competitions, sessions } = fixture();
    const session = Session.create(Discipline.airRifle10m());
    sessions.set(session.id, session);
    await competitions.save(CompetitionState.create('old-run', session.id, AR60.config));
    await read(source, 'old-run');
    await options.sessions.saveReset(session.reset());
    await source.refresh();
    const currentId = source.catalog().subjects.find((subject) => subject.id !== 'old-run')!.id;
    const file = join(options.directory, `${Buffer.from('old-run').toString('hex')}.json`);
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { snapshot: { protocolVersion: number } };
    saved.snapshot.protocolVersion = 2;
    const unreadable = JSON.stringify(saved);
    writeFileSync(file, unreadable);
    const restored = new LaneVistaSource(options);
    await expect(read(restored, currentId)).rejects.toThrow('cannot be confirmed');
    expect(restored.catalog().subjects.find((subject) => subject.id === currentId)?.availability).toBe('unsupported');
    expect(readFileSync(file, 'utf8')).toBe(unreadable);
  });

  it('keeps reset data out of the old subject when archive persistence fails, then recovers after restart', async () => {
    const { source, options, competitions, sessions } = fixture();
    const session = Session.create(Discipline.airRifle10m());
    sessions.set(session.id, session);
    await competitions.save(CompetitionState.create('archive-failure', session.id, AR60.config));
    const original = await read(source, 'archive-failure');
    const file = join(options.directory, `${Buffer.from(original.subjectId).toString('hex')}.json`);
    const before = readFileSync(file, 'utf8');
    mkdirSync(`${file}.tmp`);
    await options.sessions.saveReset(session.reset());
    sessions.set(session.id, shot(session.reset()));
    await expect(source.refresh()).rejects.toThrow();
    expect(readFileSync(file, 'utf8')).toBe(before);
    rmSync(`${file}.tmp`, { recursive: true });
    const restored = new LaneVistaSource(options);
    expect((await read(restored, original.subjectId)).participants[0]?.shots).toHaveLength(0);
    const nextId = restored.catalog().subjects.find((subject) => subject.id !== original.subjectId)!.id;
    expect((await read(restored, nextId)).participants[0]?.shots).toHaveLength(1);
  });

  it.each([false, true])(
    'clears a recovered refresh error while retaining archive errors=%s',
    async (unreadableArchive) => {
      const { source, options, competitions, sessions } = fixture();
      const session = shot(Session.create(Discipline.airRifle10m()));
      sessions.set(session.id, session);
      await competitions.save(CompetitionState.create('healthy', session.id, AR60.config));
      await source.refresh();
      if (unreadableArchive) {
        writeFileSync(join(options.directory, `${Buffer.from('protected').toString('hex')}.json`), '{');
      }
      const capturing = unreadableArchive ? new LaneVistaSource(options) : source;
      const retainedError = capturing.getError();
      const temporary = join(options.directory, `${Buffer.from('healthy').toString('hex')}.json.tmp`);
      mkdirSync(temporary);
      sessions.set(session.id, shot(session));
      await expect(capturing.refresh()).rejects.toThrow();
      expect(capturing.getError()).toEqual(expect.any(String));
      expect(capturing.getError()).not.toBe(retainedError);
      rmSync(temporary, { recursive: true });
      await capturing.refresh();
      expect(capturing.getError()).toBe(retainedError);
      expect((await read(capturing, 'healthy')).participants[0]?.shots).toHaveLength(2);
    },
  );

  it.each([
    { missing: 'competition', restart: false },
    { missing: 'competition', restart: true },
    { missing: 'session', restart: false },
    { missing: 'session', restart: true },
  ])(
    'keeps an archive unconfirmed when its $missing is absent, including restart=$restart',
    async ({ missing, restart }) => {
      const { options, competitions, sessions } = fixture();
      const session = shot(Session.create(Discipline.airRifle10m()));
      sessions.set(session.id, session);
      await competitions.save(CompetitionState.create('missing-source', session.id, AR60.config).startStage());
      const source = new LaneVistaSource({
        ...options,
        timer: { sample: () => ({ running: true, remainingMs: 590000, sampledAt: Date.now(), generation: 1 }) },
      });
      const original = await read(source, 'missing-source');
      expect(original.participants[0]?.dataState).toBe('live');
      expect(original.clock?.state).toBe('running');
      if (missing === 'competition') await competitions.delete('missing-source');
      else sessions.delete(session.id);

      const capturing = restart ? new LaneVistaSource(options) : source;
      const saved = await read(capturing, 'missing-source');
      expect(saved.generation).toBe(original.generation);
      expect(saved.revision).toBeGreaterThan(original.revision);
      expect(saved.participants[0]?.shots).toEqual(original.participants[0]?.shots);
      expect(saved.participants[0]?.dataState).toBe('saved');
      expect(saved.clock).toMatchObject({ state: 'stopped', remainingMs: original.clock!.remainingMs });
      expect(saved.participants[0]?.clock).toEqual(saved.clock);
      expect((await read(capturing, 'missing-source')).revision).toBe(saved.revision);
      const restored = await read(new LaneVistaSource(options), 'missing-source');
      expect(restored.revision).toBe(saved.revision);
      expect(restored.participants).toEqual(saved.participants);
    },
  );

  it.each([AR60, AP60, BR60S, BP60, AR60_FINAL, AP60_FINAL, BR60S_FINAL, BP60_FINAL])(
    'recognizes the complete standard definition $id',
    (definition) => {
      const session = Session.create(Discipline.fromValue(definition.discipline), definition.config.acc);
      const competition = CompetitionState.create('competition', session.id, definition.config);
      const projected = laneVistaDefinition(competition, session);
      expect(projected?.eventCode).toBe(definition.id);
      expect(projected?.scoring).toBe(definition.config.acc);
      expect(projected?.target.rings.find((ring) => ring.score === 10)?.diameter).toBe(
        definition.discipline.includes('PISTOL') ? 11.5 : definition.discipline === 'BEAM_RIFLE_10M' ? 1 : 0.5,
      );
      expect(
        laneVistaDefinition(
          CompetitionState.create('custom', session.id, { ...definition.config, shotsPerSeries: 7 }),
          session,
        ),
      ).toBeNull();
    },
  );

  it.each([BR60S_FINAL, BP60_FINAL])('aligns $id stage commands with the Director final definition', (definition) => {
    expect(definition.config.stages.map((stage) => stage.series.map((series) => series.maxShots))).toEqual([
      [0],
      [5, 5],
      Array(14).fill(1),
    ]);
    expect(definition.config.stages[0]?.timer?.durationSeconds).toBe(300);
    expect(definition.config.stages[1]?.series.map((series) => series.timer?.durationSeconds)).toEqual([250, 250]);
    expect(definition.config.stages[2]?.series.every((series) => series.shotTimer?.durationSeconds === 50)).toBe(true);
    expect(definition.config.stages[2]?.requiresNewSession).toBe(false);
  });

  it('archives full history, preserves revisions on idle/restart and rotates generation after reset', async () => {
    const { source, options, competitions, sessions } = fixture();
    let session = shot(Session.create(Discipline.fromValue('BEAM_RIFLE_10M')));
    sessions.set(session.id, session);
    let competition = CompetitionState.create('first', session.id, BR60S.config);
    await competitions.save(competition);
    const first = await read(source, 'first');
    expect(first.participants[0]?.shots[0]).toMatchObject({ x: 2, y: -3, score: 10.4 });
    expect(first.ranking).toBeNull();
    expect((await read(source, 'first')).revision).toBe(first.revision);
    const restored = new LaneVistaSource({ ...options, identity: { ...options.identity, bootId: 'boot-2' } });
    expect((await read(restored, 'first')).generation).toBe(first.generation);
    session = session.reset();
    sessions.set(session.id, session);
    await restored.refresh();
    const resetId = restored.catalog().subjects.find((subject) => subject.id !== 'first')!.id;
    const reset = await read(restored, resetId);
    expect(reset.subjectId).toContain(reset.generation);
    expect((await read(restored, 'first')).participants[0]?.shots).toEqual(first.participants[0]?.shots);
    expect((await read(restored, 'first')).generation).toBe(first.generation);
    expect(reset.generation).not.toBe(first.generation);
    expect(reset.participants[0]?.shots).toEqual([]);
    competition = competition.finish();
    await competitions.save(competition);
    await read(restored, 'first');
    const other = Session.create(Discipline.fromValue('BEAM_PISTOL_10M'), 'RING');
    sessions.set(other.id, other);
    await competitions.save(CompetitionState.create('second', other.id, BP60.config));
    const rebooted = new LaneVistaSource(options);
    const old = await read(rebooted, resetId);
    expect(old.generation).toBe(reset.generation);
    expect(old.finished).toBe(true);
    expect(rebooted.catalog().subjects.map((entry) => entry.id)).toEqual(expect.arrayContaining(['first', 'second']));
    await expect(rebooted.handle('POST', '/vista/v1/start')).rejects.toThrow('read-only');
  });

  it.each(['alias', 'number'])(
    'retains completed labels after a Lane %s change and restart while refreshing history and scores',
    async (setting) => {
      const { source, options, competitions, sessions } = fixture();
      const session = shot(Session.create(Discipline.airRifle10m()));
      sessions.set(session.id, session);
      await competitions.save(CompetitionState.create('completed-labels', session.id, AR60.config).finish());
      const original = await read(source, 'completed-labels');
      const file = join(options.directory, `${Buffer.from(original.subjectId).toString('hex')}.json`);
      const saved = readFileSync(file, 'utf8');
      if (setting === 'alias') options.storage.set('mqtt.laneAlias', 'New lane');
      else options.storage.set('userPreferences', { laneNumber: 2 });

      // A name-only settings change must not attempt another durable write.
      mkdirSync(`${file}.tmp`);
      for (const capturing of [source, new LaneVistaSource(options)]) {
        const unchanged = await read(capturing, original.subjectId);
        expect(unchanged.revision).toBe(original.revision);
        expect(unchanged.label).toBe(original.label);
        expect(unchanged.participants).toEqual(original.participants);
      }
      expect(readFileSync(file, 'utf8')).toBe(saved);
      rmSync(`${file}.tmp`, { recursive: true });

      const updated = shot(session);
      sessions.set(session.id, updated);
      const refreshed = await read(source, original.subjectId);
      expect(refreshed.generation).toBe(original.generation);
      expect(refreshed.revision).toBeGreaterThan(original.revision);
      expect(refreshed.label).toBe(original.label);
      expect(refreshed.participants[0]).toMatchObject({ laneName: 'Lane 1', total: 20.8, shotCount: 2 });
      sessions.set(
        session.id,
        Session.reconstruct({
          ...updated,
          allShots: updated.allShots.map((entry, index) =>
            index === 0 ? Shot.reconstruct({ ...entry, score: new Score(109) }) : entry,
          ),
        }),
      );
      const corrected = await read(source, original.subjectId);
      expect(corrected.generation).toBe(original.generation);
      expect(corrected.revision).toBeGreaterThan(refreshed.revision);
      expect(corrected.label).toBe(original.label);
      expect(corrected.participants[0]).toMatchObject({ laneName: 'Lane 1', total: 21.3, shotCount: 2 });
      expect(corrected.participants[0]?.shots[0]).toMatchObject({ id: session.allShots[0]!.id, score: 10.9 });
    },
  );

  it.each(['reset', 'new-competition'])(
    'uses current Lane settings for a %s without renaming the completed subject',
    async (change) => {
      const { source, options, competitions, sessions } = fixture();
      const session = shot(Session.create(Discipline.airRifle10m()));
      sessions.set(session.id, session);
      await competitions.save(CompetitionState.create('completed-subject', session.id, AR60.config).finish());
      const original = await read(source, 'completed-subject');
      options.storage.set('mqtt.laneAlias', 'New lane');
      if (change === 'reset') await options.sessions.saveReset(session.reset());
      else {
        const nextSession = Session.create(session.discipline);
        sessions.set(nextSession.id, nextSession);
        await competitions.save(CompetitionState.create('new-subject', nextSession.id, AR60.config));
      }
      await source.refresh();
      const nextId = source.catalog().subjects.find((subject) => subject.id !== original.subjectId)!.id;
      const next = await read(source, nextId);
      expect(next.generation).not.toBe(original.generation);
      expect(next.label).toContain('New lane');
      expect(next.participants[0]?.laneName).toBe('New lane');
      if (change === 'new-competition') {
        options.storage.set('mqtt.laneAlias', 'Renamed active lane');
      }
      const renamed = await read(source, nextId);
      const expectedName = change === 'new-competition' ? 'Renamed active lane' : 'New lane';
      expect(renamed.label).toContain(expectedName);
      expect(renamed.participants[0]?.laneName).toBe(expectedName);
      const retained = await read(new LaneVistaSource(options), original.subjectId);
      expect(retained.label).toBe(original.label);
      expect(retained.participants[0]?.laneName).toBe('Lane 1');
    },
  );

  it.each([false, true])(
    'keeps a competition and its sighting history through the first stage transition after upgrade, captured=%s',
    async (captured) => {
      const { source, competitions, sessions, options, shotContexts } = fixture();
      const sighting = Session.create(Discipline.fromValue(BR60S.discipline)).recordShot(
        null,
        new Score(0),
        new Date(),
      );
      sessions.set(sighting.id, sighting);
      shotContexts.set(sighting.allShots[0]!.id, { stage: 0, series: 0 });
      const competition = CompetitionState.create('upgraded', sighting.id, BR60S.config).startStage().endStage();
      await competitions.save(competition);
      // Earlier versions saved the current session without the Vista history key.
      options.storage.delete('vista-session-links:upgraded');
      const previous = captured ? await read(source, competition.id) : null;

      const events = new TypedEventBus();
      await createAdvanceStageHandler(
        competitions,
        new SessionLifecycleService(options.sessions, events),
        events,
      )({ competitionId: competition.id });
      const match = (await competitions.findById(competition.id))!;
      expect(match.sessionId).not.toBe(sighting.id);

      const snapshot = await read(source, competition.id);
      expect(source.catalog().subjects.map((subject) => subject.id)).toEqual([competition.id]);
      expect(snapshot.participants[0]).toMatchObject({ currentStage: 1, historyComplete: true });
      expect(snapshot.participants[0]?.shots.map((entry) => entry.id)).toEqual([sighting.allShots[0]!.id]);
      const expectedGeneration = expect.any(String);
      expect(snapshot.generation).toEqual(previous?.generation ?? expectedGeneration);
      expect(options.storage.get('vista-session-links:upgraded')).toEqual([
        { sessionId: sighting.id, stage: 0 },
        { sessionId: match.sessionId, stage: 1 },
      ]);

      const restored = await read(new LaneVistaSource(options), competition.id);
      expect(restored.generation).toBe(snapshot.generation);
      expect(restored.participants).toEqual(snapshot.participants);
    },
  );

  it('keeps sighting sessions when advancing to match and discards them on a competition rewind', async () => {
    const { source, competitions, sessions, options, shotContexts } = fixture();
    const sighting = Session.create(Discipline.fromValue('BEAM_RIFLE_10M')).recordShot(null, new Score(0), new Date());
    sessions.set(sighting.id, sighting);
    let competition = CompetitionState.create('round', sighting.id, BR60S.config).startStage();
    await competitions.save(competition);
    const match = shot(Session.create(sighting.discipline).resumeMode(Mode.match()));
    shotContexts.set(sighting.allShots[0]!.id, { stage: 0, series: 0 });
    shotContexts.set(match.allShots[0]!.id, { stage: 1, series: 0 });
    sessions.set(match.id, match);
    competition = competition.endStage().withSessionId(match.id).advanceToNextStage();
    await competitions.save(competition);
    const snapshot = await read(source, 'round');
    expect(snapshot.participants[0]?.shots).toHaveLength(2);
    expect(snapshot.participants[0]?.historyComplete).toBe(true);
    expect(snapshot.participants[0]?.shots[0]).toMatchObject({ x: null, y: null, mode: 'sighting', sequence: 1 });
    expect(snapshot.participants[0]?.shots[1]).toMatchObject({ stage: 1, series: 0, mode: 'match', sequence: 2 });
    expect((await read(new LaneVistaSource(options), 'round')).participants[0]?.shots).toHaveLength(2);
    const restarted = Session.create(sighting.discipline);
    sessions.set(restarted.id, restarted);
    await competitions.save(competition.withSessionId(restarted.id).rewindToStage(0));
    await source.refresh();
    const rewindId = source.catalog().subjects.find((subject) => subject.id !== 'round')!.id;
    const rewind = await read(source, rewindId);
    expect((await read(source, 'round')).participants[0]?.shots).toEqual(snapshot.participants[0]?.shots);
    expect(rewind.participants[0]?.shots).toEqual([]);
    expect(rewind.generation).not.toBe(snapshot.generation);
  });

  it.each([AR60_FINAL, AP60_FINAL, BR60S_FINAL, BP60_FINAL])(
    'preserves recorded series positions through an incomplete $id final, finish and restart',
    async (definition) => {
      const { source, competitions, sessions, options, shotContexts } = fixture();
      const sighting = Session.create(Discipline.fromValue(definition.discipline));
      sessions.set(sighting.id, sighting);
      let competition = CompetitionState.create('final', sighting.id, definition.config).startStage();
      await competitions.save(competition);
      let match = Session.create(sighting.discipline);
      competition = competition.endStage().withSessionId(match.id).advanceToNextStage().startNextSeries();
      // The first five-shot series ends after only four shots. The next series
      // and single shots retain their actual rule positions, not ten-shot groups.
      for (const [stage, series, count] of [
        [1, 0, 4],
        [1, 1, 5],
        [2, 0, 1],
        [2, 1, 1],
      ]) {
        for (let index = 0; index < count!; index += 1) {
          match = shot(match);
          shotContexts.set(match.allShots.at(-1)!.id, { stage: stage!, series: series! });
          competition = competition.recordShotInSeries();
        }
        if (series !== 1 || stage !== 2) {
          if (competition.phase === 'ACTIVE') competition = competition.expireTimer();
          competition = competition.advanceToNextStage().startNextSeries();
        }
      }
      sessions.set(match.id, match);
      await competitions.save(competition);
      expect(match.mode.isSighting()).toBe(true);
      expect(match.allShots[5]?.seriesNumber).toBe(1);
      const snapshot = await read(source, 'final');
      expect(snapshot.participants[0]).toMatchObject({
        mode: 'match',
        currentStage: 2,
        currentSeries: 1,
        historyComplete: true,
        total: 114.4,
        series: [
          { stage: 1, index: 0, total: 41.6 },
          { stage: 1, index: 1, total: 52 },
          { stage: 2, index: 0, total: 10.4 },
          { stage: 2, index: 1, total: 10.4 },
        ],
      });
      expect(snapshot.participants[0]?.shots[9]).toMatchObject({ stage: 2, series: 0 });
      shotContexts.clear();
      const restored = await read(new LaneVistaSource(options), 'final');
      expect(restored.participants).toEqual(snapshot.participants);
      expect(restored.revision).toBe(snapshot.revision);

      // The final ordinary series remains in bounds after the source finishes.
      for (let series = 2; series < 14; series += 1) {
        competition = competition.advanceToNextStage().startNextSeries();
        match = shot(match);
        shotContexts.set(match.allShots.at(-1)!.id, { stage: 2, series });
        competition = competition.recordShotInSeries();
      }
      sessions.set(match.id, match.finish());
      await competitions.save(competition.finish());
      const finished = await read(source, 'final');
      expect(finished.finished).toBe(true);
      expect(finished.participants[0]).toMatchObject({
        currentStage: 2,
        currentSeries: 13,
        shotCount: 23,
        historyComplete: true,
        dataState: 'saved',
      });
      expect(finished.participants[0]?.shots.at(-1)).toMatchObject({ stage: 2, series: 13 });
      expect((await read(new LaneVistaSource(options), 'final')).participants).toEqual(finished.participants);
    },
  );

  it('retains all shots and totals but exposes missing acquisition positions as incomplete history', async () => {
    const { source, competitions, sessions } = fixture();
    const match = shot(Session.create(Discipline.airRifle10m()));
    sessions.set(match.id, match);
    const competition = CompetitionState.create('unproven', match.id, AR60_FINAL.config).startStage();
    await competitions.save(competition);
    const participant = (await read(source, 'unproven')).participants[0]!;
    expect(participant).toMatchObject({ total: 10.4, shotCount: 1, historyComplete: false, series: [] });
    expect(participant.shots).toEqual([expect.objectContaining({ stage: null, series: null, score: 10.4 })]);
  });

  it('shows authorized interruption sightings and restores a persisted pause clock inside the match stage', async () => {
    const { source, options, competitions, sessions } = fixture();
    const session = Session.create(Discipline.airRifle10m());
    sessions.set(session.id, session);
    const competition = CompetitionState.create('interrupted', session.id, AR60.config)
      .startStage()
      .endStage()
      .advanceToNextStage()
      .startNextSeries();
    await competitions.save(competition);
    expect((await read(source, 'interrupted')).participants[0]?.mode).toBe('match');
    const properties = {
      competitionId: competition.id,
      interruptionId: 'interruption-1',
      pausedAt: new Date(),
      capturedAt: new Date(),
      capturedRemainingSeconds: 421,
      capturedTotalSeconds: 4500,
    };
    options.interruptions.get.mockReturnValue(LaneInterruptionRecord.create({ ...properties, status: 'PAUSED' }));
    const paused = await read(new LaneVistaSource(options), 'interrupted');
    expect(paused.clock).toMatchObject({ state: 'stopped', remainingMs: 421000 });
    expect(paused.participants[0]?.clock).toEqual(paused.clock);
    options.interruptions.get.mockReturnValue(
      LaneInterruptionRecord.create({
        ...properties,
        status: 'SIGHTING',
        unlimitedSightingShots: true,
        resumeAt: new Date(),
        authorizedRemainingSeconds: 421,
      }),
    );
    const sighting = await read(source, 'interrupted');
    expect(sighting.participants[0]).toMatchObject({ currentStage: 1, mode: 'sighting' });
    options.interruptions.get.mockReturnValue(
      LaneInterruptionRecord.create({ ...properties, status: 'RUNNING_MATCH' }),
    );
    expect((await read(source, 'interrupted')).participants[0]?.mode).toBe('match');
  });

  it('withholds series totals while an unassigned match shot could change those totals', async () => {
    const { source, competitions, sessions, shotContexts } = fixture();
    const match = shot(shot(Session.create(Discipline.airRifle10m())));
    sessions.set(match.id, match);
    shotContexts.set(match.allShots[0]!.id, { stage: 1, series: 0 });
    await competitions.save(CompetitionState.create('partial', match.id, AR60_FINAL.config).startStage());
    const partial = (await read(source, 'partial')).participants[0]!;
    expect(partial).toMatchObject({
      total: 20.8,
      historyComplete: false,
      series: [{ stage: 1, index: 0, total: null }],
    });
    shotContexts.set(match.allShots[1]!.id, { stage: 1, series: 0 });
    const complete = (await read(source, 'partial')).participants[0]!;
    expect(complete).toMatchObject({ historyComplete: true, series: [{ stage: 1, index: 0, total: 20.8 }] });
  });

  it('separates shoot-off shots and timing from match totals, then retains history after the window closes', async () => {
    const { source, options, competitions, sessions, shotContexts, shootOffSeries } = fixture();
    let session = shot(Session.create(Discipline.airRifle10m()));
    const matchShot = session.allShots[0]!;
    const competition = CompetitionState.create('tie', session.id, AR60_FINAL.config)
      .startStage()
      .endStage()
      .advanceToNextStage()
      .startNextSeries();
    await competitions.save(competition);
    sessions.set(session.id, session);
    shotContexts.set(matchShot.id, { stage: 1, series: 0 });
    const before = await read(source, 'tie');
    expect(before.participants[0]?.mode).toBe('match');
    const start = Date.now() - 1000;
    const window: CompetitionShootOffWindow = {
      competitionId: competition.id,
      runId: 'tie-break',
      iteration: 1,
      timerStartAt: new Date(start).toISOString(),
      timerDurationSeconds: 50,
      shotsPerLane: 1,
      status: 'OPEN',
      recordedShotIds: [],
    };
    options.shootOffs.getState.mockReturnValue(window);
    const opened = await read(source, 'tie');
    expect(opened.participants[0]?.mode).toBe('shoot-off');
    expect(opened.clock).toMatchObject({ label: 'Shoot-off', state: 'running', remainingMs: 50000, sampledAt: start });
    session = session.recordShot(null, new Score(106), new Date(), undefined, false, Mode.sighting());
    const extra = session.allShots.at(-1)!;
    sessions.set(session.id, session);
    shotContexts.set(extra.id, { stage: 1, series: 0 });
    shootOffSeries.set(extra.id, 0);
    options.shootOffs.getState.mockReturnValue({ ...window, status: 'COMPLETE', recordedShotIds: [extra.id] });
    const complete = await read(source, 'tie');
    expect(complete.participants[0]).toMatchObject({ mode: 'shoot-off', total: 10.4, shotCount: 1 });
    expect(complete.participants[0]?.series).toEqual(before.participants[0]?.series);
    expect(complete.participants[0]?.shots.at(-1)).toMatchObject({
      id: extra.id,
      mode: 'shoot-off',
      score: 10.6,
      recorded: true,
    });
    expect(complete.clock).toBeNull();
    options.shootOffs.getState.mockReturnValue({ ...window, iteration: 2 });
    expect((await read(source, 'tie')).participants[0]?.currentSeries).toBe(1);
    session = session.recordShot(null, new Score(107), new Date(), undefined, false, Mode.sighting());
    const extraSecond = session.allShots.at(-1)!;
    sessions.set(session.id, session);
    shotContexts.set(extraSecond.id, { stage: 1, series: 0 });
    shootOffSeries.set(extraSecond.id, 1);
    options.shootOffs.getState.mockReturnValue({
      ...window,
      iteration: 2,
      status: 'COMPLETE',
      recordedShotIds: [extraSecond.id],
    });
    const secondComplete = await read(source, 'tie');
    const participant = secondComplete.participants[0]!;
    expect(participant).toMatchObject({ mode: 'shoot-off', currentSeries: 1, total: 10.4, shotCount: 1 });
    expect(participant.shots.filter((shot) => shot.mode === 'shoot-off')).toHaveLength(2);
    expect(
      participant.shots
        .filter((shot) => shot.mode === 'shoot-off' && shot.series === participant.currentSeries)
        .map((shot) => shot.id),
    ).toEqual([extraSecond.id]);
    options.shootOffs.getState.mockReturnValue(null);
    shootOffSeries.clear();
    const restored = await read(new LaneVistaSource(options), 'tie');
    expect(restored.participants[0]).toMatchObject({ mode: 'match', total: 10.4, shotCount: 1 });
    expect(restored.participants[0]?.shots).toEqual(secondComplete.participants[0]?.shots);
  });
  it('keeps an authoritative clock sample stable between ticks and freezes the actual stop value', async () => {
    const { options, competitions, sessions } = fixture();
    const session = Session.create(Discipline.fromValue('BEAM_RIFLE_10M'));
    sessions.set(session.id, session);
    const competition = CompetitionState.create('clock', session.id, BR60S.config).startStage();
    await competitions.save(competition);
    let sample = { running: true, remainingMs: 599000, sampledAt: Date.now(), generation: 1 };
    const source = new LaneVistaSource({ ...options, timer: { sample: () => sample } });
    const first = await read(source, 'clock');
    expect((await read(source, 'clock')).revision).toBe(first.revision);
    sample = { ...sample, remainingMs: 598000, sampledAt: sample.sampledAt + 1000 };
    const tick = await read(source, 'clock');
    expect(tick.revision).toBeGreaterThan(first.revision);
    sample = { ...sample, running: false, remainingMs: 597500, sampledAt: sample.sampledAt + 500 };
    await competitions.save(competition.finish());
    const stopped = await read(source, 'clock');
    expect(stopped.clock).toMatchObject({ state: 'stopped', remainingMs: 597500 });
    const restored = await read(
      new LaneVistaSource({ ...options, identity: { ...options.identity, bootId: 'restarted' } }),
      'clock',
    );
    expect(restored.clock).toEqual(stopped.clock);
    expect(restored.revision).toBe(stopped.revision);
  });

  it('withholds a running timer after a new competition implicitly finishes the selected subject', async () => {
    vi.useFakeTimers();
    const { options, competitions, sessions } = fixture();
    const session = Session.create(Discipline.fromValue(BR60S.discipline), BR60S.config.acc);
    sessions.set(session.id, session);
    vi.mocked(options.sessions.findActive).mockResolvedValue(session);
    const events = new TypedEventBus();
    const timer = new LaneTimerService(competitions, events);
    events.on('PhaseChanged', createPhaseChangedHandler({ competitionRepository: competitions, timerService: timer }));
    const source = new LaneVistaSource({ ...options, timer });
    try {
      await competitions.save(CompetitionState.create('previous', session.id, BR60S.config).startStage());
      timer.start('previous', 600, 600);
      expect((await read(source, 'previous')).clock).toMatchObject({ state: 'running', remainingMs: 600000 });

      // Joining a newly published NOT_STARTED Director competition invokes this
      // handler while leaving the next competition idle until its start command.
      const registry = new CompetitionTypeRegistry();
      registry.register(AP60);
      await createStartCompetitionHandler(
        registry,
        competitions,
        options.sessions,
        events,
      )({
        competitionTypeId: AP60.id,
        competitionId: 'next',
      });
      const finished = await read(source, 'previous');
      expect(finished.finished).toBe(true);
      expect(finished.clock).toBeNull();
      expect(finished.participants[0]?.clock).toBeNull();

      await vi.advanceTimersByTimeAsync(5000);
      expect(timer.sample('previous')).toMatchObject({ running: true, remainingMs: 595000 });
      const retained = await read(source, 'previous');
      expect(retained.clock).toBeNull();
      expect(retained.participants[0]?.clock).toBeNull();
      expect(retained.revision).toBe(finished.revision);
    } finally {
      timer.stop();
      vi.useRealTimers();
    }
  });
});
