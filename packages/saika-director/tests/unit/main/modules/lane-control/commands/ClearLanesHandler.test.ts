import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';
import { ClearLanesHandler } from '@/main/modules/lane-control/commands/ClearLanesHandler';

function createIdleLane(id = 'lane-1', channel = 1): LaneControl {
  return LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
}

function createIdleLaneWithPlayer(id = 'lane-1', channel = 1): LaneControl {
  const lane = createIdleLane(id, channel);
  return lane.assignPlayer(Player.create('Test Player', 'Test Affiliation', 'participant-1'));
}

describe('ClearLanesHandler', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let handler: ClearLanesHandler;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByChannel: vi.fn(),
      findAll: vi.fn(() => []),
      findActive: vi.fn(() => []),
      delete: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
    handler = new ClearLanesHandler(mockRepository, mockEventBus);
  });

  it('should clear lane and save', async () => {
    const lane = createIdleLaneWithPlayer();
    expect(lane.player).not.toBeNull();

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0];
    expect(savedLane.player).toBeNull();
    expect(savedLane.phase).toBe('IDLE');
  });

  it('should emit LanePhaseChanged event', async () => {
    const lane = createIdleLaneWithPlayer();
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LanePhaseChanged',
        laneId: 'lane-1',
        phase: 'IDLE',
        remainingTime: 0,
      }),
    );
  });

  it('should emit LaneControlUpdated so board windows refresh after clearing', async () => {
    const lane = createIdleLaneWithPlayer();
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LaneControlUpdated',
        laneId: 'lane-1',
        playerName: null,
        participantId: null,
        phase: 'IDLE',
      }),
    );
  });

  it('should skip lanes not found', async () => {
    vi.mocked(mockRepository.findById).mockReturnValue(undefined);

    await handler.execute({ laneIds: ['lane-missing'] });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });
});
