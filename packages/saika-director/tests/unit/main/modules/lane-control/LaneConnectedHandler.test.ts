import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LaneConnectedHandler } from '@/main/modules/lane-control/application/LaneConnectedHandler';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Player } from '@/main/modules/lane-control/domain/Player';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import { InMemoryLaneControlRepository } from '../../../../helpers/InMemoryLaneControlRepository';
import { buildFinalConfig } from '../../../../helpers/testConfigs';

describe('LaneConnectedHandler', () => {
  let repository: InMemoryLaneControlRepository;
  let eventBus: IEventBus;
  let handler: LaneConnectedHandler;

  beforeEach(() => {
    repository = new InMemoryLaneControlRepository();
    eventBus = { emit: vi.fn(), on: vi.fn(() => vi.fn()) };
    handler = new LaneConnectedHandler(repository, eventBus);
  });

  it('creates an idle Qualification lane control for an unknown Lane on a free channel', () => {
    handler.handle({ laneId: 'lane-new', channel: 4 });

    const created = repository.findById('lane-new');
    expect(created?.channel.value).toBe(4);
    expect(created?.phase).toBe('IDLE');
    expect(created?.config.roundType).toBe('Qualification');
    expect(created?.player).toBeNull();
    expect(eventBus.emit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'LaneControlUpdated',
        laneId: 'lane-new',
        channel: 4,
        roundType: 'Qualification',
        playerName: null,
      }),
    );
  });

  it('leaves a channel owned by another lane control untouched for an unknown Lane', () => {
    const owner = LaneControl.create('lane-owner', Channel.create(4), buildFinalConfig(8));
    repository.save(owner);

    handler.handle({ laneId: 'lane-new', channel: 4 });

    expect(repository.findById('lane-new')).toBeUndefined();
    expect(repository.findByChannel(4)).toBe(owner);
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('does nothing when a known Lane reconnects on its current channel', () => {
    const lane = LaneControl.create('lane-1', Channel.create(2), buildFinalConfig(8));
    repository.save(lane);

    handler.handle({ laneId: 'lane-1', channel: 2 });

    expect(repository.findById('lane-1')).toBe(lane);
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('moves a known Lane to a free channel while keeping its round and athlete', () => {
    const lane = LaneControl.create('lane-1', Channel.create(2), buildFinalConfig(8), 3).assignPlayer(
      Player.create('Athlete One', 'Club A', 'participant-1'),
    );
    repository.save(lane);

    handler.handle({ laneId: 'lane-1', channel: 6 });

    const moved = repository.findById('lane-1');
    expect(moved?.channel.value).toBe(6);
    expect(moved?.config.roundType).toBe('Final');
    expect(moved?.relayNumber).toBe(3);
    expect(moved?.player?.name).toBe('Athlete One');
    expect(repository.findByChannel(2)).toBeUndefined();
    expect(eventBus.emit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: 'LaneControlUpdated',
        laneId: 'lane-1',
        channel: 6,
        playerName: 'Athlete One',
        participantId: 'participant-1',
        relayNumber: 3,
      }),
    );
  });

  it('keeps a known Lane on its channel when the new channel belongs to another lane control', () => {
    const lane = LaneControl.create('lane-1', Channel.create(2), buildFinalConfig(8));
    const other = LaneControl.create('lane-2', Channel.create(6), buildFinalConfig(8));
    repository.save(lane);
    repository.save(other);

    handler.handle({ laneId: 'lane-1', channel: 6 });

    expect(repository.findById('lane-1')?.channel.value).toBe(2);
    expect(repository.findById('lane-2')?.channel.value).toBe(6);
    expect(eventBus.emit).not.toHaveBeenCalled();
  });
});
