import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartPreparationHandler } from '@/main/modules/lane-control/commands/StartPreparationHandler';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import type { StartPreparationCommand } from '@/main/modules/lane-control/commands/LaneCommands';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { Player } from '@/main/modules/lane-control/domain/Player';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';
import { DomainError } from '@/shared/errors';

function createIdleLaneWithPlayer(id: string, channel: number): LaneControl {
  const lane = LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG);
  return lane.assignPlayer(Player.create('Test Player', 'Test Affiliation', 'participant-1'));
}

describe('StartPreparationHandler', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let handler: StartPreparationHandler;

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
    handler = new StartPreparationHandler(mockRepository, mockEventBus);
  });

  it('should start preparation for a single lane', async () => {
    const lane = createIdleLaneWithPlayer('lane-1', 1);
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    const command: StartPreparationCommand = {
      laneIds: ['lane-1'],
    };

    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0]!;
    expect(savedLane.phase).toBe('ACTIVE');
    expect(savedLane.stageIndex).toBe(0);
  });

  it('should start preparation for multiple lanes', async () => {
    const lane1 = createIdleLaneWithPlayer('lane-1', 1);
    const lane2 = createIdleLaneWithPlayer('lane-2', 2);
    const lane3 = createIdleLaneWithPlayer('lane-3', 3);

    vi.mocked(mockRepository.findById).mockImplementation((id: string) => {
      if (id === 'lane-1') return lane1;
      if (id === 'lane-2') return lane2;
      if (id === 'lane-3') return lane3;
      return undefined;
    });

    const command: StartPreparationCommand = {
      laneIds: ['lane-1', 'lane-2', 'lane-3'],
    };

    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(3);

    for (const call of vi.mocked(mockRepository.save).mock.calls) {
      expect(call[0].phase).toBe('ACTIVE');
    }
  });

  it('should skip lanes that are not found (partial success)', async () => {
    const lane1 = createIdleLaneWithPlayer('lane-1', 1);

    vi.mocked(mockRepository.findById).mockImplementation((id: string) => {
      if (id === 'lane-1') return lane1;
      return undefined;
    });

    const command: StartPreparationCommand = {
      laneIds: ['lane-1', 'nonexistent-lane'],
    };

    // Should not throw because at least one lane was found
    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    const savedLane = vi.mocked(mockRepository.save).mock.calls[0]![0]!;
    expect(savedLane.id).toBe('lane-1');
    expect(savedLane.phase).toBe('ACTIVE');
  });

  it('should throw DomainError when ALL lanes are not found', async () => {
    vi.mocked(mockRepository.findById).mockReturnValue(undefined);

    const command: StartPreparationCommand = {
      laneIds: ['nonexistent-1', 'nonexistent-2'],
    };

    await expect(handler.execute(command)).rejects.toThrow(DomainError);
    await expect(handler.execute(command)).rejects.toThrow('None of the specified lanes were found');
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('should emit LanePhaseChanged and LaneControlUpdated events', async () => {
    const lane = createIdleLaneWithPlayer('lane-1', 1);
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    const command: StartPreparationCommand = {
      laneIds: ['lane-1'],
    };

    await handler.execute(command);

    // 2 events per lane: LanePhaseChanged + LaneControlUpdated
    expect(mockEventBus.emit).toHaveBeenCalledTimes(2);

    const emittedEvents = vi.mocked(mockEventBus.emit).mock.calls.map((call) => call[0]);

    const phaseChangedEvent = emittedEvents.find((e) => e.type === 'LanePhaseChanged');
    expect(phaseChangedEvent).toMatchObject({
      type: 'LanePhaseChanged',
      laneId: 'lane-1',
    });
    expect(phaseChangedEvent).toHaveProperty('phase');
    expect(phaseChangedEvent).toHaveProperty('stageIndex');
    expect(phaseChangedEvent).toHaveProperty('seriesIndex');
    expect(phaseChangedEvent).toHaveProperty('remainingTime');
    expect(phaseChangedEvent).toHaveProperty('timestamp');

    const laneUpdatedEvent = emittedEvents.find((e) => e.type === 'LaneControlUpdated');
    expect(laneUpdatedEvent).toMatchObject({
      type: 'LaneControlUpdated',
      laneId: 'lane-1',
      channel: 1,
    });
  });
});
