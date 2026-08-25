import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublishResultsHandler } from '@/main/modules/results/commands/PublishResultsHandler';
import type { IResultRepository } from '@/main/modules/results/domain/IResultRepository';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';
import type { PublishResultsCommand } from '@/main/modules/results/commands/PublishResults';
import { competitionTypeRegistry } from '@/shared/competitionTypes';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { IssfStandardStrategy } from '@/shared/competitionTypes/strategies/IssfStandardStrategy';
import { Result } from '@/main/modules/results/domain/Result';
import { ResultId } from '@/main/modules/results/domain/ResultId';
import { EventId, ParticipantId } from '@/main/modules/championship';

/**
 * Create a LaneControl in IDLE state with a player assigned.
 * matchShots will be empty (all zeros after padding in handler).
 */
function createLaneWithPlayer(
  id: string,
  channel: number,
  playerName: string,
  affiliation: string,
  participantId: string,
  relayNumber: number = 1,
): LaneControl {
  const lane = LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG, relayNumber);
  return lane.assignPlayer(Player.create(playerName, affiliation, participantId));
}

/**
 * Create a LaneControl with no player (null).
 */
function createLaneWithoutPlayer(id: string, channel: number): LaneControl {
  return LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
}

/**
 * Create a LaneControl with a player that has no participantId.
 */
function createLaneWithPlayerNoParticipantId(id: string, channel: number): LaneControl {
  const lane = LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
  return lane.assignPlayer(Player.create('No ID Player', 'Some Aff'));
}

/**
 * Create a mock QueryBus that returns lanes from a store
 * and event data for GetEventById queries.
 */
function createMockQueryBus(laneStore: Map<string, LaneControl>, eventExists = true) {
  return {
    execute: vi.fn(async (tokenOrName: any, query: any) => {
      const name = typeof tokenOrName === 'string' ? tokenOrName : tokenOrName.name;
      if (name === 'GetLaneById') {
        return laneStore.get(query.laneId);
      }
      if (name === 'GetEventById') {
        return eventExists
          ? { id: query.eventId, name: 'Test Event', eventType: 'BR60S', round: 'Qualification', sortOrder: 1 }
          : null;
      }
      return undefined;
    }),
    register: vi.fn(),
    use: vi.fn(),
  };
}

