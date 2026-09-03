// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { CompetitionStateSubscriber } from '@/main/modules/mqtt/application/CompetitionStateSubscriber';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';

import { createMockCommandBus } from '../../../../helpers/mockDependencies';

const COMPETITION_ID = 'b2222222-2222-4222-a222-222222222222';
const LANE_ID = 'a1111111-1111-4111-a111-111111111111';

function validState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    competitionId: COMPETITION_ID,
    competitionTypeId: 'BR60S',
    competitionTypeName: '10m Beam Rifle 60 shots standing',
    discipline: 'BEAM_RIFLE_10M',
    roundName: 'Qualification',
    acc: 'DECIMAL',
    phase: 'NOT_STARTED',
    shotsPerSeries: 10,
    totalSeries: 6,
    totalShots: 60,
    laneIds: [LANE_ID],
    startedAt: null,
    finishedAt: null,
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

function matchingCompetition(): CompetitionState {
  return {
    id: COMPETITION_ID,
    phase: 'IDLE',
    config: {
      name: 'Qualification',
      acc: 'DECIMAL',
      shotsPerSeries: 10,
      stages: [
        { scored: false, series: [{ maxShots: 0 }] },
        {
          scored: true,
          series: Array.from({ length: 6 }, () => ({ maxShots: 10 })),
        },
      ],
    },
  } as unknown as CompetitionState;
}

describe('CompetitionStateSubscriber', () => {
  let mqttClient: IMqttClientService;
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let competitionRepository: ICompetitionRepository;
  let subscriber: CompetitionStateSubscriber;
  let messageHandler: (topic: string, payload: Buffer) => void;
  let retainedPayload: string | null;

  beforeEach(() => {
    retainedPayload = JSON.stringify(validState());
    mqttClient = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockImplementation(async (topic: string) => {
        if (retainedPayload) messageHandler(topic, Buffer.from(retainedPayload));
      }),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      setWill: vi.fn(),
      onMessage: vi.fn().mockImplementation((handler: typeof messageHandler) => {
        messageHandler = handler;
        return () => undefined;
      }),
      onConnect: vi.fn(),
      onDisconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    };
    commandBus = createMockCommandBus();
    vi.mocked(commandBus.execute).mockResolvedValue({
      competitionId: COMPETITION_ID,
      sessionId: 'd4444444-4444-4444-a444-444444444444',
    });
    competitionRepository = {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      findBySessionId: vi.fn().mockResolvedValue(null),
      findActive: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
    };
    subscriber = new CompetitionStateSubscriber(mqttClient, commandBus, competitionRepository, 10);
  });

  it('subscribes before bootstrapping a matching local competition ID', async () => {
    await subscriber.subscribe(COMPETITION_ID);

    expect(mqttClient.subscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/state`, 1);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ competitionId: COMPETITION_ID, competitionTypeId: 'BR60S' }),
    );
  });

  it('reuses an existing compatible competition', async () => {
    vi.mocked(competitionRepository.findById).mockResolvedValue(matchingCompetition());

    await subscriber.subscribe(COMPETITION_ID);

    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('restores subscriptions when the Lane finished before Director retained completion', async () => {
    vi.mocked(competitionRepository.findById).mockResolvedValue({
      ...matchingCompetition(),
      phase: 'FINISHED',
    } as CompetitionState);
    retainedPayload = JSON.stringify(
      validState({
        phase: 'MATCH',
        startedAt: new Date().toISOString(),
      }),
    );

    await subscriber.subscribe(COMPETITION_ID);

    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('accepts retained active timer metadata from the Director', async () => {
    vi.mocked(competitionRepository.findById).mockResolvedValue(matchingCompetition());
    const timerStartAt = new Date().toISOString();
    retainedPayload = JSON.stringify(
      validState({
        phase: 'MATCH',
        startedAt: timerStartAt,
        activeTimer: {
          timerScope: 'STAGE',
          timerStartAt,
          timerDurationSeconds: 2_700,
          stageIndex: 1,
          seriesIndex: null,
        },
      }),
    );

    await expect(subscriber.subscribe(COMPETITION_ID)).resolves.toMatchObject({
      activeTimer: {
        timerScope: 'STAGE',
        timerStartAt,
        timerDurationSeconds: 2_700,
        stageIndex: 1,
        seriesIndex: null,
      },
    });
  });

  it('rejects an incompatible existing competition', async () => {
    vi.mocked(competitionRepository.findById).mockResolvedValue(matchingCompetition());
    retainedPayload = JSON.stringify(validState({ totalShots: 40 }));

    await expect(subscriber.subscribe(COMPETITION_ID)).rejects.toMatchObject({
      code: 'MQTT_COMPETITION_STATE_MISMATCH',
    });
  });

  it('rejects a required Rule Pack fingerprint mismatch before bootstrapping', async () => {
    const requiredIdentity = {
      id: 'ISSF:2026:AR60:QUALIFICATION',
      schemaVersion: 1 as const,
      fingerprint: { algorithm: 'SHA-256' as const, value: 'a'.repeat(64) },
    };
    retainedPayload = JSON.stringify(
      validState({
        competitionTypeId: 'AR60',
        definitionBinding: {
          protocolVersion: 1,
          compatibilityMode: 'REQUIRED',
          rulePack: requiredIdentity,
        },
      }),
    );
    subscriber = new CompetitionStateSubscriber(mqttClient, commandBus, competitionRepository, 10, () => ({
      id: 'AR60',
      rulePackIdentity: {
        ...requiredIdentity,
        fingerprint: { ...requiredIdentity.fingerprint, value: 'b'.repeat(64) },
      },
    }));

    await expect(subscriber.subscribe(COMPETITION_ID)).rejects.toMatchObject({
      code: 'MQTT_COMPETITION_STATE_MISMATCH',
    });
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('times out when no valid retained state is available', async () => {
    retainedPayload = JSON.stringify({ competitionId: COMPETITION_ID });

    await expect(subscriber.subscribe(COMPETITION_ID)).rejects.toMatchObject({
      code: 'MQTT_COMPETITION_STATE_TIMEOUT',
    });
  });

  it('does not bootstrap a new lane into an already running competition', async () => {
    retainedPayload = JSON.stringify(
      validState({
        phase: 'MATCH',
        startedAt: new Date().toISOString(),
      }),
    );

    await expect(subscriber.subscribe(COMPETITION_ID)).rejects.toMatchObject({
      code: 'MQTT_COMPETITION_STATE_MISMATCH',
    });
  });

  it('unsubscribes from the exact state topic', async () => {
    await subscriber.subscribe(COMPETITION_ID);
    await subscriber.unsubscribe();

    expect(mqttClient.unsubscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/state`);
  });
});
