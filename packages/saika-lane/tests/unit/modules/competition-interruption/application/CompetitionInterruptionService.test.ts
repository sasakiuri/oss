import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SwitchModeInput } from '@/main/composition/tokens';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { CompetitionInterruptionService } from '@/main/modules/competition-interruption/application/CompetitionInterruptionService';
import type { ICompetitionInterruptionRepository } from '@/main/modules/competition-interruption/domain/ICompetitionInterruptionRepository';
import type { LaneInterruptionRecord } from '@/main/modules/competition-interruption/domain/LaneInterruptionRecord';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import { athleteCompetition, selectAthlete } from '../../../../helpers/athleteCompetition';
import { createMockCommandBus, createMockEventBus } from '../../../../helpers/mockDependencies';

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
    service = new CompetitionInterruptionService(repository, competitionRepository, timerService, commandBus, eventBus);
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

  it.each(['resume', 'resumeMatch', 'restoreActive'] as const)(
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
        if (selection) state = selectAthlete(state, selection);
        vi.mocked(competitionRepository.findById).mockResolvedValue(state);
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
          else await service.restoreActive();
        }
        expect(commandBus.execute).toHaveBeenCalledExactlyOnceWith(
          expect.anything(),
          expect.objectContaining({
            sessionId: state.sessionId,
            preserveSeries: true,
            mode: expect.objectContaining({ value: expected }),
          }),
        );
        expect(state.athleteTargetMode).toBe(selection);
        expect(competitionRepository.save).not.toHaveBeenCalled();
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

  it('restores an authorized Lane timer and mode from durable state after restart', async () => {
    await service.pause({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      pausedAt: new Date('2026-08-31T01:00:00.000Z'),
    });
    await service.resume({
      competitionId: COMPETITION_ID,
      interruptionId: INTERRUPTION_ID,
      timerStartAt: new Date('2026-08-31T01:10:00.000Z'),
      authorizedRemainingSeconds: 540,
      unlimitedSightingShots: true,
    });

    vi.clearAllMocks();
    const restartedEventBus = createMockEventBus();
    const restarted = new CompetitionInterruptionService(
      repository,
      competitionRepository,
      timerService,
      commandBus,
      restartedEventBus,
    );

    const restored = await restarted.restoreActive();

    expect(restored?.status).toBe('SIGHTING');
    expect(timerService.resumeAt).toHaveBeenCalledWith(COMPETITION_ID, '2026-08-31T01:10:00.000Z', 540);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        preserveSeries: true,
        mode: expect.objectContaining({ value: 'SIGHTING' }),
      }),
    );
    expect(restartedEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CompetitionInterruptionChanged', status: 'SIGHTING' }),
    );
  });
});
