import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';
import { InsertShotHandler } from '@/main/modules/lane-control/commands/InsertShotHandler';

function createIdleLane(id = 'lane-1', channel = 1): LaneControl {
  return LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
}

function createIdleLaneWithPlayer(id = 'lane-1', channel = 1): LaneControl {
  const lane = createIdleLane(id, channel);
  return lane.assignPlayer(Player.create('Test Player', 'Test Affiliation', 'participant-1'));
}

describe('InsertShotHandler', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let handler: InsertShotHandler;

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
    handler = new InsertShotHandler(mockRepository, mockEventBus);
  });

  it('should insert shot and save', async () => {
    // Get lane into ACTIVE match state
    let lane = createIdleLaneWithPlayer();
    lane = lane.startPreparation();
    lane = lane.advanceToNextStage();
    lane = lane.startMatch();
    lane = lane.addShotByScore(10.0, Date.now(), 1);
    expect(lane.matchShots).toHaveLength(1);

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneId: 'lane-1', shotIndex: 0, score: 9.0, shotType: 'MATCH' });

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0];
    expect(savedLane.matchShots).toHaveLength(2);

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LaneControlUpdated',
      }),
    );
  });

  it('should return early when lane not found', async () => {
    vi.mocked(mockRepository.findById).mockReturnValue(undefined);

    await handler.execute({ laneId: 'lane-missing', shotIndex: 0, score: 9.0, shotType: 'MATCH' });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });
});
