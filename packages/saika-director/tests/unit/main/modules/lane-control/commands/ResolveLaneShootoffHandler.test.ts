import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import { ResolveLaneShootoffHandler } from '@/main/modules/lane-control/commands/ResolveLaneShootoffHandler';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { buildFinalConfig } from '../../../../../helpers/testConfigs';

function createShootoffLane(): LaneControl {
  const config = buildFinalConfig(2);
  let lane = LaneControl.create('lane-1', Channel.create(1), config);
  lane = lane.assignPlayer(Player.create('Player 1', 'Affiliation', 'participant-1'));
  lane = lane.startPreparation();
  lane = lane.advanceToNextStage();
  lane = lane.startMatch();

  for (let shot = 1; shot <= config.stages[1]!.series[0]!.shots; shot++) {
    lane = lane.addShotByScore(10, Date.now(), shot);
  }

  return lane.startShootoff();
}

describe('ResolveLaneShootoffHandler', () => {
  let repository: ILaneControlRepository;
  let eventBus: IEventBus;
  let handler: ResolveLaneShootoffHandler;

  beforeEach(() => {
    repository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByChannel: vi.fn(),
      findAll: vi.fn(() => []),
      findActive: vi.fn(() => []),
      delete: vi.fn(),
    };
    eventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
    handler = new ResolveLaneShootoffHandler(repository, eventBus);
  });

  it('returns a shoot-off lane to SERIES_COMPLETE and publishes the update', async () => {
    vi.mocked(repository.findById).mockReturnValue(createShootoffLane());

    await handler.execute({ laneId: 'lane-1' });

    const savedLane = vi.mocked(repository.save).mock.calls[0]![0];
    expect(savedLane.phase).toBe('SERIES_COMPLETE');
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LaneControlUpdated', laneId: 'lane-1' }),
    );
  });

  it('does nothing when the lane no longer exists', async () => {
    vi.mocked(repository.findById).mockReturnValue(undefined);

    await handler.execute({ laneId: 'lane-missing' });

    expect(repository.save).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });
});
