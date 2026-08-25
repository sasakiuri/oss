import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MoveLaneHandler } from '@/main/modules/lane-control/commands/MoveLaneHandler';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import type { MoveLaneCommand } from '@/main/modules/lane-control/commands/LaneCommands';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';

function createIdleLane(id: string, channel: number): LaneControl {
  return LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
}

function createIdleLaneWithPlayer(
  id: string,
  channel: number,
  playerName = 'Test Player',
  affiliation = 'Test Affiliation',
): LaneControl {
  const lane = createIdleLane(id, channel);
  return lane.assignPlayer(Player.create(playerName, affiliation, 'participant-1'));
}

describe('MoveLaneHandler', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let handler: MoveLaneHandler;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByChannel: vi.fn(),
      findAll: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
    handler = new MoveLaneHandler(mockRepository, mockEventBus);
  });

  it('should transfer data from source to target lane', async () => {
    const fromLane = createIdleLaneWithPlayer('from-lane', 1, 'Taro Yamada', 'Tokyo Club');
    const toLane = createIdleLane('to-lane', 2);

    vi.mocked(mockRepository.findById).mockImplementation((id: string) => {
      if (id === 'from-lane') return fromLane;
      if (id === 'to-lane') return toLane;
      return undefined;
    });

    const command: MoveLaneCommand = {
      fromLaneId: 'from-lane',
      toLaneId: 'to-lane',
    };

    await handler.execute(command);

    // The target lane (saved second after updatedFrom) should have the player data
    const savedCalls = vi.mocked(mockRepository.save).mock.calls;
    // First save: updatedTo (target with transferred data)
    const updatedTo = savedCalls[0]![0]!;
    expect(updatedTo.id).toBe('to-lane');
    expect(updatedTo.player?.name).toBe('Taro Yamada');
    expect(updatedTo.channel.value).toBe(2);
  });

  it('should clear the source lane', async () => {
    const fromLane = createIdleLaneWithPlayer('from-lane', 1);
    const toLane = createIdleLane('to-lane', 2);

    vi.mocked(mockRepository.findById).mockImplementation((id: string) => {
      if (id === 'from-lane') return fromLane;
      if (id === 'to-lane') return toLane;
      return undefined;
    });

    const command: MoveLaneCommand = {
      fromLaneId: 'from-lane',
      toLaneId: 'to-lane',
    };

    await handler.execute(command);

    // Second save: updatedFrom (source cleared)
    const savedCalls = vi.mocked(mockRepository.save).mock.calls;
    const updatedFrom = savedCalls[1]![0]!;
    expect(updatedFrom.id).toBe('from-lane');
    expect(updatedFrom.player).toBeNull();
    expect(updatedFrom.phase).toBe('IDLE');
  });

  it('should save both lanes to repository', async () => {
    const fromLane = createIdleLaneWithPlayer('from-lane', 1);
    const toLane = createIdleLane('to-lane', 2);

    vi.mocked(mockRepository.findById).mockImplementation((id: string) => {
      if (id === 'from-lane') return fromLane;
      if (id === 'to-lane') return toLane;
      return undefined;
    });

    const command: MoveLaneCommand = {
      fromLaneId: 'from-lane',
      toLaneId: 'to-lane',
    };

    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(2);
  });

  it('should emit LaneMoved event with correct payload', async () => {
    const fromLane = createIdleLaneWithPlayer('from-lane', 1, 'Hanako Sato', 'Osaka Club');
    const toLane = createIdleLane('to-lane', 5);

    vi.mocked(mockRepository.findById).mockImplementation((id: string) => {
      if (id === 'from-lane') return fromLane;
      if (id === 'to-lane') return toLane;
      return undefined;
    });

    const command: MoveLaneCommand = {
      fromLaneId: 'from-lane',
      toLaneId: 'to-lane',
    };

    await handler.execute(command);

    const emittedEvents = vi.mocked(mockEventBus.emit).mock.calls.map((call) => call[0]);
    const laneMovedEvent = emittedEvents.find((e) => e.type === 'LaneMoved');
    expect(laneMovedEvent).toMatchObject({
      type: 'LaneMoved',
      fromLaneId: 'from-lane',
      toLaneId: 'to-lane',
      playerName: 'Hanako Sato',
      channel: 5,
    });
    expect(laneMovedEvent).toHaveProperty('timestamp');
  });

  it('should emit LaneControlUpdated for both lanes', async () => {
    const fromLane = createIdleLaneWithPlayer('from-lane', 1);
    const toLane = createIdleLane('to-lane', 2);

    vi.mocked(mockRepository.findById).mockImplementation((id: string) => {
      if (id === 'from-lane') return fromLane;
      if (id === 'to-lane') return toLane;
      return undefined;
    });

    const command: MoveLaneCommand = {
      fromLaneId: 'from-lane',
      toLaneId: 'to-lane',
    };

    await handler.execute(command);

    // emit is called 3 times: LaneMoved + LaneControlUpdated x 2
    expect(mockEventBus.emit).toHaveBeenCalledTimes(3);

    const laneControlUpdatedEvents = vi
      .mocked(mockEventBus.emit)
      .mock.calls.map((call) => call[0])
      .filter((e) => e.type === 'LaneControlUpdated');
    expect(laneControlUpdatedEvents).toHaveLength(2);
  });

  it('should return early if source lane not found', async () => {
    const toLane = createIdleLane('to-lane', 2);

    vi.mocked(mockRepository.findById).mockImplementation((id: string) => {
      if (id === 'to-lane') return toLane;
      return undefined;
    });

    const command: MoveLaneCommand = {
      fromLaneId: 'nonexistent-lane',
      toLaneId: 'to-lane',
    };

    await handler.execute(command);

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should return early if target lane not found', async () => {
    const fromLane = createIdleLaneWithPlayer('from-lane', 1);

    vi.mocked(mockRepository.findById).mockImplementation((id: string) => {
      if (id === 'from-lane') return fromLane;
      return undefined;
    });

    const command: MoveLaneCommand = {
      fromLaneId: 'from-lane',
      toLaneId: 'nonexistent-lane',
    };

    await handler.execute(command);

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should reject moving a lane onto itself without changing data', async () => {
    const lane = createIdleLaneWithPlayer('same-lane', 1);
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await expect(
      handler.execute({
        fromLaneId: 'same-lane',
        toLaneId: 'same-lane',
      }),
    ).rejects.toMatchObject({ code: 'LANE_003' });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should reject moving onto a lane that already has a player', async () => {
    const fromLane = createIdleLaneWithPlayer('from-lane', 1, 'Source Player');
    const toLane = createIdleLaneWithPlayer('to-lane', 2, 'Target Player');
    vi.mocked(mockRepository.findById).mockImplementation((id: string) => (id === 'from-lane' ? fromLane : toLane));

    await expect(
      handler.execute({
        fromLaneId: 'from-lane',
        toLaneId: 'to-lane',
      }),
    ).rejects.toMatchObject({ code: 'LANE_001' });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should reject moving from a lane without a player', async () => {
    const fromLane = createIdleLane('from-lane', 1);
    const toLane = createIdleLane('to-lane', 2);
    vi.mocked(mockRepository.findById).mockImplementation((id: string) => (id === 'from-lane' ? fromLane : toLane));

    await expect(
      handler.execute({
        fromLaneId: 'from-lane',
        toLaneId: 'to-lane',
      }),
    ).rejects.toMatchObject({ code: 'LANE_002' });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });
});
