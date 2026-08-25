import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignPlayersHandler } from '@/main/modules/lane-control/commands/AssignPlayersHandler';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import type { AssignPlayersCommand } from '@/main/modules/lane-control/commands/LaneCommands';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG, buildFinalConfig } from '../../../../../helpers/testConfigs';
import { competitionTypeRegistry } from '@/shared/competitionTypes';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';

describe('AssignPlayersHandler', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let handler: AssignPlayersHandler;

  beforeEach(() => {
    competitionTypeRegistry._reset();
    competitionTypeRegistry.register(BR60S);
    competitionTypeRegistry.register(BR60S_FINAL);

    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByChannel: vi.fn(),
      findAll: vi.fn(() => []),
      findActive: vi.fn(),
      delete: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
    handler = new AssignPlayersHandler(mockRepository, mockEventBus, competitionTypeRegistry);
  });

  it('should assign a player to a new lane when findByChannel returns undefined', async () => {
    vi.mocked(mockRepository.findByChannel).mockReturnValue(undefined);

    const command: AssignPlayersCommand = {
      assignments: [{ channel: 1, playerName: 'Taro Yamada', affiliation: 'Tokyo Club' }],
      eventType: 'BR60S',
    };

    await handler.execute(command);

    expect(mockRepository.findByChannel).toHaveBeenCalledWith(1);
    expect(mockRepository.save).toHaveBeenCalledTimes(1);

    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0]!;
    expect(savedLane.player?.name).toBe('Taro Yamada');
    expect(savedLane.player?.affiliation).toBe('Tokyo Club');
    expect(savedLane.channel.value).toBe(1);
  });

  it('should assign a player to an existing lane when findByChannel returns existing lane', async () => {
    const existingLane = LaneControl.create('existing-lane-id', Channel.create(3), QUALIFICATION_CONFIG);
    vi.mocked(mockRepository.findByChannel).mockReturnValue(existingLane);

    const command: AssignPlayersCommand = {
      assignments: [{ channel: 3, playerName: 'Hanako Sato', affiliation: 'Osaka Club' }],
      eventType: 'BR60S',
    };

    await handler.execute(command);

    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0]!;
    expect(savedLane.id).toBe('existing-lane-id');
    expect(savedLane.player?.name).toBe('Hanako Sato');
    expect(savedLane.channel.value).toBe(3);
  });

  it('should use QUALIFICATION_CONFIG for Qualification eventType', async () => {
    vi.mocked(mockRepository.findByChannel).mockReturnValue(undefined);

    const command: AssignPlayersCommand = {
      assignments: [{ channel: 1, playerName: 'Player A', affiliation: 'Club A' }],
      eventType: 'BR60S',
    };

    await handler.execute(command);

    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0]!;
    expect(savedLane.config.roundType).toBe('Qualification');
    expect(savedLane.config).toEqual(QUALIFICATION_CONFIG);
  });

  it('should use buildFinalConfig for Final eventType', async () => {
    vi.mocked(mockRepository.findByChannel).mockReturnValue(undefined);

    const command: AssignPlayersCommand = {
      assignments: [
        { channel: 1, playerName: 'Player A', affiliation: 'Club A' },
        { channel: 2, playerName: 'Player B', affiliation: 'Club B' },
        { channel: 3, playerName: 'Player C', affiliation: 'Club C' },
      ],
      eventType: 'BR60S_FINAL',
    };

    await handler.execute(command);

    const expectedConfig = buildFinalConfig(3);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0]!;
    expect(savedLane.config.roundType).toBe('Final');
    expect(savedLane.config).toEqual(expectedConfig);
  });

  it('should handle multiple assignments in one command', async () => {
    vi.mocked(mockRepository.findByChannel).mockReturnValue(undefined);

    const command: AssignPlayersCommand = {
      assignments: [
        { channel: 1, playerName: 'Player 1', affiliation: 'Club 1' },
        { channel: 2, playerName: 'Player 2', affiliation: 'Club 2' },
        { channel: 3, playerName: 'Player 3', affiliation: 'Club 3' },
      ],
      eventType: 'BR60S',
    };

    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(3);

    const savedNames = vi.mocked(mockRepository.save).mock.calls.map((call) => call[0].player?.name);
    expect(savedNames).toEqual(['Player 1', 'Player 2', 'Player 3']);
  });

  it('should call repository.save for each assignment', async () => {
    vi.mocked(mockRepository.findByChannel).mockReturnValue(undefined);

    const command: AssignPlayersCommand = {
      assignments: [
        { channel: 5, playerName: 'Player X', affiliation: 'Club X' },
        { channel: 6, playerName: 'Player Y', affiliation: 'Club Y' },
      ],
      eventType: 'BR60S',
    };

    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mockRepository.save).mock.calls[0]![0]!.channel.value).toBe(5);
    expect(vi.mocked(mockRepository.save).mock.calls[1]![0]!.channel.value).toBe(6);
  });

  it('should emit LaneControlUpdated event for each assignment', async () => {
    vi.mocked(mockRepository.findByChannel).mockReturnValue(undefined);

    const command: AssignPlayersCommand = {
      assignments: [
        {
          channel: 1,
          playerName: 'Player A',
          affiliation: 'Club A',
          participantId: 'participant-a',
          relayNumber: 2,
        },
        { channel: 2, playerName: 'Player B', affiliation: 'Club B' },
      ],
      eventType: 'BR60S',
    };

    await handler.execute(command);

    expect(mockEventBus.emit).toHaveBeenCalledTimes(2);

    const emittedEvents = vi.mocked(mockEventBus.emit).mock.calls.map((call) => call[0]);
    expect(emittedEvents[0]).toMatchObject({
      type: 'LaneControlUpdated',
      channel: 1,
      playerName: 'Player A',
      participantId: 'participant-a',
      relayNumber: 2,
    });
    expect(emittedEvents[1]).toMatchObject({
      type: 'LaneControlUpdated',
      channel: 2,
      playerName: 'Player B',
      participantId: null,
      relayNumber: 1,
    });
  });

  it('should use default relayNumber 1 when not specified', async () => {
    vi.mocked(mockRepository.findByChannel).mockReturnValue(undefined);

    const command: AssignPlayersCommand = {
      assignments: [{ channel: 1, playerName: 'Player A', affiliation: 'Club A' }],
      eventType: 'BR60S',
    };

    await handler.execute(command);

    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0]!;
    expect(savedLane.relayNumber).toBe(1);
  });

  it('should reject duplicate channels before saving any lane', async () => {
    await expect(
      handler.execute({
        assignments: [
          { channel: 1, playerName: 'Player A', affiliation: 'Club A' },
          { channel: 1, playerName: 'Player B', affiliation: 'Club B' },
        ],
        eventType: 'BR60S',
      }),
    ).rejects.toMatchObject({ code: 'LANE_004' });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should reject duplicate participants before saving any lane', async () => {
    await expect(
      handler.execute({
        assignments: [
          { channel: 1, playerName: 'Player A', affiliation: 'Club A', participantId: 'participant-1' },
          { channel: 2, playerName: 'Player A', affiliation: 'Club A', participantId: 'participant-1' },
        ],
        eventType: 'BR60S',
      }),
    ).rejects.toMatchObject({ code: 'LANE_005' });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should reject a participant already assigned to an untouched lane', async () => {
    const existingLane = LaneControl.create('existing-lane', Channel.create(3), QUALIFICATION_CONFIG).assignPlayer(
      Player.create('Existing Player', 'Existing Club', 'participant-1'),
    );
    vi.mocked(mockRepository.findAll).mockReturnValue([existingLane]);

    await expect(
      handler.execute({
        assignments: [{ channel: 1, playerName: 'Player A', affiliation: 'Club A', participantId: 'participant-1' }],
        eventType: 'BR60S',
      }),
    ).rejects.toMatchObject({ code: 'LANE_005' });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should validate every existing lane before saving the first update', async () => {
    const activeLane = LaneControl.create('active-lane', Channel.create(2), QUALIFICATION_CONFIG).startPreparation();
    vi.mocked(mockRepository.findByChannel).mockImplementation((channel) => (channel === 2 ? activeLane : undefined));

    await expect(
      handler.execute({
        assignments: [
          { channel: 1, playerName: 'Player A', affiliation: 'Club A' },
          { channel: 2, playerName: 'Player B', affiliation: 'Club B' },
        ],
        eventType: 'BR60S',
      }),
    ).rejects.toThrow(/Cannot change config/);

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });
});
