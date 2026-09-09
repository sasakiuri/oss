// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/errors/ErrorCatalog', () => ({
  ErrorCatalog: {
    createError: (code: string, metadata?: Record<string, unknown>) => {
      const err = new Error(metadata?.detail ? `${code}: ${metadata.detail}` : code);
      (err as unknown as { code: string }).code = code;
      return err;
    },
  },
}));

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S, P25, P25_FINAL, RFPM_FINAL } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { Timer } from '@/main/modules/competition/domain/Timer';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import { BroadcastCommandHandler } from '@/main/modules/mqtt/application/commands/BroadcastCommandHandler';
import { CommandIdempotencyGuard } from '@/main/modules/mqtt/application/commands/CommandIdempotencyGuard';
import type { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ITimedTargetControl } from '@/main/modules/timed-target';

import { createMockCommandBus } from '../../../../../helpers/mockDependencies';

function createMockMqttClient(): IMqttClientService {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    setWill: vi.fn(),
    onMessage: vi.fn().mockReturnValue(() => {}),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

function createMockTimerService(): LaneTimerService {
  return {
    start: vi.fn(),
    startAt: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    expire: vi.fn().mockResolvedValue(undefined),
    processTick: vi.fn(),
  } as unknown as LaneTimerService;
}

// Valid UUIDs (version 4 format)
const LANE_ID = 'a1111111-1111-4111-a111-111111111111';
const COMPETITION_ID = 'b2222222-2222-4222-a222-222222222222';
const COMMAND_ID = 'c3333333-3333-4333-a333-333333333333';
const OTHER_LANE_ID = 'e5555555-5555-4555-a555-555555555555';
const RUN_ID = 'f6666666-6666-4666-a666-666666666666';

function buildCommand(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandId: COMMAND_ID,
    issuedBy: 'director',
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createCompetitionState(
  phase: CompetitionState['phase'],
  currentStageIndex: number,
  currentSeriesIndex: number,
): CompetitionState {
  return CompetitionState.reconstruct({
    id: COMPETITION_ID,
    sessionId: 'd4444444-4444-4444-a444-444444444444',
    config: BR60S.config,
    phase,
    currentStageIndex,
    currentSeriesIndex,
    seriesShotCount: 0,
    timer: Timer.create(0),
    startedAt: null,
    finishedAt: phase === 'FINISHED' ? Date.now() : null,
  });
}

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

describe('BroadcastCommandHandler', () => {
  let mqttClient: IMqttClientService;
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let timerService: LaneTimerService;
  let competitionRepository: Pick<ICompetitionRepository, 'findById'>;
  let competitionStatePublisher: LaneCompetitionStatePublisher;
  let scorePublisher: LaneScorePublisher;
  let competitionState: CompetitionState;
  let guard: CommandIdempotencyGuard;
  let interruptionControl: ICompetitionInterruptionControl;
  let shootOffControl: ICompetitionShootOffControl;
  let handler: BroadcastCommandHandler;
  let messageHandler: (topic: string, payload: Buffer) => void;

  beforeEach(() => {
    mqttClient = createMockMqttClient();
    commandBus = createMockCommandBus();
    timerService = createMockTimerService();
    competitionState = createCompetitionState('ACTIVE', 0, 0);
    competitionRepository = {
      findById: vi.fn(async () => competitionState),
    };
    competitionStatePublisher = {
      publishCurrentState: vi.fn().mockResolvedValue(undefined),
    } as unknown as LaneCompetitionStatePublisher;
    scorePublisher = {
      publishCurrentScore: vi.fn().mockResolvedValue(undefined),
    } as unknown as LaneScorePublisher;
    guard = new CommandIdempotencyGuard();
    interruptionControl = {
      pause: vi.fn(),
      resume: vi.fn(),
      resumeMatch: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      clear: vi.fn(),
    };
    shootOffControl = {
      open: vi.fn((input) => ({ ...input, status: 'OPEN' as const, recordedShotIds: [] })),
      close: vi.fn(),
      getState: vi.fn().mockReturnValue(null),
      canAcceptShot: vi.fn().mockReturnValue(false),
      recordShot: vi.fn(),
    };
    handler = new BroadcastCommandHandler(
      mqttClient,
      commandBus,
      timerService,
      competitionRepository as ICompetitionRepository,
      competitionStatePublisher,
      scorePublisher,
      guard,
      () => LANE_ID,
      COMPETITION_ID,
      interruptionControl,
      undefined,
      shootOffControl,
    );

    (mqttClient.onMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (h: (topic: string, payload: Buffer) => void) => {
        messageHandler = h;
        return () => {
          /* unsubscribe */
        };
      },
    );

    (commandBus.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function sendMessage(action: string, payload: Record<string, unknown>): Promise<void> {
    await handler.subscribeToCompetition(COMPETITION_ID);
    const topic = `saika/competition/${COMPETITION_ID}/command/${action}`;
    messageHandler(topic, Buffer.from(JSON.stringify(payload)));
    await flushPromises();
  }

  it('subscribes to competition broadcast topic', async () => {
    await handler.subscribeToCompetition(COMPETITION_ID);

    expect(mqttClient.subscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/command/+`, 1);
  });

  it('unsubscribes from competition broadcast topic', async () => {
    await handler.subscribeToCompetition(COMPETITION_ID);
    await handler.unsubscribeFromCompetition();

    expect(mqttClient.unsubscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/command/+`);
  });

  describe('start-sighting', () => {
    beforeEach(() => {
      competitionState = createCompetitionState('IDLE', 0, 0);
    });

    it('executes StartPreparation + timer startAt', async () => {
      const now = new Date().toISOString();
      const cmd = buildCommand({
        timerStartAt: now,
        timerDurationSeconds: 900,
      });

      await sendMessage('start-sighting', cmd);

      expect(commandBus.execute).toHaveBeenCalledOnce();
      expect(timerService.startAt).toHaveBeenCalledWith(COMPETITION_ID, now, 900);
    });

    it('skips when targetLaneIds does not include our laneId', async () => {
      const cmd = buildCommand({
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 900,
        targetLaneIds: ['d4444444-4444-4444-a444-444444444444'],
      });

      await sendMessage('start-sighting', cmd);

      expect(commandBus.execute).not.toHaveBeenCalled();
    });

    it('proceeds when targetLaneIds includes our laneId', async () => {
      const cmd = buildCommand({
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 900,
        targetLaneIds: [LANE_ID],
      });

      await sendMessage('start-sighting', cmd);

      expect(commandBus.execute).toHaveBeenCalled();
    });

    it('does not reset a Lane that already started sighting when a new commandId is retried', async () => {
      competitionState = createCompetitionState('ACTIVE', 0, 0);
      const cmd = buildCommand({
        commandId: 'd4444444-4444-4444-a444-444444444444',
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 900,
      });

      await sendMessage('start-sighting', cmd);

      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(timerService.startAt).toHaveBeenCalledOnce();
    });
  });

  describe('end-sighting', () => {
    it('executes EndPreparation', async () => {
      await sendMessage('end-sighting', buildCommand());

      expect(commandBus.execute).toHaveBeenCalled();
    });
  });

  describe('shoot-off', () => {
    beforeEach(() => {
      competitionState = CompetitionState.reconstruct({
        id: COMPETITION_ID,
        sessionId: 'd4444444-4444-4444-a444-444444444444',
        config: { ...BR60S.config, name: 'Final' },
        phase: 'SERIES_COMPLETE',
        currentStageIndex: 0,
        currentSeriesIndex: 0,
        seriesShotCount: 0,
        timer: Timer.create(0),
        startedAt: null,
        finishedAt: null,
      });
    });

    it('opens and closes one targeted tie-break window', async () => {
      const timerStartAt = new Date().toISOString();
      await sendMessage(
        'start-shoot-off',
        buildCommand({
          runId: RUN_ID,
          iteration: 1,
          timerStartAt,
          timerDurationSeconds: 50,
          shotsPerLane: 1,
          targetLaneIds: [LANE_ID, OTHER_LANE_ID],
        }),
      );

      expect(shootOffControl.open).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        runId: RUN_ID,
        iteration: 1,
        timerStartAt,
        timerDurationSeconds: 50,
        shotsPerLane: 1,
      });

      await sendMessage(
        'stop-shoot-off',
        buildCommand({
          commandId: 'a7777777-7777-4777-a777-777777777777',
          runId: RUN_ID,
          iteration: 1,
          targetLaneIds: [LANE_ID, OTHER_LANE_ID],
        }),
      );

      expect(shootOffControl.close).toHaveBeenCalledWith(COMPETITION_ID, RUN_ID, 1);
    });

    it('ignores a targeted command for another pair of Lanes', async () => {
      await sendMessage(
        'start-shoot-off',
        buildCommand({
          runId: RUN_ID,
          iteration: 1,
          timerStartAt: new Date().toISOString(),
          timerDurationSeconds: 50,
          shotsPerLane: 1,
          targetLaneIds: [OTHER_LANE_ID, 'a7777777-7777-4777-a777-777777777777'],
        }),
      );

      expect(shootOffControl.open).not.toHaveBeenCalled();
      expect(mqttClient.publish).not.toHaveBeenCalled();
    });

    it('does not open a window when safety STOP activates during the competition lookup', async () => {
      let stopped = false;
      competitionRepository = {
        findById: vi.fn(async () => {
          stopped = true;
          return competitionState;
        }),
      };
      const safetyStopControl = {
        isStopped: vi.fn(() => stopped),
        getState: vi.fn(() => ({ safetyStopId: 'a7777777-7777-4777-a777-777777777777' })),
      } as unknown as Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>;
      handler = new BroadcastCommandHandler(
        mqttClient,
        commandBus,
        timerService,
        competitionRepository as ICompetitionRepository,
        competitionStatePublisher,
        scorePublisher,
        guard,
        () => LANE_ID,
        COMPETITION_ID,
        interruptionControl,
        safetyStopControl,
        shootOffControl,
      );

      await sendMessage(
        'start-shoot-off',
        buildCommand({
          runId: RUN_ID,
          iteration: 1,
          timerStartAt: new Date().toISOString(),
          timerDurationSeconds: 50,
          shotsPerLane: 1,
          targetLaneIds: [LANE_ID, OTHER_LANE_ID],
        }),
      );

      expect(shootOffControl.open).not.toHaveBeenCalled();
      const acknowledgements = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter((call) => call[0].includes('/acknowledgement/'));
      expect(JSON.parse(acknowledgements.at(-1)![1])).toMatchObject({
        status: 'error',
        error: { message: expect.stringContaining('Safety stop') },
      });
    });
  });

  describe('start-match', () => {
    beforeEach(() => {
      competitionState = createCompetitionState('SERIES_COMPLETE', 0, 0);
    });

    it('executes StartMatch + timer startAt', async () => {
      const now = new Date().toISOString();
      const cmd = buildCommand({
        timerStartAt: now,
        timerDurationSeconds: 3600,
      });

      await sendMessage('start-match', cmd);

      expect(commandBus.execute).toHaveBeenCalledTimes(2);
      expect(vi.mocked(commandBus.execute).mock.calls.map(([token]) => token.name)).toEqual([
        'AdvanceStage',
        'StartNextSeries',
      ]);
      expect(timerService.startAt).toHaveBeenCalledWith(COMPETITION_ID, now, 3600);
    });

    it('resumes only StartNextSeries when AdvanceStage already succeeded', async () => {
      competitionState = createCompetitionState('STAGE_ENTERED', 1, 0);
      const now = new Date().toISOString();

      await sendMessage(
        'start-match',
        buildCommand({
          commandId: 'e5555555-5555-4555-a555-555555555555',
          timerStartAt: now,
          timerDurationSeconds: 3600,
        }),
      );

      expect(commandBus.execute).toHaveBeenCalledOnce();
      expect(vi.mocked(commandBus.execute).mock.calls[0]?.[0].name).toBe('StartNextSeries');
    });

    it('rejects a conventional MATCH start without its generic timer duration', async () => {
      await sendMessage('start-match', buildCommand({ timerStartAt: new Date().toISOString() }));

      expect(commandBus.execute).not.toHaveBeenCalled();
      const acknowledgements = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter(([topic]) => topic.includes('/acknowledgement/'));
      expect(JSON.parse(acknowledgements.at(-1)?.[1] as string)).toMatchObject({
        status: 'error',
        error: { message: 'A conventional match requires timerDurationSeconds' },
      });
    });
  });

  describe('timed-target commands', () => {
    let timedTargetControl: ITimedTargetControl;

    beforeEach(() => {
      competitionState = CompetitionState.create(COMPETITION_ID, 'd4444444-4444-4444-a444-444444444444', P25.config)
        .startStage()
        .expireTimer()
        .advanceToNextStage()
        .startNextSeries();
      timedTargetControl = {
        enforcementMode: 'REQUIRED',
        start: vi.fn().mockReturnValue({}),
        cancel: vi.fn().mockReturnValue({}),
        getState: vi.fn().mockReturnValue(null),
        tryAcceptShot: vi.fn(),
        restore: vi.fn(),
        dispose: vi.fn(),
      } as unknown as ITimedTargetControl;
      handler = new BroadcastCommandHandler(
        mqttClient,
        commandBus,
        timerService,
        competitionRepository as ICompetitionRepository,
        competitionStatePublisher,
        scorePublisher,
        guard,
        () => LANE_ID,
        COMPETITION_ID,
        interruptionControl,
        undefined,
        shootOffControl,
        undefined,
        timedTargetControl,
      );
    });

    it('arms the RulePack program at the Director supplied absolute LOAD time', async () => {
      const loadAt = new Date().toISOString();

      await sendMessage(
        'start-timed-target',
        buildCommand({
          programId: 'P25_MATCH_PRECISION_240',
          purpose: 'MATCH',
          stageIndex: 1,
          seriesIndex: 0,
          loadAt,
          targetLaneIds: [LANE_ID],
        }),
      );

      expect(timedTargetControl.start).toHaveBeenCalledWith({
        sequenceId: COMMAND_ID,
        competitionId: COMPETITION_ID,
        program: expect.objectContaining({ id: 'P25_MATCH_PRECISION_240', purpose: 'MATCH' }),
        stageIndex: 1,
        seriesIndex: 0,
        targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
        loadAt: new Date(loadAt),
      });
    });

    it('arms one simultaneous RulePack sequence and an independent five-shot shoot-off window', async () => {
      competitionState = CompetitionState.reconstruct({
        id: COMPETITION_ID,
        sessionId: 'd4444444-4444-4444-a444-444444444444',
        config: P25_FINAL.config,
        phase: 'SERIES_COMPLETE',
        currentStageIndex: 1,
        currentSeriesIndex: 0,
        seriesShotCount: 5,
        timer: Timer.create(0),
        startedAt: Date.now(),
        finishedAt: null,
      });
      vi.mocked(timedTargetControl.start).mockReturnValue({
        sequenceId: COMMAND_ID,
      } as ReturnType<ITimedTargetControl['start']>);
      const loadAt = new Date(Date.now() + 5_000).toISOString();

      await sendMessage(
        'start-shoot-off',
        buildCommand({
          runId: RUN_ID,
          iteration: 1,
          timerStartAt: loadAt,
          shotsPerLane: 5,
          targetLaneIds: [LANE_ID, OTHER_LANE_ID],
          timedTarget: {
            programId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
            participantExecution: 'SIMULTANEOUS',
          },
        }),
      );

      expect(timedTargetControl.start).toHaveBeenCalledWith(
        expect.objectContaining({
          sequenceId: COMMAND_ID,
          program: expect.objectContaining({
            id: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
            purpose: 'SHOOT_OFF',
          }),
          stageIndex: 1,
          seriesIndex: 0,
          targetProfileId: 'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
          loadAt: new Date(loadAt),
        }),
      );
      expect(shootOffControl.open).toHaveBeenCalledWith({
        competitionId: COMPETITION_ID,
        runId: RUN_ID,
        iteration: 1,
        timerStartAt: loadAt,
        timerDurationSeconds: 71,
        shotsPerLane: 5,
        timedTargetProgramId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
      });
    });

    it('offsets a sequential RFPM shoot-off Lane by the ordered participant slot', async () => {
      competitionState = CompetitionState.reconstruct({
        id: COMPETITION_ID,
        sessionId: 'd4444444-4444-4444-a444-444444444444',
        config: RFPM_FINAL.config,
        phase: 'SERIES_COMPLETE',
        currentStageIndex: 1,
        currentSeriesIndex: 5,
        seriesShotCount: 5,
        timer: Timer.create(0),
        startedAt: Date.now(),
        finishedAt: null,
      });
      vi.mocked(timedTargetControl.start).mockReturnValue({
        sequenceId: COMMAND_ID,
      } as ReturnType<ITimedTargetControl['start']>);
      const firstLoadAt = new Date(Date.now() + 5_000);

      await sendMessage(
        'start-shoot-off',
        buildCommand({
          runId: RUN_ID,
          iteration: 1,
          timerStartAt: firstLoadAt.toISOString(),
          shotsPerLane: 5,
          targetLaneIds: [OTHER_LANE_ID, LANE_ID],
          timedTarget: {
            programId: 'RFPM_FINAL_SHOOT_OFF_4',
            participantExecution: 'SEQUENTIAL',
          },
        }),
      );

      const expectedLoadAt = new Date(firstLoadAt.getTime() + 41_300);
      expect(timedTargetControl.start).toHaveBeenCalledWith(expect.objectContaining({ loadAt: expectedLoadAt }));
      expect(shootOffControl.open).toHaveBeenCalledWith(
        expect.objectContaining({ timerStartAt: expectedLoadAt.toISOString(), timerDurationSeconds: 32 }),
      );
    });

    it('cancels an unfinished shoot-off target sequence when STOP closes acquisition', async () => {
      vi.mocked(timedTargetControl.getState).mockReturnValue({
        sequenceId: '07777777-7777-4777-a777-777777777777',
        purpose: 'SHOOT_OFF',
        phase: 'FIRING',
      } as ReturnType<ITimedTargetControl['getState']>);

      await sendMessage(
        'stop-shoot-off',
        buildCommand({
          runId: RUN_ID,
          iteration: 1,
          targetLaneIds: [LANE_ID, OTHER_LANE_ID],
        }),
      );

      expect(shootOffControl.close).toHaveBeenCalledWith(COMPETITION_ID, RUN_ID, 1);
      expect(timedTargetControl.cancel).toHaveBeenCalledWith({
        sequenceId: '07777777-7777-4777-a777-777777777777',
        reason: 'Shoot-off firing was closed by the Director',
      });
    });

    it('enters a timed-target MATCH without starting the generic timer', async () => {
      competitionState = CompetitionState.create(COMPETITION_ID, 'd4444444-4444-4444-a444-444444444444', P25.config)
        .startStage()
        .expireTimer();

      await sendMessage('start-match', buildCommand({ timerStartAt: new Date().toISOString() }));

      expect(vi.mocked(commandBus.execute).mock.calls.map(([token]) => token.name)).toEqual([
        'AdvanceStage',
        'StartNextSeries',
      ]);
      expect(timerService.startAt).not.toHaveBeenCalled();
    });

    it('does not arm a sequence when safety STOP activates during the competition lookup', async () => {
      let stopped = false;
      competitionRepository = {
        findById: vi.fn(async () => {
          stopped = true;
          return competitionState;
        }),
      };
      const safetyStopControl = {
        isStopped: vi.fn(() => stopped),
        getState: vi.fn(() => ({ safetyStopId: 'a7777777-7777-4777-a777-777777777777' })),
      } as unknown as Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>;
      handler = new BroadcastCommandHandler(
        mqttClient,
        commandBus,
        timerService,
        competitionRepository as ICompetitionRepository,
        competitionStatePublisher,
        scorePublisher,
        guard,
        () => LANE_ID,
        COMPETITION_ID,
        interruptionControl,
        safetyStopControl,
        shootOffControl,
        undefined,
        timedTargetControl,
      );

      await sendMessage(
        'start-timed-target',
        buildCommand({
          programId: 'P25_MATCH_PRECISION_240',
          purpose: 'MATCH',
          stageIndex: 1,
          seriesIndex: 0,
          loadAt: new Date().toISOString(),
          targetLaneIds: [LANE_ID],
        }),
      );

      expect(timedTargetControl.start).not.toHaveBeenCalled();
      const acknowledgements = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter(([topic]) => topic.includes('/acknowledgement/'));
      expect(JSON.parse(acknowledgements.at(-1)?.[1] as string)).toMatchObject({
        status: 'error',
        error: { message: expect.stringContaining('Safety stop') },
      });
    });

    it('cancels only the current sequence', async () => {
      vi.mocked(timedTargetControl.getState).mockReturnValue({
        sequenceId: '07777777-7777-4777-a777-777777777777',
        phase: 'FIRING',
      } as ReturnType<ITimedTargetControl['getState']>);

      await sendMessage(
        'cancel-timed-target',
        buildCommand({
          sequenceId: '07777777-7777-4777-a777-777777777777',
          reason: 'Range interruption',
          targetLaneIds: [LANE_ID],
        }),
      );

      expect(timedTargetControl.cancel).toHaveBeenCalledWith({
        sequenceId: '07777777-7777-4777-a777-777777777777',
        reason: 'Range interruption',
      });
    });
  });

  describe('advance-series', () => {
    beforeEach(() => {
      competitionState = createCompetitionState('SERIES_COMPLETE', 1, 0);
    });

    it('advances and starts the next series', async () => {
      const cmd = buildCommand({ stageIndex: 1, fromSeriesIndex: 0 });

      await sendMessage('advance-series', cmd);

      expect(commandBus.execute).toHaveBeenCalledTimes(2);
      expect(vi.mocked(commandBus.execute).mock.calls.map(([token]) => token.name)).toEqual([
        'AdvanceStage',
        'StartNextSeries',
      ]);
    });

    it('does not advance again when a retried Lane is already at the destination series', async () => {
      competitionState = createCompetitionState('ACTIVE', 1, 1);

      await sendMessage(
        'advance-series',
        buildCommand({
          commandId: 'f6666666-6666-4666-a666-666666666666',
          stageIndex: 1,
          fromSeriesIndex: 0,
        }),
      );

      expect(commandBus.execute).not.toHaveBeenCalled();
      const acknowledgements = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter(([topic]) => topic.includes('/acknowledgement/'));
      expect(JSON.parse(acknowledgements.at(-1)?.[1] as string)).toMatchObject({ status: 'done' });
    });

    it('resumes only StartNextSeries when the first half of an advance already succeeded', async () => {
      competitionState = createCompetitionState('SERIES_ENTERED', 1, 1);

      await sendMessage(
        'advance-series',
        buildCommand({
          commandId: '07777777-7777-4777-a777-777777777777',
          stageIndex: 1,
          fromSeriesIndex: 0,
        }),
      );

      expect(commandBus.execute).toHaveBeenCalledOnce();
      expect(vi.mocked(commandBus.execute).mock.calls[0]?.[0].name).toBe('StartNextSeries');
    });

    it('resumes StartNextSeries when every Lane reports the persisted destination', async () => {
      competitionState = createCompetitionState('SERIES_ENTERED', 1, 5);

      await sendMessage(
        'advance-series',
        buildCommand({
          commandId: '18888888-8888-4888-a888-888888888888',
          stageIndex: 1,
          fromSeriesIndex: 5,
          resumeOnly: true,
        }),
      );

      expect(commandBus.execute).toHaveBeenCalledOnce();
      expect(vi.mocked(commandBus.execute).mock.calls[0]?.[0].name).toBe('StartNextSeries');
    });

    it('does not advance a Lane that already started a resume-only destination', async () => {
      competitionState = createCompetitionState('ACTIVE', 1, 2);

      await sendMessage(
        'advance-series',
        buildCommand({
          commandId: '29999999-9999-4999-a999-999999999999',
          stageIndex: 1,
          fromSeriesIndex: 2,
          resumeOnly: true,
        }),
      );

      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('finish-competition', () => {
    it('flushes the final retained state and score after finishing the competition', async () => {
      await sendMessage('finish-competition', buildCommand());

      expect(commandBus.execute).toHaveBeenCalled();
      expect(competitionStatePublisher.publishCurrentState).toHaveBeenCalledWith(COMPETITION_ID, COMMAND_ID);
      expect(scorePublisher.publishCurrentScore).toHaveBeenCalledWith(COMPETITION_ID, COMMAND_ID);
    });

    it('does not acknowledge completion until the final retained score is published', async () => {
      let resolveScore!: () => void;
      vi.mocked(scorePublisher.publishCurrentScore).mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveScore = resolve;
        }),
      );
      await handler.subscribeToCompetition(COMPETITION_ID);

      messageHandler(
        `saika/competition/${COMPETITION_ID}/command/finish-competition`,
        Buffer.from(JSON.stringify(buildCommand())),
      );
      await vi.waitFor(() => {
        expect(scorePublisher.publishCurrentScore).toHaveBeenCalledWith(COMPETITION_ID, COMMAND_ID);
      });

      const acknowledgementStatuses = () =>
        vi
          .mocked(mqttClient.publish)
          .mock.calls.filter((call) => (call[0] as string).includes('/acknowledgement/'))
          .map((call) => JSON.parse(call[1] as string).status as string);
      expect(acknowledgementStatuses()).toEqual(['executing']);

      resolveScore();
      await vi.waitFor(() => {
        expect(acknowledgementStatuses()).toEqual(['executing', 'done']);
      });
    });

    it('returns an error acknowledgement when the final retained score cannot be published', async () => {
      vi.mocked(scorePublisher.publishCurrentScore).mockRejectedValueOnce(new Error('broker unavailable'));

      await sendMessage('finish-competition', buildCommand());

      const acknowledgementCalls = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter((call) => (call[0] as string).includes('/acknowledgement/'));
      expect(JSON.parse(acknowledgementCalls[1]![1] as string)).toMatchObject({
        status: 'error',
        error: { message: 'broker unavailable' },
      });
    });

    it('flushes retained data when retrying an already-finished competition', async () => {
      const alreadyFinished = Object.assign(new Error('already finished'), {
        code: 'COMPETITION_ALREADY_FINISHED',
      });
      vi.mocked(commandBus.execute).mockRejectedValueOnce(alreadyFinished);

      await sendMessage('finish-competition', buildCommand());

      expect(scorePublisher.publishCurrentScore).toHaveBeenCalledWith(COMPETITION_ID, COMMAND_ID);
      const acknowledgementCalls = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter((call) => (call[0] as string).includes('/acknowledgement/'));
      expect(JSON.parse(acknowledgementCalls[1]![1] as string)).toMatchObject({ status: 'done' });
    });
  });

  describe('timer-started', () => {
    it('calls timerService.startAt', async () => {
      const now = new Date().toISOString();
      const cmd = buildCommand({
        timerScope: 'STAGE',
        timerStartAt: now,
        timerDurationSeconds: 600,
        stageIndex: 0,
        seriesIndex: null,
      });

      await sendMessage('timer-started', cmd);

      expect(timerService.startAt).toHaveBeenCalledWith(COMPETITION_ID, now, 600);
    });
  });

  describe('timer-expired', () => {
    it('expires the local competition timer', async () => {
      const cmd = buildCommand({
        timerScope: 'STAGE',
        stageIndex: 0,
        seriesIndex: null,
        expiredAt: new Date().toISOString(),
      });

      await sendMessage('timer-expired', cmd);

      expect(timerService.expire).toHaveBeenCalledWith(COMPETITION_ID);
    });
  });

  describe('active Lane interruption', () => {
    beforeEach(() => {
      vi.mocked(interruptionControl.get).mockReturnValue({
        interruptionId: 'e5555555-5555-4555-a555-555555555555',
        status: 'PAUSED',
      } as ReturnType<ICompetitionInterruptionControl['get']>);
    });

    it('acknowledges but ignores the shared timer expiry', async () => {
      await sendMessage(
        'timer-expired',
        buildCommand({
          timerScope: 'STAGE',
          stageIndex: 0,
          seriesIndex: null,
          expiredAt: new Date().toISOString(),
        }),
      );

      expect(timerService.expire).not.toHaveBeenCalled();
      const acknowledgement = JSON.parse(vi.mocked(mqttClient.publish).mock.calls.at(-1)![1] as string);
      expect(acknowledgement.status).toBe('done');
    });

    it('rejects a shared progress command so the Director can retry after recovery', async () => {
      await sendMessage('advance-series', buildCommand({ stageIndex: 0, fromSeriesIndex: 0 }));

      const acknowledgement = JSON.parse(vi.mocked(mqttClient.publish).mock.calls.at(-1)![1] as string);
      expect(acknowledgement).toMatchObject({
        status: 'error',
        error: { code: 'MQTT_LANE_INTERRUPTED' },
      });
    });
  });

  it('does not activate a stage before the synchronized start time', async () => {
    competitionState = createCompetitionState('IDLE', 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-24T10:00:00.000Z'));
    await handler.subscribeToCompetition(COMPETITION_ID);
    const command = buildCommand({
      commandId: 'd4444444-4444-4444-a444-444444444444',
      timerStartAt: '2026-02-24T10:00:03.000Z',
      timerDurationSeconds: 600,
    });

    messageHandler(`saika/competition/${COMPETITION_ID}/command/start-sighting`, Buffer.from(JSON.stringify(command)));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(commandBus.execute).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(commandBus.execute).toHaveBeenCalledOnce();
    expect(timerService.startAt).toHaveBeenCalled();
  });

  describe('idempotency', () => {
    it('skips duplicate commandId', async () => {
      const cmd = buildCommand();

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/end-sighting`;

      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await flushPromises();
      expect(commandBus.execute).toHaveBeenCalledTimes(1);

      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await flushPromises();
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('2-phase ACK', () => {
    it('sends executing then done ACK on success', async () => {
      await sendMessage('end-sighting', buildCommand());

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);

      const executingAck = JSON.parse(ackCalls[0]![1] as string);
      expect(executingAck.status).toBe('executing');

      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
    });

    it('sends executing then error ACK on failure', async () => {
      (commandBus.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('command failed'));

      await sendMessage('end-sighting', buildCommand());

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);
      const errorAck = JSON.parse(ackCalls[1]![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error).toBeDefined();
    });
  });

  describe('unknown action', () => {
    it('sends error ACK for unknown action', async () => {
      await sendMessage('unknown-action', buildCommand());

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCall = publishCalls.find((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));
      const ackPayload = JSON.parse(ackCall![1] as string);
      expect(ackPayload.status).toBe('error');
      expect(ackPayload.error.code).toBe('MQTT_UNKNOWN_COMMAND_ACTION');
    });
  });

  describe('validation failure', () => {
    it('sends error ACK for invalid payload', async () => {
      const cmd = { commandId: 'not-a-uuid', issuedBy: 'test', issuedAt: 'invalid-date' };

      await sendMessage('start-sighting', cmd);

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCall = publishCalls.find((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));
      const ackPayload = JSON.parse(ackCall![1] as string);
      expect(ackPayload.status).toBe('error');
      expect(ackPayload.error.code).toBe('MQTT_COMMAND_VALIDATION_FAILED');
    });
  });

  describe('clock drift detection', () => {
    const fakeFlush = async () => {
      vi.advanceTimersByTime(50);
      await vi.runAllTimersAsync();
    };

    it('adds warning to done ACK when drift > 5s', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-24T10:00:10.000Z'));

      const cmd = buildCommand({
        issuedAt: '2026-02-24T10:00:00.000Z',
        timerStartAt: '2026-02-24T10:00:00.000Z',
        timerDurationSeconds: 900,
      });

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/start-sighting`;
      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await fakeFlush();

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);
      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
      expect(doneAck.warning).toBe('clock_drift_detected');

      vi.useRealTimers();
    });

    it('rejects a stale command when issuedAt drift is greater than 30s', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-24T10:01:00.000Z'));

      const cmd = buildCommand({
        commandId: 'd4444444-4444-4444-a444-444444444444',
        issuedAt: '2026-02-24T10:00:00.000Z',
        timerStartAt: '2026-02-24T10:01:00.000Z',
        timerDurationSeconds: 900,
      });

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/start-match`;
      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await fakeFlush();

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      // Should only have error ACK, no executing ACK
      expect(ackCalls.length).toBe(1);
      const errorAck = JSON.parse(ackCalls[0]![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error.code).toBe('MQTT_CLOCK_OUT_OF_SYNC');

      // commandBus should NOT have been called
      expect(commandBus.execute).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('accepts a targeted sighting retry with a past timerStartAt when issuedAt is current', async () => {
      competitionState = createCompetitionState('IDLE', 0, 0);
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-24T10:01:00.000Z'));

      const cmd = buildCommand({
        commandId: 'd4444444-4444-4444-a444-444444444444',
        issuedAt: '2026-02-24T10:01:00.000Z',
        timerStartAt: '2026-02-24T10:00:00.000Z',
        timerDurationSeconds: 900,
        targetLaneIds: [LANE_ID],
      });

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/start-sighting`;
      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await fakeFlush();

      expect(timerService.startAt).toHaveBeenCalledWith(COMPETITION_ID, '2026-02-24T10:00:00.000Z', 900);
      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));
      expect(JSON.parse(ackCalls.at(-1)![1] as string)).toMatchObject({ status: 'done' });

      vi.useRealTimers();
    });

    it('no warning when drift < 5s', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-24T10:00:02.000Z'));

      const cmd = buildCommand({
        commandId: 'e5555555-5555-4555-a555-555555555555',
        issuedAt: '2026-02-24T10:00:00.000Z',
        timerStartAt: '2026-02-24T10:00:00.000Z',
        timerDurationSeconds: 900,
      });

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/start-sighting`;
      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await fakeFlush();

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);
      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
      expect(doneAck.warning).toBeUndefined();

      vi.useRealTimers();
    });

    it('does not check drift for non-timer actions', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-24T10:05:00.000Z'));

      const cmd = buildCommand({
        commandId: 'f6666666-6666-4666-a666-666666666666',
      });

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/end-sighting`;
      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await fakeFlush();

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);
      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');

      vi.useRealTimers();
    });
  });
});
