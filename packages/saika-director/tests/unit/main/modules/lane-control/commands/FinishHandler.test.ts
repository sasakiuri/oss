import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';
import { FinishHandler } from '@/main/modules/lane-control/commands/FinishHandler';
import { DomainError } from '@/shared/errors';

function createIdleLane(id = 'lane-1', channel = 1): LaneControl {
  return LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
}

function createIdleLaneWithPlayer(id = 'lane-1', channel = 1): LaneControl {
  const lane = createIdleLane(id, channel);
  return lane.assignPlayer(Player.create('Test Player', 'Test Affiliation', 'participant-1'));
}

describe('FinishHandler', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let handler: FinishHandler;

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
    handler = new FinishHandler(mockRepository, mockEventBus);
  });

  it('should finish lane in ACTIVE match state', async () => {
    // Get lane into ACTIVE match state: IDLE -> ACTIVE (prep) -> STAGE_ENTERED -> ACTIVE (match)
    let lane = createIdleLaneWithPlayer();
    lane = lane.startPreparation();
    lane = lane.advanceToNextStage();
    lane = lane.startMatch();
    expect(lane.phase).toBe('ACTIVE');
    expect(lane.canFinish).toBe(true);

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0];
    expect(savedLane.phase).toBe('FINISHED');

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LanePhaseChanged',
        laneId: 'lane-1',
        phase: 'FINISHED',
      }),
    );
  });

  it('should finish lane in SHOT_COMPLETE state', async () => {
    const { buildFinalConfig } = await import('../../../../../helpers/testConfigs');
    let lane = LaneControl.create('lane-1', Channel.create(1), buildFinalConfig(8));
    lane = lane.assignPlayer(Player.create('Test Player', 'Test Affiliation', 'participant-1'));
    lane = lane.startPreparation().advanceToNextStage().startMatch();
    for (let i = 0; i < 5; i++) {
      lane = lane.addShotByScore(10.0, Date.now(), i + 1);
    }
    lane = lane.startMatch();
    for (let i = 0; i < 5; i++) {
      lane = lane.addShotByScore(10.0, Date.now(), 6 + i);
    }
    lane = lane.advanceToNextStage().startMatch();
    lane = lane.addShotByScore(10.0, Date.now(), 11);
    expect(lane.phase).toBe('SHOT_COMPLETE');
    expect(lane.canFinish).toBe(true);

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0];
    expect(savedLane.phase).toBe('FINISHED');

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LanePhaseChanged',
        laneId: 'lane-1',
        phase: 'FINISHED',
      }),
    );
  });

  it('should skip lanes that cannot finish (IDLE state)', async () => {
    const lane = createIdleLaneWithPlayer();
    expect(lane.phase).toBe('IDLE');
    expect(lane.canFinish).toBe(false);

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should throw DomainError when all lanes not found', async () => {
    vi.mocked(mockRepository.findById).mockReturnValue(undefined);

    await expect(handler.execute({ laneIds: ['lane-missing-1', 'lane-missing-2'] })).rejects.toThrow(DomainError);

    expect(mockRepository.save).not.toHaveBeenCalled();
  });
});