describe('PublishResultsHandler', () => {
  let laneStore: Map<string, LaneControl>;
  let mockQueryBus: ReturnType<typeof createMockQueryBus>;
  let mockResultRepository: IResultRepository;
  let handler: PublishResultsHandler;

  beforeEach(() => {
    laneStore = new Map();
    mockQueryBus = createMockQueryBus(laneStore);

    mockResultRepository = {
      save: vi.fn(),
      replaceByCompetitionId: vi.fn(),
      findById: vi.fn(),
      findByEventId: vi.fn(),
      findByEventIdAndRelay: vi.fn(),
      findByCompetitionId: vi.fn(),
      findByParticipantId: vi.fn(),
      deleteById: vi.fn(),
      deleteByEventId: vi.fn(),
      updateStatus: vi.fn(),
    };

    competitionTypeRegistry._reset();
    competitionTypeRegistry.registerStrategy(new IssfStandardStrategy());
    competitionTypeRegistry.register(BR60S);

    handler = new PublishResultsHandler(mockQueryBus as any, mockResultRepository, competitionTypeRegistry);
  });

  it('should publish results for a lane with valid player and shots', async () => {
    const lane = createLaneWithPlayer('lane-1', 1, 'Tanaka', 'Tokyo Club', 'p-1');
    laneStore.set('lane-1', lane);

    const command: PublishResultsCommand = { eventId: 'event-1', laneIds: ['lane-1'] };
    const result = await handler.execute(command);

    expect(result.savedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockResultRepository.save).toHaveBeenCalledTimes(1);
  });

  it('should return error for lane not found', async () => {
    const command: PublishResultsCommand = { eventId: 'event-1', laneIds: ['lane-missing'] };
    const result = await handler.execute(command);

    expect(result.savedCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('Lane lane-missing not found');
    expect(mockResultRepository.save).not.toHaveBeenCalled();
  });

  it('should reject publication when the event does not exist', async () => {
    const lane = createLaneWithPlayer('lane-1', 1, 'Tanaka', 'Tokyo Club', 'p-1');
    laneStore.set('lane-1', lane);
    mockQueryBus = createMockQueryBus(laneStore, false);
    handler = new PublishResultsHandler(mockQueryBus as any, mockResultRepository, competitionTypeRegistry);

    const result = await handler.execute({ eventId: 'missing-event', laneIds: ['lane-1'] });

    expect(result).toEqual({ savedCount: 0, errors: ['Event missing-event not found'] });
    expect(mockResultRepository.save).not.toHaveBeenCalled();
  });

  it('should return error when lane has no player', async () => {
    const lane = createLaneWithoutPlayer('lane-2', 2);
    laneStore.set('lane-2', lane);

    const command: PublishResultsCommand = { eventId: 'event-1', laneIds: ['lane-2'] };
    const result = await handler.execute(command);

    expect(result.savedCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('Lane lane-2 has no player assigned');
  });

  it('should return error when player has no participantId', async () => {
    const lane = createLaneWithPlayerNoParticipantId('lane-3', 3);
    laneStore.set('lane-3', lane);

    const command: PublishResultsCommand = { eventId: 'event-1', laneIds: ['lane-3'] };
    const result = await handler.execute(command);

    expect(result.savedCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('Lane lane-3 player has no participantId');
  });

  it('should handle multiple lanes (some valid, some invalid)', async () => {
    const validLane = createLaneWithPlayer('lane-ok', 1, 'Suzuki', 'Osaka Club', 'p-2');
    const noPlayerLane = createLaneWithoutPlayer('lane-no-player', 2);
    laneStore.set('lane-ok', validLane);
    laneStore.set('lane-no-player', noPlayerLane);

    const command: PublishResultsCommand = {
      eventId: 'event-1',
      laneIds: ['lane-ok', 'lane-no-player', 'lane-not-found'],
    };
    const result = await handler.execute(command);

    expect(result.savedCount).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain('Lane lane-no-player has no player assigned');
    expect(result.errors).toContain('Lane lane-not-found not found');
  });

  it('should not overwrite a confirmed result', async () => {
    const lane = createLaneWithPlayer('lane-1', 1, 'Tanaka', 'Tokyo Club', 'p-1');
    laneStore.set('lane-1', lane);
    const confirmedResult = Result.create(
      ResultId.generate(),
      EventId.create('event-1'),
      ParticipantId.create('p-1'),
      'Tanaka',
      'Tokyo Club',
      0,
      [],
      [],
      1,
      'published',
      BR60S.resultFormat,
    ).confirm();
    vi.mocked(mockResultRepository.findByParticipantId).mockReturnValue(confirmedResult);

    const result = await handler.execute({ eventId: 'event-1', laneIds: ['lane-1'] });

    expect(result).toEqual({ savedCount: 0, errors: ['Participant p-1 already has a confirmed result'] });
    expect(mockResultRepository.save).not.toHaveBeenCalled();
  });

  it('should not overwrite a result owned by an MQTT competition', async () => {
    const lane = createLaneWithPlayer('lane-1', 1, 'Tanaka', 'Tokyo Club', 'p-1');
    laneStore.set('lane-1', lane);
    const mqttResult = Result.create(
      ResultId.generate(),
      EventId.create('event-1'),
      ParticipantId.create('p-1'),
      'Tanaka',
      'Tokyo Club',
      0,
      [],
      [],
      1,
      'published',
      BR60S.resultFormat,
      'mqtt-competition-1',
    );
    vi.mocked(mockResultRepository.findByParticipantId).mockReturnValue(mqttResult);

    const result = await handler.execute({ eventId: 'event-1', laneIds: ['lane-1'] });

    expect(result).toEqual({
      savedCount: 0,
      errors: ['Participant p-1 has a result owned by MQTT competition mqtt-competition-1'],
    });
    expect(mockResultRepository.save).not.toHaveBeenCalled();
  });

  it('should return savedCount and errors array', async () => {
    const lane1 = createLaneWithPlayer('lane-a', 1, 'Player A', 'Club A', 'p-a');
    const lane2 = createLaneWithPlayer('lane-b', 2, 'Player B', 'Club B', 'p-b');
    laneStore.set('lane-a', lane1);
    laneStore.set('lane-b', lane2);

    const command: PublishResultsCommand = {
      eventId: 'event-1',
      laneIds: ['lane-a', 'lane-b'],
    };
    const result = await handler.execute(command);

    expect(result).toHaveProperty('savedCount');
    expect(result).toHaveProperty('errors');
    expect(result.savedCount).toBe(2);
    expect(result.errors).toEqual([]);
    expect(mockResultRepository.save).toHaveBeenCalledTimes(2);
  });
});
