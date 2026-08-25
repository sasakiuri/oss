import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditShotHandler } from '@/main/modules/lane-control/commands/EditShotHandler';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import type { EditShotCommand } from '@/main/modules/lane-control/commands/LaneCommands';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';
import { DomainError } from '@/shared/errors';

function createIdleLane(id = 'lane-1', channel = 1): LaneControl {
  return LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
}

function createIdleLaneWithPlayer(id = 'lane-1', channel = 1): LaneControl {
  const lane = createIdleLane(id, channel);
  return lane.assignPlayer(Player.create('Test Player', 'Test Affiliation', 'participant-1'));
}

/**
 * Creates an ACTIVE Lane in the match phase with an added shot.
 *
 * QUALIFICATION_CONFIG phases:
 *   [0] Preparation (stageGroup=0, isPreparation=true)
 *   [1] Competition (stageGroup=1, isScored=true, isLastPhase=true)
 *
 * Transitions:
 *   IDLE → startPreparation() → ACTIVE (phaseIndex=0, preparation)
 *   → advanceToNextStage() → STAGE_ENTERED (phaseIndex=1, match)
 *   → startMatch() → ACTIVE (phaseIndex=1, match)
 *   → addShotByScore() x 2 → ACTIVE with 2 match shots
 */
function createActiveLaneWithMatchShots(id = 'lane-1', channel = 1): LaneControl {
  let lane = createIdleLaneWithPlayer(id, channel);
  lane = lane.startPreparation();
  lane = lane.advanceToNextStage();
  lane = lane.startMatch();
  lane = lane.addShotByScore(10.0, Date.now(), 1);
  lane = lane.addShotByScore(9.5, Date.now(), 2);
  return lane;
}

describe('EditShotHandler', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let handler: EditShotHandler;

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
    handler = new EditShotHandler(mockRepository, mockEventBus);
  });

  it('should update a match shot successfully', async () => {
    const lane = createActiveLaneWithMatchShots('lane-1', 1);
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    const command: EditShotCommand = {
      laneId: 'lane-1',
      shotIndex: 0,
      newScore: 8.5,
      shotType: 'MATCH',
    };

    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0]!;
    expect(savedLane.matchShots[0]!.score.value).toBe(8.5);
    // Second shot should remain unchanged
    expect(savedLane.matchShots[1]!.score.value).toBe(9.5);
  });

  it('should throw DomainError when lane not found', async () => {
    vi.mocked(mockRepository.findById).mockReturnValue(undefined);

    const command: EditShotCommand = {
      laneId: 'nonexistent-lane',
      shotIndex: 0,
      newScore: 10.0,
      shotType: 'MATCH',
    };

    await expect(handler.execute(command)).rejects.toThrow(DomainError);
    await expect(handler.execute(command)).rejects.toThrow('Lane nonexistent-lane not found');
  });

  it('should save updated lane to repository', async () => {
    const lane = createActiveLaneWithMatchShots('lane-1', 1);
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    const command: EditShotCommand = {
      laneId: 'lane-1',
      shotIndex: 1,
      newScore: 10.5,
      shotType: 'MATCH',
    };

    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0]!;
    expect(savedLane.id).toBe('lane-1');
    expect(savedLane.matchShots[1]!.score.value).toBe(10.5);
  });

  it('should emit LaneControlUpdated event', async () => {
    const lane = createActiveLaneWithMatchShots('lane-1', 1);
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    const command: EditShotCommand = {
      laneId: 'lane-1',
      shotIndex: 0,
      newScore: 9.0,
      shotType: 'MATCH',
    };

    await handler.execute(command);

    expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
    const emittedEvent = vi.mocked(mockEventBus.emit).mock.calls[0]![0]!;
    expect(emittedEvent).toMatchObject({
      type: 'LaneControlUpdated',
      laneId: 'lane-1',
      channel: 1,
    });
  });

  it('should throw DomainError when shot index is out of bounds', async () => {
    const lane = createActiveLaneWithMatchShots('lane-1', 1);
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    const command: EditShotCommand = {
      laneId: 'lane-1',
      shotIndex: 99,
      newScore: 10.0,
      shotType: 'MATCH',
    };

    await expect(handler.execute(command)).rejects.toThrow(DomainError);
    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockEventBus.emit).not.toHaveBeenCalled();
  });
});
