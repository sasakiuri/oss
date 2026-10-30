import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SwitchModeInput } from '@/main/composition/tokens';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { CompetitionInterruptionService } from '@/main/modules/competition-interruption/application/CompetitionInterruptionService';
import type { ICompetitionInterruptionRepository } from '@/main/modules/competition-interruption/domain/ICompetitionInterruptionRepository';
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import { athleteCompetition, selectAthlete } from '../../../../helpers/athleteCompetition';
import { buildSession } from '../../../../helpers/factories';
import {
  createMockCommandBus,
  createMockEventBus,
  createMockSessionRepository,
} from '../../../../helpers/mockDependencies';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const INTERRUPTION_ID = '22222222-2222-4222-8222-222222222222';

describe('CompetitionInterruptionService', () => {
  let stored: LaneInterruptionRecord | null;
  let repository: ICompetitionInterruptionRepository;
  let competitionRepository: ICompetitionRepository;
  let timerService: LaneTimerService;
  let commandBus: CommandBus;
  let eventBus: IEventBus;
  let service: CompetitionInterruptionService;
  let sessions: ReturnType<typeof createMockSessionRepository>;

  beforeEach(() => {
    const activeCompetition = CompetitionState.create(COMPETITION_ID, 'session-1', BR60S.config).startStage();
    stored = null;
    repository = {
      findByCompetitionId: vi.fn(() => stored),
      save: vi.fn((record) => {
        stored = record;
      }),
      delete: vi.fn(() => {
        stored = null;
      }),
    };
    competitionRepository = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(activeCompetition),
      findBySessionId: vi.fn(),
      findActive: vi.fn().mockResolvedValue(activeCompetition),
      delete: vi.fn(),
    };
    timerService = {
      stop: vi.fn(),
      pause: vi.fn().mockResolvedValue({ remainingSeconds: 240, totalSeconds: 600 }),
      resumeAt: vi.fn().mockResolvedValue(undefined),
    } as unknown as LaneTimerService;
    commandBus = createMockCommandBus();
    vi.mocked(commandBus.execute).mockResolvedValue(undefined);
    eventBus = createMockEventBus();
    sessions = createMockSessionRepository();
    vi.mocked(sessions.findById).mockImplementation(async () => buildSession());
    service = new CompetitionInterruptionService(
      repository,
      competitionRepository,
      timerService,
      commandBus,
      eventBus,
      sessions,
    );
  });

  it('persists the exact Lane countdown when a pause is applied', async () => {
    const record = await service.pause({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      pausedAt: new Date('2026-08-31T01:00:00.000Z'),
    });

    expect(timerService.pause).toHaveBeenCalledWith(COMPETITION_ID);
    expect(record).toMatchObject({
      status: 'PAUSED',
      capturedRemainingSeconds: 240,
      capturedTotalSeconds: 600,
    });
    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'CompetitionInterruptionChanged' }));
  });

  it('uses a recoverable pending state while applying an authorized sighting resume', async () => {
    await service.pause({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      pausedAt: new Date('2026-08-31T01:00:00.000Z'),
    });
    vi.mocked(timerService.resumeAt).mockRejectedValueOnce(new Error('timer unavailable'));
    const input = {
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      timerStartAt: new Date('2026-08-31T01:10:00.000Z'),
      authorizedRemainingSeconds: 540,
      unlimitedSightingShots: true,
    };

    await expect(service.resume(input)).rejects.toThrow('timer unavailable');
    expect(stored?.status).toBe('RESUME_PENDING');

    const resumed = await service.resume(input);
    expect(resumed.status).toBe('SIGHTING');
    expect(timerService.resumeAt).toHaveBeenLastCalledWith(COMPETITION_ID, '2026-08-31T01:10:00.000Z', 540);
    expect(commandBus.execute).toHaveBeenCalledTimes(2);

    const matched = await service.resumeMatch({ competitionId: COMPETITION_ID, interruptionId: INTERRUPTION_ID });
    expect(matched.status).toBe('RUNNING_MATCH');

    const duplicatePause = await service.pause({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      pausedAt: new Date('2026-08-31T01:11:00.000Z'),
    });
    expect(duplicatePause.status).toBe('RUNNING_MATCH');
    expect(timerService.pause).toHaveBeenCalledTimes(1);
  });

  it.each(['resume', 'resumeMatch'] as const)(
    'restores SIGHTING in an unscored stage through %s',
    async (operation) => {
      await service.pause({ competitionId: COMPETITION_ID, interruptionId: INTERRUPTION_ID, pausedAt: new Date() });
      await service.resume({
        competitionId: COMPETITION_ID,
        interruptionId: INTERRUPTION_ID,
        timerStartAt: new Date(),
        authorizedRemainingSeconds: 240,
        unlimitedSightingShots: operation === 'resumeMatch',
      });
      if (operation === 'resumeMatch')
        await service.resumeMatch({ competitionId: COMPETITION_ID, interruptionId: INTERRUPTION_ID });
      const expectedCalls = operation === 'resume' ? 1 : 2;
      expect(commandBus.execute).toHaveBeenCalledTimes(expectedCalls);
      expect(
        vi.mocked(commandBus.execute).mock.calls.map(([, input]) => (input as SwitchModeInput).mode.value),
      ).toEqual(Array(expectedCalls).fill('SIGHTING'));
      expect(commandBus.execute).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ preserveSeries: true, mode: expect.objectContaining({ value: 'SIGHTING' }) }),
      );
    },
  );

  it('persists RUNNING_MATCH before switching mode so a concurrent refresh reads the resumed mode', async () => {
    const competition = CompetitionState.create(COMPETITION_ID, 'session-1', BR60S.config)
      .startStage()
      .endStage()
      .advanceToNextStage()
      .startNextSeries();
    vi.mocked(competitionRepository.findById).mockResolvedValue(competition);
    vi.mocked(competitionRepository.findActive).mockResolvedValue(competition);
    await service.pause({ competitionId: COMPETITION_ID, interruptionId: INTERRUPTION_ID, pausedAt: new Date() });
    await service.resume({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 240,
      unlimitedSightingShots: true,
    });
    const cache = new SessionContextCache(eventBus);
    await cache.bootstrap(sessions, competitionRepository, service);
    expect(cache.getContext().mode.value).toBe('SIGHTING');
    vi.mocked(commandBus.execute).mockImplementationOnce(async (_token, input) => {
      expect(repository.findByCompetitionId(COMPETITION_ID)?.status).toBe('RUNNING_MATCH');
      await cache.bootstrap(sessions, competitionRepository, service);
      expect(cache.getContext().mode.value).toBe('MATCH');
      expect((input as SwitchModeInput).mode.value).toBe('MATCH');
    });

    await service.resumeMatch({ competitionId: COMPETITION_ID, interruptionId: INTERRUPTION_ID });

    expect(stored?.status).toBe('RUNNING_MATCH');
    expect(cache.getContext().mode.value).toBe('MATCH');
  });

  it.each(['resume', 'resumeMatch'] as const)(
    'reapplies the aggregate selection and cutoff through %s',
    async (operation) => {
      for (const [selection, count, expected] of [
        [undefined, 0, 'MATCH'],
        ['SIGHTING', 0, 'SIGHTING'],
        ['MATCH', 0, 'MATCH'],
        [undefined, 1, 'MATCH'],
        ['MATCH', 1, 'MATCH'],
      ] as const) {
        let state = CompetitionState.reconstruct({ ...athleteCompetition(), id: COMPETITION_ID });
        if (count) state = state.recordShotInSeries();
        if (selection) {
          if (selection === 'MATCH' && count === 0) state = selectAthlete(state, 'SIGHTING');
          state = selectAthlete(state, selection);
        }
        vi.mocked(competitionRepository.findById).mockImplementation(async () => state);
        vi.mocked(competitionRepository.save).mockClear();
        vi.mocked(competitionRepository.save).mockImplementation(async (updated) => {
          state = updated;
        });
        vi.mocked(competitionRepository.findActive).mockResolvedValue(state);
        stored = null;
        vi.mocked(commandBus.execute).mockClear();
        await service.pause({ competitionId: COMPETITION_ID, interruptionId: INTERRUPTION_ID, pausedAt: new Date() });
        const resume = {
          competitionId: COMPETITION_ID,
          interruptionId: INTERRUPTION_ID,
          timerStartAt: new Date(),
          authorizedRemainingSeconds: 240,
          unlimitedSightingShots: operation === 'resumeMatch',
        };
        await service.resume(resume);
        const resumedInput = vi.mocked(commandBus.execute).mock.lastCall![1] as SwitchModeInput;
        expect(resumedInput.mode.value).toBe(operation === 'resumeMatch' ? 'SIGHTING' : expected);
        if (operation !== 'resume') {
          vi.mocked(commandBus.execute).mockClear();
          if (operation === 'resumeMatch')
            await service.resumeMatch({ competitionId: COMPETITION_ID, interruptionId: INTERRUPTION_ID });
        }
        expect(commandBus.execute).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          expect.objectContaining({
            sessionId: state.sessionId,
            preserveSeries: true,
            mode: expect.objectContaining({
              value: operation === 'resumeMatch' && count === 0 ? 'SIGHTING' : expected,
            }),
          }),
        );
        expect(state.athleteTargetMode).toBe(operation === 'resumeMatch' && count === 0 ? 'SIGHTING' : selection);
        expect(competitionRepository.save).toHaveBeenCalledTimes(operation === 'resumeMatch' && count === 0 ? 1 : 0);
      }
    },
  );

  it('clears a completed timer override so later broadcast commands can proceed', async () => {
    await service.pause({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      pausedAt: new Date('2026-08-31T01:00:00.000Z'),
    });
    await service.resume({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 240,
      unlimitedSightingShots: false,
    });

    eventBus.emit({
      type: 'TimerExpired',
      timestamp: Date.now(),
      aggregateId: COMPETITION_ID,
      stageIndex: 1,
    });
    expect(service.get(COMPETITION_ID)).toBeNull();
  });

  it('holds a previously running authorization under a fresh adoptable UUID', async () => {
    await service.pause({ competitionId: COMPETITION_ID, interruptionId: INTERRUPTION_ID, pausedAt: new Date() });
    await service.resume({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      timerStartAt: new Date(),
      authorizedRemainingSeconds: 540,
      unlimitedSightingShots: true,
    });
    vi.clearAllMocks();
    const active = (await competitionRepository.findById(COMPETITION_ID))!;
    await service.holdAfterRestart(active, 430, true);
    const held = service.get(COMPETITION_ID)!;
    expect(held).toMatchObject({ status: 'PAUSED', restartHold: true, capturedRemainingSeconds: 430 });
    expect(held.interruptionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(held.interruptionId).not.toBe(INTERRUPTION_ID);
    expect(timerService.resumeAt).not.toHaveBeenCalled();
    expect(commandBus.execute).not.toHaveBeenCalled();
    await expect(
      service.resume({
        competitionId: COMPETITION_ID,
        interruptionId: held.interruptionId,
        timerStartAt: new Date(),
        authorizedRemainingSeconds: 500,
        unlimitedSightingShots: false,
      }),
    ).rejects.toThrow('official Lane pause');
    await expect(
      service.resumeMatch({ competitionId: COMPETITION_ID, interruptionId: held.interruptionId }),
    ).rejects.toThrow('official Lane pause');
    // Repeated boots must not accidentally turn a Lane marker into an official grant.
    await service.holdAfterRestart(active, 400, false);
    expect(service.get(COMPETITION_ID)).toMatchObject({
      interruptionId: held.interruptionId,
      restartHold: true,
      capturedRemainingSeconds: 430,
    });
    await service.pause({ competitionId: COMPETITION_ID, interruptionId: held.interruptionId, pausedAt: new Date() });
    expect(service.get(COMPETITION_ID)?.restartHold).toBe(true);
    const adopted = await service.pause({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      pausedAt: new Date(),
    });
    expect(adopted).toMatchObject({
      interruptionId: INTERRUPTION_ID,
      restartHold: false,
      capturedRemainingSeconds: 430,
    });
    await expect(
      service.resumeMatch({ competitionId: COMPETITION_ID, interruptionId: held.interruptionId }),
    ).rejects.toThrow('does not match');
    await expect(
      service.pause({ competitionId: COMPETITION_ID, interruptionId: 'other-case', pausedAt: new Date() }),
    ).rejects.toThrow('already handling');
  });

  it.each(['PAUSED', 'RESUME_PENDING'] as const)('keeps an open %s official case on restart', async (status) => {
    await service.pause({ competitionId: COMPETITION_ID, interruptionId: INTERRUPTION_ID, pausedAt: new Date() });
    let failure = Promise.resolve('PAUSED');
    if (status === 'RESUME_PENDING') {
      vi.mocked(timerService.resumeAt).mockRejectedValueOnce(new Error('interrupted'));
      failure = service
        .resume({
          competitionId: COMPETITION_ID,
          interruptionId: INTERRUPTION_ID,
          timerStartAt: new Date(),
          authorizedRemainingSeconds: 500,
          unlimitedSightingShots: false,
        })
        .then(
          () => 'unexpected success',
          (error: Error) => error.message,
        );
    }
    expect(await failure).toBe(status === 'RESUME_PENDING' ? 'interrupted' : 'PAUSED');
    const active = (await competitionRepository.findById(COMPETITION_ID))!;
    await service.holdAfterRestart(active, 200, true);
    expect(service.get(COMPETITION_ID)).toMatchObject({
      interruptionId: INTERRUPTION_ID,
      status: 'PAUSED',
      restartHold: false,
    });
    await expect(
      service.resume({
        competitionId: COMPETITION_ID,
        interruptionId: INTERRUPTION_ID,
        timerStartAt: new Date(),
        authorizedRemainingSeconds: 300,
        unlimitedSightingShots: false,
      }),
    ).resolves.toMatchObject({ status: 'RUNNING_MATCH' });
  });
});
