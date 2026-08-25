import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';
import { AdvanceToNextStageHandler } from '@/main/modules/lane-control/commands/AdvanceToNextStageHandler';

function createIdleLane(id = 'lane-1', channel = 1): LaneControl {
  return LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
}

function createIdleLaneWithPlayer(id = 'lane-1', channel = 1): LaneControl {
  const lane = createIdleLane(id, channel);
  return lane.assignPlayer(Player.create('Test Player', 'Test Affiliation', 'participant-1'));
}

describe('AdvanceToNextStageHandler', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let handler: AdvanceToNextStageHandler;

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
    handler = new AdvanceToNextStageHandler(mockRepository, mockEventBus);
  });

  it('should advance lane in ACTIVE preparation state', async () => {
    // QUALIFICATION_CONFIG has stageGroup 0 (preparation) and stageGroup 1 (match)
    // A lane in ACTIVE preparation state has canAdvanceToNextStage=true
    let lane = createIdleLaneWithPlayer();
    lane = lane.startPreparation();
    expect(lane.phase).toBe('ACTIVE');
    expect(lane.canAdvanceToNextStage).toBe(true);

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0];
    expect(savedLane.phase).toBe('STAGE_ENTERED');

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LanePhaseChanged',
        laneId: 'lane-1',
        phase: 'STAGE_ENTERED',
      }),
    );
  });

  it('should skip lanes that cannot advance', async () => {
    // IDLE lane cannot advance to next stage
    const lane = createIdleLaneWithPlayer();
    expect(lane.phase).toBe('IDLE');
    expect(lane.canAdvanceToNextStage).toBe(false);

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });
});
