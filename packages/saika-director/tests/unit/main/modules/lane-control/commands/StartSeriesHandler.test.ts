import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';
import { StartSeriesHandler } from '@/main/modules/lane-control/commands/StartSeriesHandler';

function createIdleLane(id = 'lane-1', channel = 1): LaneControl {
  return LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
}

function createIdleLaneWithPlayer(id = 'lane-1', channel = 1): LaneControl {
  const lane = createIdleLane(id, channel);
  return lane.assignPlayer(Player.create('Test Player', 'Test Affiliation', 'participant-1'));
}

describe('StartSeriesHandler', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let handler: StartSeriesHandler;

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
    handler = new StartSeriesHandler(mockRepository, mockEventBus);
  });

  it('should start match for lane in STAGE_ENTERED state', async () => {
    // Get lane into STAGE_ENTERED state: IDLE -> ACTIVE (preparation) -> STAGE_ENTERED (match)
    let lane = createIdleLaneWithPlayer();
    lane = lane.startPreparation();
    lane = lane.advanceToNextStage();
    expect(lane.phase).toBe('STAGE_ENTERED');
    expect(lane.canStartMatch).toBe(true);

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0];
    expect(savedLane.phase).toBe('ACTIVE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LanePhaseChanged',
        laneId: 'lane-1',
        phase: 'ACTIVE',
      }),
    );
  });

  it('should start match for lane in SHOT_COMPLETE state (shot mode next shot)', async () => {
    // Build a lane in SHOT_COMPLETE state via Final 2nd Stage
    const { buildFinalConfig } = await import('../../../../../helpers/testConfigs');
    let lane = LaneControl.create('lane-1', Channel.create(1), buildFinalConfig(8));
    lane = lane.startPreparation().advanceToNextStage().startMatch();
    // 1st Stage: 10 shots
    for (let i = 0; i < 5; i++) {
      lane = lane.addShotByScore(10.0, Date.now(), i + 1);
    }
    lane = lane.startMatch();
    for (let i = 0; i < 5; i++) {
      lane = lane.addShotByScore(10.0, Date.now(), 6 + i);
    }
    // 2nd Stage: first shot → SHOT_COMPLETE
    lane = lane.advanceToNextStage().startMatch();
    lane = lane.addShotByScore(10.0, Date.now(), 11);
    expect(lane.phase).toBe('SHOT_COMPLETE');
    expect(lane.canStartMatch).toBe(true);

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0];
    expect(savedLane.phase).toBe('ACTIVE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LanePhaseChanged',
        laneId: 'lane-1',
        phase: 'ACTIVE',
      }),
    );
  });

  it('should skip lanes that cannot start match (IDLE state)', async () => {
    const lane = createIdleLaneWithPlayer();
    expect(lane.phase).toBe('IDLE');
    expect(lane.canStartMatch).toBe(false);

    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    await handler.execute({ laneIds: ['lane-1'] });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });

  it('should skip lanes not found', async () => {
    vi.mocked(mockRepository.findById).mockReturnValue(undefined);

    await handler.execute({ laneIds: ['lane-missing'] });

    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });
});
