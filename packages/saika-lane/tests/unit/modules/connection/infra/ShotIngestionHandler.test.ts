// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => logger,
  initializeLogger: vi.fn(),
  resetLogger: vi.fn(),
}));

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S, P25, R3P60, R3P_FINAL } from '@/main/modules/competition/domain/competitionTypes';
import { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import type { ShotRoutingDeps } from '@/main/modules/connection/application/ShotRoutingService';
import type { ShotData } from '@/main/modules/connection/domain/ShotData';
import { createShotIngestionHandler } from '@/main/modules/connection/infra/ShotIngestionHandler';

import { athleteCompetition, selectAthlete } from '../../../../helpers/athleteCompetition';
import { buildSession } from '../../../../helpers/factories';
import {
  createMockCommandBus,
  createMockEventBus,
  createMockCompetitionRepository,
  createMockSessionRepository,
  createMockShotObservationRepository,
} from '../../../../helpers/mockDependencies';

describe('ShotIngestionHandler', () => {
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let competitionRepository: ReturnType<typeof createMockCompetitionRepository>;
  let shotObservationRepository: ReturnType<typeof createMockShotObservationRepository>;
  let deps: ShotRoutingDeps;
  let shotData: ShotData;

  beforeEach(() => {
    vi.clearAllMocks();
    commandBus = createMockCommandBus();
    sessionRepository = createMockSessionRepository();
    competitionRepository = createMockCompetitionRepository();
    shotObservationRepository = createMockShotObservationRepository();
    deps = {
      eventBus: createMockEventBus(),
      commandBus,
      sessionRepository,
      competitionRepository,
      shotObservationRepository,
    };

    shotData = {
      x: 1.5,
      y: -2.3,
      timestamp: new Date('2026-01-15T10:00:00Z'),
      score: 9.8,
    };
  });

  it('should return a function', () => {
    const handler = createShotIngestionHandler(deps);
    expect(typeof handler).toBe('function');
  });

  it('should skip recording when no active session exists', async () => {
    sessionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(shotObservationRepository.append).toHaveBeenCalledTimes(1);
    expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'NO_ACTIVE_SESSION' }),
      expect.objectContaining({ outcome: 'NO_ACTIVE_SESSION', competition: null }),
    );
  });

  it('should execute RecordShot command when active session exists', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({
        sessionId: session.id,
        deviceScore: 9.8,
        sourceObservationId: expect.any(String),
        receivedAt: expect.any(Date),
      }),
    );
    expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RECORDED', sessionId: session.id }),
      expect.objectContaining({ outcome: 'RECORDED', sessionId: session.id }),
    );
  });

  it('should serialize concurrently received shots in arrival order', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    let releaseFirstExecution!: () => void;
    const firstExecution = new Promise<void>((resolve) => {
      releaseFirstExecution = resolve;
    });
    (commandBus.execute as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => firstExecution)
      .mockResolvedValueOnce(undefined);

    const firstShot = { ...shotData, timestamp: new Date('2026-01-15T10:00:00Z') };
    const secondShot = { ...shotData, timestamp: new Date('2026-01-15T10:00:01Z') };
    const handler = createShotIngestionHandler(deps);

    const firstResult = handler(firstShot);
    const secondResult = handler(secondShot);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(commandBus.execute).toHaveBeenCalledTimes(1);

    releaseFirstExecution();
    await Promise.all([firstResult, secondResult]);

    expect(commandBus.execute).toHaveBeenCalledTimes(2);
    expect((commandBus.execute as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1].timestamp)).toEqual([
      firstShot.timestamp,
      secondShot.timestamp,
    ]);
  });

  it('should use the active competition session instead of an older active session', async () => {
    const staleSession = buildSession();
    const competitionSession = buildSession();
    const activeCompetition = CompetitionState.create(
      'competition-001',
      competitionSession.id,
      BR60S.config,
    ).startStage();
    sessionRepository.findActive = vi.fn().mockResolvedValue(staleSession);
    sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
    competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(sessionRepository.findById).toHaveBeenCalledWith(competitionSession.id);
    expect(sessionRepository.findActive).not.toHaveBeenCalled();
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({
        sessionId: competitionSession.id,
      }),
    );
  });

  it('should use the active competition stage mode after restarting during match', async () => {
    const competitionSession = buildSession();
    const activeCompetition = CompetitionState.create('competition-001', competitionSession.id, BR60S.config)
      .startStage()
      .endStage()
      .advanceToNextStage()
      .startNextSeries();
    sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
    competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);

    const handler = createShotIngestionHandler(deps);
    await handler({ ...shotData, mode: 'SIGHTING' });

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({
        sessionId: competitionSession.id,
        mode: expect.objectContaining({ value: 'MATCH' }),
      }),
    );
  });

  it('honours athlete-controlled SIGHTING mode before a new 3-position position', async () => {
    const competitionSession = buildSession();
    let activeCompetition = CompetitionState.create('competition-001', competitionSession.id, R3P60.config)
      .startStage()
      .endStage()
      .advanceToNextStage()
      .startNextSeries();
    for (let index = 0; index < 20; index++) activeCompetition = activeCompetition.recordShotInSeries();
    expect(activeCompetition.currentSeriesConfig).toMatchObject({
      position: 'PRONE',
      targetModeControl: 'ATHLETE',
    });
    sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
    competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);

    await createShotIngestionHandler(deps)({ ...shotData, mode: 'SIGHTING' });

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({ mode: expect.objectContaining({ value: 'SIGHTING' }) }),
    );
  });

  it.each([
    ['ACTIVE', true, 'SIGHTING'],
    ['ACTIVE', false, 'MATCH'],
    ['IDLE', true, 'MATCH'],
  ] as const)(
    'classifies a reported Match shot in %s with pending unlimited=%s as %s',
    async (phase, unlimitedSightingShots, expected) => {
      const session = buildSession();
      const active = CompetitionState.create('competition-pending', session.id, BR60S.config)
        .startStage()
        .endStage()
        .advanceToNextStage()
        .startNextSeries();
      const competition = CompetitionState.reconstruct({ ...active, phase });
      const interruption = LaneInterruptionRecord.create({
        competitionId: competition.id,
        interruptionId: 'pending-interruption',
        status: 'RESUME_PENDING',
        unlimitedSightingShots,
        pausedAt: new Date(),
        capturedAt: new Date(),
        capturedRemainingSeconds: 240,
        capturedTotalSeconds: 600,
      });
      vi.mocked(competitionRepository.findActive).mockResolvedValue(competition);
      vi.mocked(sessionRepository.findById).mockResolvedValue(session);
      deps.interruptionReader = { get: () => interruption };

      await createShotIngestionHandler(deps)({ ...shotData, mode: 'MATCH' });

      expect(commandBus.execute).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'RecordShot' }),
        expect.objectContaining({ sessionId: session.id, mode: expect.objectContaining({ value: expected }) }),
      );
    },
  );

  it.each([
    [0, 'SIGHTING', 'MATCH', 'SIGHTING'],
    [0, 'MATCH', 'SIGHTING', 'MATCH'],
    [1, undefined, 'SIGHTING', 'MATCH'],
    [1, 'MATCH', 'SIGHTING', 'MATCH'],
  ] as const)(
    'resolves count=%s selection=%s reported=%s to %s under the athlete cutoff',
    async (count, selection, reported, expected) => {
      let state = athleteCompetition();
      if (count) state = state.recordShotInSeries();
      if (selection) {
        if (selection === 'MATCH' && count === 0) state = selectAthlete(state, 'SIGHTING');
        state = selectAthlete(state, selection);
      }
      competitionRepository.findActive = vi.fn().mockResolvedValue(state);
      sessionRepository.findById = vi.fn().mockResolvedValue(buildSession());
      await createShotIngestionHandler(deps)({ ...shotData, mode: reported });
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'RecordShot' }),
        expect.objectContaining({ mode: expect.objectContaining({ value: expected }) }),
      );
    },
  );

  it('does not treat independent shoot-off sighting as an ATHLETE mode observation', async () => {
    const state = athleteCompetition();
    competitionRepository.findActive = vi.fn().mockResolvedValue(state);
    sessionRepository.findById = vi.fn().mockResolvedValue(buildSession());
    deps.shootOffReader = { canAcceptShot: vi.fn().mockReturnValue(true), getState: vi.fn().mockReturnValue(null) };
    await createShotIngestionHandler(deps)({ ...shotData, mode: 'MATCH' });
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mode: expect.objectContaining({ value: 'SIGHTING' }),
        competitionContext: {
          competitionId: state.id,
          stageIndex: state.currentStageIndex,
          seriesIndex: state.currentSeriesIndex,
        },
      }),
    );
  });

  it('forces shots in a Final position-change interval to SIGHTING even if the target reports MATCH', async () => {
    const competitionSession = buildSession();
    let activeCompetition = CompetitionState.create('competition-001', competitionSession.id, R3P_FINAL.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries();
    for (let index = 0; index < 20; index++) activeCompetition = activeCompetition.recordShotInSeries();
    expect(activeCompetition.currentSeriesConfig.purpose).toBe('POSITION_CHANGE_AND_SIGHTING');
    sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
    competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);

    await createShotIngestionHandler(deps)({ ...shotData, mode: 'MATCH' });

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({ mode: expect.objectContaining({ value: 'SIGHTING' }) }),
    );
    expect(shotObservationRepository.append).toHaveBeenCalledWith(expect.objectContaining({ reportedMode: 'MATCH' }));
  });

  it.each([false, true])(
    'preserves unscored 25m evidence and distinguishes timing review (%s) from an outside-window decision',
    async (review) => {
      const competitionSession = buildSession();
      const activeCompetition = CompetitionState.create('competition-001', competitionSession.id, P25.config)
        .startStage()
        .expireTimer()
        .advanceToNextStage()
        .startNextSeries();
      sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
      competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);
      deps.timedTargetReader = {
        tryAcceptShot: vi.fn().mockReturnValue({
          governed: true,
          allowed: false,
          timingReviewRequired: review,
          purpose: 'MATCH',
          targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
          sequenceId: '00000000-0000-4000-8000-000000000001',
          exposureIndex: null,
          warning: null,
          reason: 'Shot was observed during timed target phase ATTENTION',
        }),
      };

      await createShotIngestionHandler(deps)(shotData);

      expect(deps.timedTargetReader.tryAcceptShot).toHaveBeenCalledWith(
        expect.objectContaining({ timestampSource: 'LANE_RECEIPT' }),
      );
      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(shotObservationRepository.append).toHaveBeenCalledOnce();
      expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          type: review ? 'QUARANTINED_TIMING_REVIEW' : 'REJECTED_TIMED_TARGET_WINDOW',
          sessionId: competitionSession.id,
          detail: expect.stringContaining('ATTENTION'),
        }),
        expect.objectContaining({
          outcome: review ? 'QUARANTINED_TIMING_REVIEW' : 'REJECTED_TIMED_TARGET_WINDOW',
          competition: expect.objectContaining({
            competitionId: activeCompetition.id,
            stageIndex: 1,
            seriesIndex: 0,
          }),
        }),
      );
    },
  );

  it('keeps an independent Final shoot-off window outside the completed MATCH timed-target guard', async () => {
    const competitionSession = buildSession();
    const activeCompetition = CompetitionState.create('competition-001', competitionSession.id, P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries();
    sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
    competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);
    deps.shootOffReader = {
      canAcceptShot: vi.fn().mockReturnValue(true),
      getState: vi.fn().mockReturnValue(null),
    };
    deps.timedTargetReader = {
      tryAcceptShot: vi.fn().mockReturnValue({
        governed: true,
        allowed: false,
        purpose: 'MATCH',
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        sequenceId: '00000000-0000-4000-8000-000000000001',
        exposureIndex: null,
        warning: null,
        reason: 'The preceding MATCH sequence is complete',
      }),
    };

    await createShotIngestionHandler(deps)(shotData);

    expect(deps.timedTargetReader.tryAcceptShot).not.toHaveBeenCalled();
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({ mode: expect.objectContaining({ value: 'SIGHTING' }) }),
    );
  });

  it('requires the shoot-off timed-target window when the independent window names a program', async () => {
    const competitionSession = buildSession();
    const activeCompetition = CompetitionState.create('competition-001', competitionSession.id, P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries();
    sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
    competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);
    deps.shootOffReader = {
      canAcceptShot: vi.fn().mockReturnValue(true),
      getState: vi.fn().mockReturnValue({
        timedTargetProgramId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
      } as ReturnType<NonNullable<ShotRoutingDeps['shootOffReader']>['getState']>),
    };
    deps.timedTargetReader = {
      tryAcceptShot: vi.fn().mockReturnValue({
        governed: true,
        allowed: true,
        purpose: 'SHOOT_OFF',
        targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
        sequenceId: '00000000-0000-4000-8000-000000000001',
        exposureIndex: 2,
        warning: null,
        reason: 'Shot is inside the valid EST recording window',
      }),
    };

    await createShotIngestionHandler(deps)(shotData);

    expect(deps.timedTargetReader.tryAcceptShot).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        expectedShootOffProgramId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
      }),
    );
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({
        mode: expect.objectContaining({ value: 'SIGHTING' }),
        targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
        scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
      }),
    );
  });

  it('uses timed purpose and stage target profile for an accepted 25m sighting shot', async () => {
    const competitionSession = buildSession();
    const activeCompetition = CompetitionState.create('competition-001', competitionSession.id, P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries();
    sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
    competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);
    deps.timedTargetReader = {
      tryAcceptShot: vi.fn().mockReturnValue({
        governed: true,
        allowed: true,
        purpose: 'SIGHTING',
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        sequenceId: '00000000-0000-4000-8000-000000000001',
        exposureIndex: 0,
        warning: null,
        reason: 'Shot is inside the valid EST recording window',
      }),
    };

    await createShotIngestionHandler(deps)({ ...shotData, mode: 'MATCH' });

    expect(deps.timedTargetReader.tryAcceptShot).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: activeCompetition.id,
        expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
        expectedSightingProgramId: 'P25_SIGHTING_PRECISION_240',
      }),
    );
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({
        mode: expect.objectContaining({ value: 'SIGHTING' }),
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
      }),
    );
  });

  it('records an isolated timed-target MATCH acquisition outside the competition series', async () => {
    const competitionSession = buildSession();
    const activeCompetition = CompetitionState.create('competition-001', competitionSession.id, P25.config)
      .startStage()
      .expireTimer()
      .advanceToNextStage()
      .startNextSeries();
    sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
    competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);
    deps.timedTargetReader = {
      tryAcceptShot: vi.fn().mockReturnValue({
        governed: true,
        allowed: true,
        purpose: 'MATCH',
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        sequenceId: '00000000-0000-4000-8000-000000000001',
        exposureIndex: 0,
        warning: null,
        reason: 'Shot is inside the isolated recovery window',
        executionContext: {
          shotDisposition: 'ISOLATED',
          owner: 'qualification-recovery',
          referenceId: '00000000-0000-4000-8000-000000000099',
        },
      }),
    };

    await createShotIngestionHandler(deps)({ ...shotData, mode: 'MATCH' });

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({
        mode: expect.objectContaining({ value: 'SIGHTING' }),
        acquisitionContext: {
          shotDisposition: 'ISOLATED',
          owner: 'qualification-recovery',
          referenceId: '00000000-0000-4000-8000-000000000099',
        },
      }),
    );
  });

  it('should pass ImpactPoint with correct coordinates', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { impactPoint: { x: number; y: number } };
    expect(input.impactPoint.x).toBe(1.5);
    expect(input.impactPoint.y).toBe(-2.3);
  });

  it.each([undefined, 'DEVICE_REPORTED', 'UNKNOWN'] as const)(
    'preserves shot timestamps with source %s',
    async (timestampSource) => {
      const session = buildSession();
      sessionRepository.findActive = vi.fn().mockResolvedValue(session);
      competitionRepository.findActive = vi.fn().mockResolvedValue(null);

      const handler = createShotIngestionHandler(deps);
      await handler({ ...shotData, ...(timestampSource ? { timestampSource } : {}) });

      const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const input = callArgs[1] as { timestamp: Date };
      expect(input.timestamp).toEqual(new Date('2026-01-15T10:00:00Z'));
      expect(shotObservationRepository.append).toHaveBeenCalledWith(
        expect.objectContaining({ timestampSource: timestampSource ?? 'LANE_RECEIPT' }),
      );
    },
  );

  it('should reject shot when competition guard rejects', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    const competition = CompetitionState.create(crypto.randomUUID(), session.id, BR60S.config)
      .startStage()
      .expireTimer();
    competitionRepository.findActive = vi.fn().mockResolvedValue(competition);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(shotObservationRepository.append).toHaveBeenCalledTimes(1);
    expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REJECTED_COMPETITION_PHASE' }),
      expect.objectContaining({
        outcome: 'REJECTED_COMPETITION_PHASE',
        timestampSource: 'LANE_RECEIPT',
        competition: expect.objectContaining({ competitionId: competition.id, phase: 'SERIES_COMPLETE' }),
      }),
    );
  });

  it('quarantines target evidence without scoring while the safety latch is stopped', async () => {
    const session = buildSession();
    const competition = CompetitionState.create(crypto.randomUUID(), session.id, BR60S.config).startStage();
    competitionRepository.findActive = vi.fn().mockResolvedValue(competition);
    deps.safetyStopReader = {
      isStopped: () => true,
      getState: () =>
        ({ safetyStopId: '77777777-7777-4777-8777-777777777777' }) as ReturnType<
          NonNullable<ShotRoutingDeps['safetyStopReader']>['getState']
        >,
    };

    await createShotIngestionHandler(deps)(shotData);

    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'QUARANTINED_SAFETY_STOP',
        sessionId: session.id,
        detail: 'safetyStopId=77777777-7777-4777-8777-777777777777',
      }),
      expect.objectContaining({ outcome: 'QUARANTINED_SAFETY_STOP' }),
    );
  });

  it('should accept shot when competition is in IDLE (training mode)', async () => {
    const session = buildSession();
    sessionRepository.findById = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi
      .fn()
      .mockResolvedValue(CompetitionState.create(crypto.randomUUID(), session.id, BR60S.config));

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
  });

  it('should allow shot when competition guard accepts', async () => {
    const session = buildSession();
    sessionRepository.findById = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi
      .fn()
      .mockResolvedValue(CompetitionState.create(crypto.randomUUID(), session.id, BR60S.config).startStage());

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
  });

  it('should allow shot when no active competition exists', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
  });

  it('should not throw when command execution fails', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);
    (commandBus.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Command failed'));

    const handler = createShotIngestionHandler(deps);

    // Should not throw — error is caught internally
    await expect(handler(shotData)).resolves.toBeUndefined();
  });

  it('should handle deviceScore as undefined', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: 0, y: 0, timestamp: new Date() });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { deviceScore?: number };
    expect(input.deviceScore).toBeUndefined();
  });

  it('should pass impactPoint: null when x and y are null (miss shot)', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: null, y: null, timestamp: new Date(), score: 0 });

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { impactPoint: unknown };
    expect(input.impactPoint).toBeNull();
  });

  it('should pass impactPoint: null when only x is null', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: null, y: 1.0, timestamp: new Date() });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { impactPoint: unknown };
    expect(input.impactPoint).toBeNull();
  });

  it('should pass mode from ShotData to RecordShotCommand', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: 1.0, y: 2.0, timestamp: new Date(), score: 9.5, mode: 'MATCH' });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { mode?: { value: string } };
    expect(input.mode?.value).toBe('MATCH');
  });

  it('should pass mode: SIGHTING from ShotData to RecordShotCommand', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: 1.0, y: 2.0, timestamp: new Date(), score: 9.5, mode: 'SIGHTING' });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { mode?: { value: string } };
    expect(input.mode?.value).toBe('SIGHTING');
  });

  it('should pass mode: undefined when ShotData has no mode field', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: 1.0, y: 2.0, timestamp: new Date(), score: 9.5 });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { mode?: unknown };
    expect(input.mode).toBeUndefined();
  });

  describe('routing outcomes and failures', () => {
    const outcomeTypes = (): string[] =>
      vi.mocked(shotObservationRepository.appendOutcomeWithEvidence).mock.calls.map(([outcome]) => outcome.type);

    function timedTargetCompetition() {
      const competitionSession = buildSession();
      const activeCompetition = CompetitionState.create('competition-001', competitionSession.id, P25.config)
        .startStage()
        .expireTimer()
        .advanceToNextStage()
        .startNextSeries();
      sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
      competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);
      return { competitionSession, activeCompetition };
    }

    it('passes the exact RecordShot input for a shot outside a competition', async () => {
      const session = buildSession();
      sessionRepository.findActive = vi.fn().mockResolvedValue(session);

      await createShotIngestionHandler(deps)({ ...shotData, mode: 'MATCH' });

      const input = vi.mocked(commandBus.execute).mock.calls[0]![1] as Record<string, unknown>;
      expect(Object.keys(input)).toEqual([
        'sessionId',
        'impactPoint',
        'timestamp',
        'receivedAt',
        'deviceScore',
        'reportedMode',
        'sourceObservationId',
        'mode',
      ]);
      expect(input).toMatchObject({ sessionId: session.id, deviceScore: 9.8, reportedMode: 'MATCH' });
    });

    it('passes the competition context, profiles and execution context to RecordShot in order', async () => {
      const { competitionSession, activeCompetition } = timedTargetCompetition();
      deps.timedTargetReader = {
        tryAcceptShot: vi.fn().mockReturnValue({
          governed: true,
          allowed: true,
          purpose: 'MATCH',
          targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
          sequenceId: '00000000-0000-4000-8000-000000000001',
          exposureIndex: 0,
          warning: 'late frame',
          timingEvidence: 'evidence',
          reason: 'Shot is inside the valid EST recording window',
          executionContext: { shotDisposition: 'SERIES', owner: 'competition', referenceId: 'ref-1' },
        }),
      };

      await createShotIngestionHandler(deps)(shotData);

      const input = vi.mocked(commandBus.execute).mock.calls[0]![1] as Record<string, unknown>;
      expect(Object.keys(input)).toEqual([
        'sessionId',
        'impactPoint',
        'timestamp',
        'receivedAt',
        'deviceScore',
        'reportedMode',
        'sourceObservationId',
        'competitionContext',
        'mode',
        'targetProfileId',
        'scoringGaugeProfileId',
        'acquisitionContext',
      ]);
      expect(input.competitionContext).toEqual({
        competitionId: activeCompetition.id,
        stageIndex: 1,
        seriesIndex: 0,
      });
      expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RECORDED', sessionId: competitionSession.id, detail: 'late frame' }),
        expect.objectContaining({
          competition: {
            competitionId: activeCompetition.id,
            phase: 'ACTIVE',
            stageIndex: 1,
            seriesIndex: 0,
            stageScored: true,
          },
        }),
      );
    });

    it('records the timing evidence as the detail when there is no warning', async () => {
      timedTargetCompetition();
      deps.timedTargetReader = {
        tryAcceptShot: vi.fn().mockReturnValue({
          governed: true,
          allowed: true,
          purpose: 'MATCH',
          targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
          sequenceId: '00000000-0000-4000-8000-000000000001',
          exposureIndex: 0,
          warning: null,
          timingEvidence: 'measured 12 ms',
          reason: 'Shot is inside the valid EST recording window',
        }),
      };

      await createShotIngestionHandler(deps)(shotData);

      expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RECORDED', detail: 'measured 12 ms' }),
        expect.anything(),
      );
    });

    it('records PROCESSING_FAILED with the error message when RecordShot fails', async () => {
      const session = buildSession();
      sessionRepository.findActive = vi.fn().mockResolvedValue(session);
      vi.mocked(commandBus.execute).mockRejectedValue(new Error('Command failed'));

      await createShotIngestionHandler(deps)(shotData);

      expect(outcomeTypes()).toEqual(['PROCESSING_FAILED']);
      expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PROCESSING_FAILED', sessionId: null, detail: 'Command failed' }),
        expect.anything(),
      );
      expect(logger.error).toHaveBeenCalledWith('Failed to record shot', 'usb', { error: expect.any(String) });
    });

    it('records no outcome when the observation itself cannot be stored', async () => {
      vi.mocked(shotObservationRepository.append).mockRejectedValue(new Error('disk full'));

      await createShotIngestionHandler(deps)(shotData);

      expect(competitionRepository.findActive).not.toHaveBeenCalled();
      expect(shotObservationRepository.appendOutcomeWithEvidence).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Failed to record shot', 'usb', { error: expect.any(String) });
    });

    it('logs when the failure outcome cannot be stored either', async () => {
      const session = buildSession();
      sessionRepository.findActive = vi.fn().mockResolvedValue(session);
      vi.mocked(commandBus.execute).mockRejectedValue(new Error('Command failed'));
      vi.mocked(shotObservationRepository.appendOutcomeWithEvidence).mockRejectedValue(new Error('disk full'));

      await expect(createShotIngestionHandler(deps)(shotData)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith('Failed to record shot observation outcome', 'usb', {
        error: expect.stringContaining('disk full'),
      });
      expect(logger.error).toHaveBeenCalledWith('Failed to record shot', 'usb', {
        error: expect.stringContaining('Command failed'),
      });
    });

    it('notifies each finalized evidence id, and a failing notification does not change the outcome', async () => {
      const session = buildSession();
      sessionRepository.findActive = vi.fn().mockResolvedValue(session);
      const onObservationFinalized = vi.fn(() => {
        throw new Error('listener failed');
      });

      await createShotIngestionHandler({ ...deps, onObservationFinalized })(shotData);

      const [outcome, evidence] = vi.mocked(shotObservationRepository.appendOutcomeWithEvidence).mock.calls[0]!;
      expect(outcomeTypes()).toEqual(['RECORDED']);
      expect(evidence.evidenceId).toBe(outcome.id);
      expect(onObservationFinalized).toHaveBeenCalledExactlyOnceWith(evidence.evidenceId);
      expect(logger.warn).toHaveBeenCalledWith('Shot observation evidence notification failed', 'usb', {
        error: 'listener failed',
      });
    });

    it.each([
      ['target scoring profile', { targetProfileId: 'NOT_A_FACE' }, 'Unknown target scoring profile: NOT_A_FACE'],
      ['scoring gauge profile', { scoringGaugeProfileId: 'NOT_A_GAUGE' }, 'Unknown scoring gauge profile: NOT_A_GAUGE'],
    ])('fails processing for an unknown %s', async (_, override, message) => {
      const session = buildSession();
      sessionRepository.findById = vi.fn().mockResolvedValue(session);
      competitionRepository.findActive = vi
        .fn()
        .mockResolvedValue(
          CompetitionState.create(crypto.randomUUID(), session.id, { ...BR60S.config, ...override }).startStage(),
        );

      await createShotIngestionHandler(deps)(shotData);

      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PROCESSING_FAILED', detail: message }),
        expect.anything(),
      );
    });

    it('fails processing for a timed-target series without the enforcement service', async () => {
      timedTargetCompetition();

      await createShotIngestionHandler(deps)(shotData);

      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PROCESSING_FAILED',
          detail: 'Timed target enforcement service is unavailable',
        }),
        expect.anything(),
      );
    });

    it('fails processing for a timed-target series without a target scoring profile', async () => {
      const competitionSession = buildSession();
      const config = { ...P25.config, targetProfileId: undefined };
      const activeCompetition = CompetitionState.create('competition-001', competitionSession.id, {
        ...config,
        stages: config.stages.map((stage) => ({ ...stage, targetProfileId: undefined })),
      })
        .startStage()
        .expireTimer()
        .advanceToNextStage()
        .startNextSeries();
      competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);
      deps.timedTargetReader = { tryAcceptShot: vi.fn() };

      await createShotIngestionHandler(deps)(shotData);

      expect(deps.timedTargetReader.tryAcceptShot).not.toHaveBeenCalled();
      expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PROCESSING_FAILED',
          detail: 'Timed target stage has no target scoring profile',
        }),
        expect.anything(),
      );
    });

    it('consults no other gate and reads no session while the safety latch is stopped', async () => {
      const { activeCompetition } = timedTargetCompetition();
      deps.safetyStopReader = { isStopped: () => true, getState: () => null };
      deps.shootOffReader = { canAcceptShot: vi.fn(), getState: vi.fn() };
      deps.timedTargetReader = { tryAcceptShot: vi.fn() };

      await createShotIngestionHandler(deps)(shotData);

      expect(deps.shootOffReader.canAcceptShot).not.toHaveBeenCalled();
      expect(deps.timedTargetReader.tryAcceptShot).not.toHaveBeenCalled();
      expect(sessionRepository.findById).not.toHaveBeenCalled();
      expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'QUARANTINED_SAFETY_STOP',
          sessionId: activeCompetition.sessionId,
          detail: 'safetyStopId=unknown',
        }),
        expect.anything(),
      );
      expect(logger.warn).toHaveBeenCalledWith('Shot quarantined while Lane safety stop is active', 'usb', {
        safetyStopId: 'unknown',
      });
    });

    it('quarantines without a competition while the safety latch is stopped', async () => {
      deps.safetyStopReader = { isStopped: () => true, getState: () => null };

      await createShotIngestionHandler(deps)(shotData);

      expect(sessionRepository.findActive).not.toHaveBeenCalled();
      const [outcome] = vi.mocked(shotObservationRepository.appendOutcomeWithEvidence).mock.calls[0]!;
      expect(outcome).toMatchObject({ type: 'QUARANTINED_SAFETY_STOP', sessionId: null });
    });

    it('logs the timed-target rejection with its sequence and reason', async () => {
      timedTargetCompetition();
      deps.timedTargetReader = {
        tryAcceptShot: vi.fn().mockReturnValue({
          governed: true,
          allowed: false,
          purpose: 'MATCH',
          targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
          sequenceId: 'sequence-1',
          exposureIndex: null,
          warning: null,
          reason: 'outside',
        }),
      };

      await createShotIngestionHandler(deps)(shotData);

      expect(sessionRepository.findById).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Shot rejected outside the timed target recording window', 'usb', {
        sequenceId: 'sequence-1',
        reason: 'outside',
      });
    });

    it('rejects a phase-guarded shot without reading the session', async () => {
      const session = buildSession();
      competitionRepository.findActive = vi
        .fn()
        .mockResolvedValue(CompetitionState.create(crypto.randomUUID(), session.id, BR60S.config).finish());

      await createShotIngestionHandler(deps)(shotData);

      expect(sessionRepository.findById).not.toHaveBeenCalled();
      expect(shotObservationRepository.appendOutcomeWithEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REJECTED_COMPETITION_PHASE',
          sessionId: session.id,
          detail: 'phase=FINISHED',
        }),
        expect.anything(),
      );
      expect(logger.debug).toHaveBeenCalledWith('Shot rejected by competition guard', 'usb', { phase: 'FINISHED' });
    });

    it('logs a missing session', async () => {
      await createShotIngestionHandler(deps)(shotData);

      expect(logger.warn).toHaveBeenCalledWith('No active session for shot data', 'usb');
    });
  });
});
