// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFinishCompetitionHandler } from '@/main/modules/competition/application/handlers/FinishCompetitionHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { AR60, BR60S, P25 } from '@/main/modules/competition/domain/competitionTypes';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { CompetitionInterruptionService } from '@/main/modules/competition-interruption/application/CompetitionInterruptionService';
import { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import { LocalCompetitionInterruptionRepository } from '@/main/modules/competition-interruption/infra/LocalCompetitionInterruptionRepository';
import { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import { ActiveRunStartup } from '@/main/startup/restoreActiveRun';

import { buildScore, buildSession } from '../../../helpers/factories';
import {
  createMockCommandBus,
  createMockEventBus,
  createMockSessionRepository,
  createMockStorage,
} from '../../../helpers/mockDependencies';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function fixture(joined = false, type = AR60) {
  vi.useFakeTimers();
  const storage = createMockStorage();
  const events = createMockEventBus();
  const competitions = new CompetitionRepositoryImpl(storage);
  const sessions = createMockSessionRepository();
  const session = buildSession();
  vi.mocked(sessions.findById).mockResolvedValue(session);
  const membership = new DirectorMembership(storage, events);
  const timer = new LaneTimerService(competitions, events, storage);
  const interruptions = new CompetitionInterruptionService(
    new LocalCompetitionInterruptionRepository(storage),
    competitions,
    timer,
    createMockCommandBus(),
    events,
    sessions,
  );
  const active = CompetitionState.create('run', session.id, type.config)
    .startStage()
    .endStage()
    .advanceToNextStage()
    .startNextSeries();
  await competitions.save(active);
  if (joined) membership.setCompetitionId(active.id);
  const createCompetition = vi.fn(async () => {
    await competitions.save(CompetitionState.create('new', session.id, type.config));
  });
  const deps = {
    setAsideActiveRun: () => competitions.clearActivePointer(),
    competitions,
    sessions,
    membership,
    timer,
    interruptions,
    createCompetition,
    safetyStopped: () => false,
    safetyCompetitionId: (): string | null => null,
    transferPending: () => false,
    restoreIndependentWorkflows: vi.fn(),
    stopIndependentWorkflows: vi.fn(),
    context: new SessionContextCache(events),
  };
  return { ...deps, deps, storage, session, active, startup: new ActiveRunStartup(deps) };
}

describe('active run startup', () => {
  it.each([false, true])(
    'leaves a joined AR60 completed sixth series waiting for Director expiry and finish (prior hold=%s)',
    async (held) => {
      const rig = await fixture(true);
      if (held) await rig.interruptions.holdAfterRestart(rig.active, 4500, true);
      let state = rig.active;
      for (let series = 0; series < 6; series++) {
        for (let shot = 0; shot < 10; shot++) state = state.recordShotInSeries();
        if (series < 5) state = state.advanceToNextStage().startNextSeries();
      }
      await rig.competitions.save(state);
      rig.storage.set('competitionClock', {
        competitionId: state.id,
        expiresAtMs: Date.now() + 600_000,
        totalSeconds: 4500,
        stageTimerIndex: 1,
      });
      expect(await rig.startup.restore()).toMatchObject({ status: 'READY' });
      expect(rig.interruptions.get(state.id)).toBeNull();
      expect(rig.timer.sample(state.id)).toBeNull();
      expect(rig.storage.get('competitionClock')).toBeUndefined();
      await rig.timer.expire(state.id);
      expect((await rig.competitions.findById(state.id))!.timer.isExpired).toBe(true);
      await createFinishCompetitionHandler(
        rig.competitions,
        rig.sessions,
        createMockEventBus(),
      )({ competitionId: state.id });
      expect((await rig.competitions.findById(state.id))!.phase).toBe('FINISHED');
    },
  );

  it.each(['PAUSED', 'RESUME_PENDING'] as const)(
    'keeps an official %s case after the joined final series and accepts its resume',
    async (status) => {
      const rig = await fixture(true);
      let completed = rig.active;
      for (let series = 0; series < 6; series++) {
        for (let shot = 0; shot < 10; shot++) completed = completed.recordShotInSeries();
        if (series < 5) completed = completed.advanceToNextStage().startNextSeries();
      }
      await rig.competitions.save(completed);
      const record = LaneInterruptionRecord.create({
        competitionId: completed.id,
        interruptionId: 'official-case',
        status,
        pausedAt: new Date(),
        capturedAt: new Date(),
        capturedRemainingSeconds: 123,
        capturedTotalSeconds: 4500,
        ...(status === 'RESUME_PENDING'
          ? { resumeAt: new Date(Date.now() + 3000), authorizedRemainingSeconds: 300 }
          : {}),
      });
      new LocalCompetitionInterruptionRepository(rig.storage).save(record);
      expect(await rig.startup.restore()).toMatchObject({ status: 'READY' });
      expect(rig.interruptions.get(completed.id)).toMatchObject({
        interruptionId: record.interruptionId,
        status: 'PAUSED',
        restartHold: false,
      });
      expect(rig.interruptions.get(completed.id)?.capturedRemainingSeconds).toBe(status === 'PAUSED' ? 123 : 4500);
      expect((await rig.competitions.findById(completed.id))!.timer.remainingSeconds).toBe(
        status === 'PAUSED' ? 123 : 4500,
      );
      await rig.interruptions.resume({
        competitionId: completed.id,
        interruptionId: record.interruptionId,
        timerStartAt: new Date(),
        authorizedRemainingSeconds: 200,
        unlimitedSightingShots: false,
      });
      expect(rig.interruptions.get(completed.id)).toMatchObject({
        interruptionId: record.interruptionId,
        status: 'RUNNING_MATCH',
      });
      expect(rig.timer.sample(completed.id)?.running).toBe(true);
      rig.timer.stop();
    },
  );

  it('returns a timed series awaiting resume to the same official stop after restart', async () => {
    const rig = await fixture(true, P25);
    new LocalCompetitionInterruptionRepository(rig.storage).save(
      LaneInterruptionRecord.create({
        competitionId: rig.active.id,
        interruptionId: 'timed-case',
        status: 'RESUME_PENDING',
        pausedAt: new Date(),
        capturedAt: new Date(),
        capturedRemainingSeconds: 20,
        capturedTotalSeconds: 30,
        resumeAt: new Date(Date.now() + 3000),
        authorizedRemainingSeconds: 20,
      }),
    );
    expect(await rig.startup.restore()).toMatchObject({ status: 'READY' });
    expect(rig.interruptions.get(rig.active.id)).toMatchObject({
      interruptionId: 'timed-case',
      status: 'PAUSED',
      resumeAt: null,
      restartHold: false,
    });
    expect(rig.restoreIndependentWorkflows).toHaveBeenCalledOnce();
  });

  it('returns READY snapshots without re-running workflows, stopping a live timer or auto-connecting again', async () => {
    const rig = await fixture(true);
    const connect = vi.fn().mockResolvedValue(undefined);
    rig.startup.afterReady(connect);
    await rig.startup.restore();
    const caseId = 'official';
    await rig.interruptions.pause({ competitionId: rig.active.id, interruptionId: caseId, pausedAt: new Date() });
    await rig.interruptions.resume({
      competitionId: rig.active.id,
      interruptionId: caseId,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 100,
      unlimitedSightingShots: false,
    });
    expect(await rig.startup.restore()).toMatchObject({ status: 'READY' });
    expect(rig.interruptions.get(rig.active.id)).toMatchObject({ status: 'RUNNING_MATCH' });
    expect(rig.timer.sample(rig.active.id)?.running).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(rig.restoreIndependentWorkflows).toHaveBeenCalledTimes(1);
    rig.timer.stop();
  });

  it.each(['workflow', 'context'])('does not arm a standalone clock if the later %s restore fails', async (step) => {
    const rig = await fixture();
    const clock = {
      competitionId: rig.active.id,
      expiresAtMs: Date.now() + 1000,
      totalSeconds: 4500,
      stageTimerIndex: 1,
    };
    rig.storage.set('competitionClock', clock);
    if (step === 'workflow')
      rig.restoreIndependentWorkflows.mockImplementation(() => {
        throw new Error('restore failed');
      });
    else vi.spyOn(rig.context, 'bootstrap').mockRejectedValueOnce(new Error('context failed'));
    expect(await rig.startup.restore()).toMatchObject({ status: 'ERROR' });
    expect(rig.startup.isReady()).toBe(false);
    expect(rig.timer.sample(rig.active.id)).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect((await rig.competitions.findById(rig.active.id))!.timer.isExpired).toBe(false);
    expect(rig.storage.get('competitionClock')).toEqual(clock);
    expect(rig.stopIndependentWorkflows).toHaveBeenCalled();
  });

  it('lets an operator set aside an unreadable pointer without deleting any saved data', async () => {
    const rig = await fixture(true);
    rig.storage.set('competition:active', 'missing');
    expect(await rig.startup.restore()).toMatchObject({ status: 'ERROR', canSetAside: false });
    await expect(rig.startup.setAsideSavedRun()).rejects.toThrow();
    rig.membership.setCompetitionId(null);
    expect(await rig.startup.snapshot()).toMatchObject({ canSetAside: true });
    const saved = rig.storage.get('competition:run');
    await rig.startup.setAsideSavedRun();
    expect(rig.storage.get('competition:active')).toBeUndefined();
    expect(rig.storage.get('competition:run')).toEqual(saved);
    expect(rig.sessions.delete).not.toHaveBeenCalled();
  });

  it('offers set aside when the saved session or config cannot be read', async () => {
    const rig = await fixture();
    vi.mocked(rig.sessions.findById).mockResolvedValue(null);
    expect(await rig.startup.restore()).toMatchObject({ status: 'ERROR', canSetAside: true, canFinish: false });
    vi.mocked(rig.sessions.findById).mockResolvedValue(rig.session);
    const saved = rig.storage.get<Record<string, unknown>>('competition:run')!;
    rig.storage.set('competition:run', { ...saved, config: null });
    expect(await rig.startup.restore()).toMatchObject({ status: 'ERROR', canSetAside: true });
    await rig.startup.setAsideSavedRun();
    expect(rig.storage.get('competition:run')).toEqual({ ...saved, config: null });
  });

  it('exposes unknown saved type recovery without creating a fallback run', async () => {
    const rig = await fixture();
    await rig.competitions.delete(rig.active.id);
    rig.createCompetition.mockRejectedValue(
      Object.assign(new Error('Unknown competition type'), { code: 'UNKNOWN_COMPETITION_TYPE' }),
    );
    expect(await rig.startup.restore()).toMatchObject({ status: 'ERROR', canChooseType: true });
    expect(rig.createCompetition).toHaveBeenCalledTimes(1);
    expect(await rig.competitions.findActive()).toBeNull();
  });

  it.each([false, true])('restores AR60 between series without replacing its run (joined=%s)', async (joined) => {
    const rig = await fixture(joined);
    let waiting = rig.active;
    for (let i = 0; i < 10; i++) waiting = waiting.recordShotInSeries();
    expect(waiting.phase).toBe('SERIES_COMPLETE');
    await rig.competitions.save(waiting);
    const deadline = Date.now() + 4000_000;
    rig.storage.set('competitionClock', {
      competitionId: waiting.id,
      expiresAtMs: deadline,
      totalSeconds: 4500,
      stageTimerIndex: waiting.currentStageIndex,
    });
    const restored = await rig.startup.restore();
    expect(restored).toMatchObject({ status: 'READY', competitionId: waiting.id, sessionId: rig.session.id });
    expect(rig.createCompetition).not.toHaveBeenCalled();
    expect((await rig.competitions.findActive())!.phase).toBe('SERIES_COMPLETE');
    const expectedHold = expect.objectContaining({
      status: 'PAUSED',
      restartHold: true,
      capturedRemainingSeconds: 4000,
    });
    const expectedClock = expect.objectContaining({ expiresAtMs: deadline });
    expect(rig.interruptions.get(waiting.id)).toEqual(joined ? expectedHold : null);
    expect(rig.timer.sample(waiting.id)?.running ?? false).toBe(!joined);
    expect(rig.storage.get('competitionClock')).toEqual(joined ? undefined : expectedClock);
    expect(rig.timer.isStageTimerRunning(waiting.id, waiting.currentStageIndex)).toBe(!joined);
    rig.timer.stop();
  });

  it('adopts and resumes an AR60 waiting-phase hold without changing its series position', async () => {
    const rig = await fixture(true);
    let waiting = rig.active;
    for (let i = 0; i < 10; i++) waiting = waiting.recordShotInSeries();
    await rig.competitions.save(waiting);
    await rig.startup.restore();
    const caseId = '11111111-1111-4111-8111-111111111111';
    await rig.interruptions.pause({ competitionId: waiting.id, interruptionId: caseId, pausedAt: new Date() });
    await rig.interruptions.resume({
      competitionId: waiting.id,
      interruptionId: caseId,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 4000,
      unlimitedSightingShots: false,
    });
    expect((await rig.competitions.findActive())!).toMatchObject({
      phase: 'SERIES_COMPLETE',
      currentSeriesIndex: waiting.currentSeriesIndex,
    });
    expect(rig.interruptions.get(waiting.id)).toMatchObject({ status: 'RUNNING_MATCH', restartHold: false });
    expect(rig.timer.sample(waiting.id)).toMatchObject({ running: true, remainingMs: 4000_000 });
    rig.timer.stop();
  });

  it('expires a standalone clock during the outage via the normal expiry event', async () => {
    const rig = await fixture();
    rig.storage.set('competitionClock', {
      competitionId: rig.active.id,
      expiresAtMs: Date.now() - 1000,
      totalSeconds: 4500,
      stageTimerIndex: rig.active.currentStageIndex,
    });
    expect(await rig.startup.restore()).toMatchObject({ status: 'READY' });
    expect((await rig.competitions.findActive())!.timer.isExpired).toBe(true);
    expect(rig.storage.get('competitionClock')).toBeUndefined();
  });

  it('shows an error plus finish when a running standalone has no deadline', async () => {
    const rig = await fixture();
    expect(await rig.startup.restore()).toMatchObject({ status: 'ERROR', canFinish: true });
    expect(rig.createCompetition).not.toHaveBeenCalled();
  });

  it('keeps a joined timed-target series under its existing restore owner', async () => {
    const rig = await fixture(true, P25);
    expect(rig.active.currentSeriesConfig.timedTargetProgramId).toBeTruthy();
    expect(await rig.startup.restore()).toMatchObject({ status: 'READY' });
    expect(rig.interruptions.get(rig.active.id)).toBeNull();
    expect(rig.restoreIndependentWorkflows).toHaveBeenCalledOnce();
  });

  it('keeps a prior restart hold with no verification evidence visibly unverified', async () => {
    const rig = await fixture(true);
    await rig.startup.restore();
    const key = 'competitionInterruption:run';
    const saved = { ...rig.storage.get<Record<string, unknown>>(key)! };
    delete saved.remainingTimeVerified;
    rig.storage.set(key, saved);
    expect(await new ActiveRunStartup(rig.deps).restore()).toMatchObject({ status: 'READY' });
    expect(rig.interruptions.get(rig.active.id)).toMatchObject({
      status: 'PAUSED',
      restartHold: true,
      remainingTimeVerified: false,
    });
  });

  it('holds an unverified joined clock without a deadline', async () => {
    const rig = await fixture(true);
    expect(await rig.startup.restore()).toMatchObject({ status: 'READY' });
    expect(rig.interruptions.get(rig.active.id)).toMatchObject({
      status: 'PAUSED',
      capturedRemainingSeconds: 4500,
      restartHold: true,
      remainingTimeVerified: false,
    });
  });

  it('lets a membershipless held run finish explicitly, preserving its session (MAJOR-1)', async () => {
    const rig = await fixture(true);
    const sessionWithShot = rig.session.recordShot(null, buildScore(), new Date());
    vi.mocked(rig.sessions.findById).mockResolvedValue(sessionWithShot);
    await rig.startup.restore();
    rig.membership.setCompetitionId(null);
    const restarted = new ActiveRunStartup(rig.deps);
    expect(await restarted.restore()).toMatchObject({ status: 'READY', canFinish: true });
    expect(rig.interruptions.get(rig.active.id)?.status).toBe('PAUSED');
    expect(rig.timer.sample(rig.active.id)?.running ?? false).toBe(false);
    const finish = createFinishCompetitionHandler(rig.competitions, rig.sessions, createMockEventBus());
    await finish({ competitionId: rig.active.id });
    expect((await rig.competitions.findById(rig.active.id))!.phase).toBe('FINISHED');
    expect(rig.sessions.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: rig.session.id, allShots: sessionWithShot.allShots }),
    );
    expect(rig.sessions.delete).not.toHaveBeenCalled();
    await restarted.restore();
    expect(rig.createCompetition).not.toHaveBeenCalled();
  });

  it('keeps damaged membership A / active B visible until cleanup, then restores B standalone (MAJOR-2)', async () => {
    const rig = await fixture(false, BR60S);
    const old = CompetitionState.create('old', rig.session.id, BR60S.config).finish();
    await rig.competitions.save(old);
    const idle = CompetitionState.create('newer', rig.session.id, BR60S.config);
    await rig.competitions.save(idle);
    rig.membership.setCompetitionId('old');
    expect(await rig.startup.restore()).toMatchObject({ status: 'ERROR', competitionId: idle.id, canFinish: false });
    expect((await rig.competitions.findActive())!.id).toBe(idle.id);
    expect(rig.createCompetition).not.toHaveBeenCalled();
    rig.membership.setCompetitionId(null);
    expect(await rig.startup.restore()).toMatchObject({ status: 'READY', competitionId: idle.id, canFinish: true });
  });

  it('preserves a finished membership run for Director finish/leave retry without creating a replacement', async () => {
    const rig = await fixture(true);
    await rig.competitions.save(rig.active.finish());
    expect(await rig.startup.restore()).toMatchObject({
      status: 'READY',
      competitionId: rig.active.id,
      canFinish: false,
    });
    expect(rig.createCompetition).not.toHaveBeenCalled();
    expect(rig.interruptions.get(rig.active.id)).toBeNull();
  });

  it('creates only once when there is no active run and shares concurrent startup requests', async () => {
    const rig = await fixture();
    await rig.competitions.delete(rig.active.id);
    const first = rig.startup.restore();
    expect(rig.startup.restore()).toBe(first);
    await first;
    expect(rig.createCompetition).toHaveBeenCalledTimes(1);
  });

  it('rejects a contradictory safety timer owner', async () => {
    const rig = await fixture();
    const startup = new ActiveRunStartup({
      ...rig.deps,
      safetyStopped: () => true,
      safetyCompetitionId: () => 'other',
    });
    expect(await startup.restore()).toMatchObject({ status: 'ERROR' });
    expect(rig.createCompetition).not.toHaveBeenCalled();
  });

  it('fails a dangling pointer or missing session without creating a replacement', async () => {
    const rig = await fixture();
    rig.storage.set('competition:active', 'missing');
    expect(await rig.startup.restore()).toMatchObject({ status: 'ERROR' });
    await rig.competitions.save(rig.active);
    vi.mocked(rig.sessions.findById).mockResolvedValue(null);
    expect(await rig.startup.restore()).toMatchObject({ status: 'ERROR' });
    expect(rig.createCompetition).not.toHaveBeenCalled();
  });

  it('defers auto-connect callbacks until READY and never invokes them on ERROR', async () => {
    const rig = await fixture();
    const connect = vi.fn().mockResolvedValue(undefined);
    rig.startup.afterReady(connect);
    expect(connect).not.toHaveBeenCalled();
    await rig.startup.restore();
    expect(connect).not.toHaveBeenCalled();
    await rig.competitions.save(CompetitionState.create('idle', rig.session.id, AR60.config));
    await rig.startup.restore();
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
