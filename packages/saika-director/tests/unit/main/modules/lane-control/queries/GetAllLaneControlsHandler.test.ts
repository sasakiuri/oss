import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAllLaneControlsHandler } from '@/main/modules/lane-control/queries/GetAllLaneControlsHandler';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import { LaneControl, Channel, Player } from '@/main/modules/lane-control';
import { QUALIFICATION_CONFIG } from '../../../../../helpers/testConfigs';

describe('GetAllLaneControlsHandler', () => {
  let mockRepository: ILaneControlRepository;
  let handler: GetAllLaneControlsHandler;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByChannel: vi.fn(),
      findAll: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };
    handler = new GetAllLaneControlsHandler(mockRepository);
  });

  function createLane(channel: number, id = `lane-${channel}`): LaneControl {
    return LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG, 1);
  }

  function createLaneWithPlayer(channel: number): LaneControl {
    const lane = createLane(channel);
    return lane.assignPlayer(Player.create('Player A', 'Team A'), 1);
  }

  it('should return empty array when no lanes exist', async () => {
    vi.mocked(mockRepository.findAll).mockReturnValue([]);

    const result = await handler.execute();

    expect(result).toEqual([]);
  });

  it('should return DTOs for all lanes', async () => {
    const lane = createLane(1);
    vi.mocked(mockRepository.findAll).mockReturnValue([lane]);

    const result = await handler.execute();

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('lane-1');
    expect(result[0]!.channel).toBe(1);
    expect(result[0]!.phase).toBe('IDLE');
    expect(result[0]!.player).toBeNull();
  });

  it('should map player information correctly', async () => {
    const lane = createLaneWithPlayer(2);
    vi.mocked(mockRepository.findAll).mockReturnValue([lane]);

    const result = await handler.execute();

    expect(result[0]!.player).not.toBeNull();
    expect(result[0]!.player!.name).toBe('Player A');
    expect(result[0]!.player!.affiliation).toBe('Team A');
  });

  it('should map unified phase and stage/series index', async () => {
    const lane = createLane(1);
    vi.mocked(mockRepository.findAll).mockReturnValue([lane]);

    const result = await handler.execute();

    expect(result[0]!.unifiedPhase).toBe('IDLE');
    expect(result[0]!.stageIndex).toBe(0);
    expect(result[0]!.seriesIndex).toBe(0);
  });

  it('should return timer as null for IDLE lanes', async () => {
    const lane = createLane(1);
    vi.mocked(mockRepository.findAll).mockReturnValue([lane]);

    const result = await handler.execute();

    expect(result[0]!.timer).toBeNull();
  });

  it('should map shot arrays as empty for new lanes', async () => {
    const lane = createLane(1);
    vi.mocked(mockRepository.findAll).mockReturnValue([lane]);

    const result = await handler.execute();

    expect(result[0]!.preparationShots).toEqual([]);
    expect(result[0]!.matchShots).toEqual([]);
    expect(result[0]!.shootoffShots).toEqual([]);
  });

  it('should map multiple lanes', async () => {
    vi.mocked(mockRepository.findAll).mockReturnValue([createLane(1), createLane(2), createLane(3)]);

    const result = await handler.execute();

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.channel)).toEqual([1, 2, 3]);
  });
});
