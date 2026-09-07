import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { P25, P25_FINAL } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import {
  MalfunctionFiringService,
  SqliteMalfunctionFiringRepository,
  type MalfunctionFiringRequest,
} from '@/main/modules/malfunction-firing';
import { AssignedFinalRecoveryFiringContextSource } from '@/main/modules/mqtt/application/AssignedFinalRecoveryFiringContextSource';
import { AssignedMalfunctionFiringContextSource } from '@/main/modules/mqtt/application/AssignedMalfunctionFiringContextSource';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { TimedTargetSequenceService, SqliteTimedTargetSequenceRepository } from '@/main/modules/timed-target';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import { MalfunctionFiringEvidenceSchema } from '@/shared/mqtt/MalfunctionFiring';

describe('isolated malfunction firing', () => {
  let db: Database.Database,
    bus: TypedEventBus,
    timing: TimedTargetSequenceService,
    timingRepository: SqliteTimedTargetSequenceRepository,
    repository: SqliteMalfunctionFiringRepository,
    service: MalfunctionFiringService,
    competition: CompetitionState,
    request: MalfunctionFiringRequest;
  let stopped = false,
    athleteId = '';
  let source: AssignedMalfunctionFiringContextSource | AssignedFinalRecoveryFiringContextSource;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'));
    db = createSqliteDb(':memory:');
    bus = new TypedEventBus();
    stopped = false;
    athleteId = crypto.randomUUID();
    competition = CompetitionState.create(crypto.randomUUID(), crypto.randomUUID(), P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries()
      .recordShotInSeries()
      .recordShotInSeries();
    const competitions = { findActive: async () => competition } as ICompetitionRepository;
    source = new AssignedMalfunctionFiringContextSource(
      competitions,
      {
        getCurrentAssignment: () => ({
          competitionId: competition.id,
          athlete: { id: athleteId, name: 'Athlete', startNumber: 1 },
          assignedAt: null,
        }),
      },
      () => !stopped,
    );
    timingRepository = new SqliteTimedTargetSequenceRepository(db);
    timing = new TimedTargetSequenceService(timingRepository, {
      publish: (state) =>
        bus.emit({
          type: 'TimedTargetSequenceChanged',
          aggregateId: state.competitionId,
          timestamp: Date.now(),
          state,
        }),
    });
    repository = new SqliteMalfunctionFiringRepository(db);
    service = makeService();
    request = {
      runId: crypto.randomUUID(),
      caseId: crypto.randomUUID(),
      authorizationId: crypto.randomUUID(),
      competitionId: competition.id,
      participantId: athleteId,
      sessionId: competition.sessionId,
      rulePackFingerprint: P25.rulePackIdentity!.fingerprint.value,
      stageIndex: 1,
      seriesIndex: 0,
      recordedShots: 2,
      remedy: 'COMPLETE_REMAINING_SHOTS',
      shotsToFire: 3,
      officialName: 'RO',
      decidedAt: new Date().toISOString(),
      loadAt: new Date(Date.now() + 3000).toISOString(),
    };
  });
  afterEach(() => {
    timing.dispose();
    db.close();
    vi.useRealTimers();
  });
  function makeService() {
    return new MalfunctionFiringService(
      repository,
      source,
      timing,
      bus,
      undefined,
      (id) => timingRepository.findBySequenceId(id)?.acceptedShots.map((shot) => shot.observationId) ?? [],
    );
  }
  function accept(observationId = crypto.randomUUID()) {
    const decision = timing.tryAcceptShot({
      competitionId: competition.id,
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: competition.currentSeriesConfig.timedTargetProgramId!,
      targetProfileId: competition.config.targetProfileId!,
      observationId,
      firedAt: new Date(),
    });
    return { observationId, decision };
  }
  function record(observationId: string, owner = 'qualification-malfunction') {
    const shot = Shot.create({
      impactPoint: new ImpactPoint(1, 1),
      score: new Score(100),
      mode: Mode.match(),
      timestamp: new Date(),
      shotNumber: 1,
      seriesNumber: 1,
      innerTen: true,
      sourceObservationId: observationId,
    });
    bus.emit({
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: competition.sessionId,
      shot,
      scoringMode: 'RING',
      acquisitionContext: { shotDisposition: 'ISOLATED', owner, referenceId: request.runId },
    });
    return shot;
  }

  it('records a durable cancellation before a delayed START can arrive, without inventing a program', async () => {
    const cancelled = service.cancel(request.competitionId, request.runId, 'CRO cancelled before LOAD', request);
    expect(cancelled).toMatchObject({ status: 'CANCELLED', plan: null, targetProfileId: null, startedAt: null });
    expect(MalfunctionFiringEvidenceSchema.parse(cancelled).status).toBe('CANCELLED');
    expect((await service.start(request)).status).toBe('CANCELLED');
    expect(timing.getState()).toBeNull();
    expect(() =>
      service.cancel(request.competitionId, request.runId, 'Wrong request', { ...request, shotsToFire: 1 }),
    ).toThrow(/differ/);
  });

  it('keeps Final recovery observations isolated and rejects Qualification, stale identity and count mismatches', async () => {
    competition = CompetitionState.create(crypto.randomUUID(), crypto.randomUUID(), P25_FINAL.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries()
      .recordShotInSeries()
      .recordShotInSeries();
    source = new AssignedFinalRecoveryFiringContextSource(
      { findActive: async () => competition } as ICompetitionRepository,
      {
        getCurrentAssignment: () => ({
          competitionId: competition.id,
          athlete: { id: athleteId, name: 'Finalist', startNumber: 1 },
          assignedAt: null,
        }),
      },
      () => !stopped,
    );
    request = {
      ...request,
      workflow: 'FINAL_RECOVERY',
      finalIncident: 'MALFUNCTION',
      competitionId: competition.id,
      sessionId: competition.sessionId,
      rulePackFingerprint: P25_FINAL.rulePackIdentity!.fingerprint.value,
      stageIndex: competition.currentStageIndex,
      seriesIndex: competition.currentSeriesIndex,
    };
    service = makeService();
    await expect(service.start({ ...request, workflow: undefined })).rejects.toThrow(/active Final/);
    await expect(service.start({ ...request, participantId: 'another athlete' })).rejects.toThrow(/finalist/);
    await expect(service.start({ ...request, shotsToFire: 2 })).rejects.toThrow(/rule plan/);
    const run = await service.start(request);
    expect(run.plan!.shotsToFire).toBe(3);
    expect(timing.getState()!.executionContext?.owner).toBe('final-recovery');
    const schedule = timingRepository.findBySequenceId(request.runId)!;
    await vi.advanceTimersByTimeAsync(schedule.schedule.exposures[0]!.greenAt.getTime() - Date.now() + 100);
    record(crypto.randomUUID(), 'final-recovery');
    expect(service.read(request.competitionId, request.runId).shots).toHaveLength(1);
    expect(competition.seriesShotCount).toBe(2);
    service.cancel(request.competitionId, request.runId, 'Finish review');
    expect((await service.start(request)).status).toBe('CANCELLED');
  });

  it('collects durable evidence without changing the original competition and detects missing capture', async () => {
    const started = await service.start(request);
    expect(started.plan!.program.exposures[0]!.nominalDurationMilliseconds).toBe(144000);
    await vi.advanceTimersByTimeAsync(70100);
    const first = accept();
    expect(first.decision.executionContext).toEqual({
      shotDisposition: 'ISOLATED',
      owner: 'qualification-malfunction',
      referenceId: request.runId,
    });
    expect(service.read(request.competitionId, request.runId).captureIssues).toHaveLength(1);
    const shot = record(first.observationId);
    record(first.observationId);
    record(crypto.randomUUID(), 'qualification-recovery');
    await vi.advanceTimersByTimeAsync(200000);
    const evidence = service.read(request.competitionId, request.runId);
    expect(evidence).toMatchObject({
      status: 'COMPLETED',
      captureIssues: [],
      shots: [{ shotId: shot.id, eligible: true }],
    });
    expect(evidence.shots).toHaveLength(1);
    expect(competition.seriesShotCount).toBe(2);
    expect(MalfunctionFiringEvidenceSchema.safeParse(evidence).success).toBe(true);
    expect(() => db.prepare('DELETE FROM malfunction_firing_shots').run()).toThrow('append-only');
  });

  it('retries the same run after restart without refiring and binds an authorization once', async () => {
    const first = await service.start(request);
    expect(await service.start(request)).toEqual(first);
    await expect(service.start({ ...request, shotsToFire: 2 })).rejects.toThrow('bound');
    service.cancel(request.competitionId, request.runId, 'Official cancellation');
    bus.clear();
    service = makeService();
    expect((await service.start(request)).status).toBe('CANCELLED');
    await expect(
      service.start({
        ...request,
        runId: crypto.randomUUID(),
        loadAt: timing.getState()!.nextLoadAllowedAt.toISOString(),
      }),
    ).rejects.toThrow('UNIQUE');
    expect(() => service.read(crypto.randomUUID(), request.runId)).toThrow('this competition');
  });

  it.each(['athlete', 'session', 'stage', 'fingerprint', 'safety', 'shots', 'oldTime'] as const)(
    'rejects stale or invalid %s before writing a run',
    async (kind) => {
      if (kind === 'athlete') athleteId = 'other';
      if (kind === 'session') request = { ...request, sessionId: crypto.randomUUID() };
      if (kind === 'stage') request = { ...request, stageIndex: 2 };
      if (kind === 'fingerprint') request = { ...request, rulePackFingerprint: 'a'.repeat(64) };
      if (kind === 'safety') stopped = true;
      if (kind === 'shots') request = { ...request, shotsToFire: 5 };
      if (kind === 'oldTime') request = { ...request, loadAt: new Date(Date.now() - 1000).toISOString() };
      await expect(service.start(request)).rejects.toThrow();
      expect(repository.find(request.runId)).toBeNull();
    },
  );

  it('preserves shots needing review and never makes them eligible merely because enforcement is advisory', async () => {
    timing.dispose();
    timing = new TimedTargetSequenceService(timingRepository, { publish: () => {} }, 'ADVISORY');
    bus.clear();
    service = makeService();
    await service.start(request);
    const early = accept();
    expect(early.decision.allowed).toBe(true);
    record(early.observationId);
    const evidence = service.read(request.competitionId, request.runId);
    expect(evidence.shots[0]).toMatchObject({ eligible: false, reviewReason: 'Outside authorized recording window' });
  });

  it('retains a cancelled start when timing rejects LOAD, without repeating it on retry', async () => {
    const start = vi.spyOn(timing, 'start').mockImplementation(() => {
      throw new Error('UNLOAD is required');
    });
    await expect(service.start(request)).rejects.toThrow('UNLOAD is required');
    expect((await service.start(request)).status).toBe('CANCELLED');
    expect(start).toHaveBeenCalledOnce();
  });

  it('closes an orphaned run after timing recovery is unavailable', async () => {
    await service.start(request);
    vi.spyOn(timing, 'getState').mockReturnValue(null);
    service.restore();
    expect(repository.find(request.runId)).toMatchObject({ status: 'CANCELLED' });
  });
});
