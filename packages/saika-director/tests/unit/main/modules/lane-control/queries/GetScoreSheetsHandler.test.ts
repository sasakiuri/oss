import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetScoreSheetsHandler } from '@/main/modules/lane-control/queries/GetScoreSheetsHandler';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import { LaneControl, Channel, Player } from '@/main/modules/lane-control';
import { QUALIFICATION_CONFIG, buildFinalConfig } from '../../../../../helpers/testConfigs';

describe('GetScoreSheetsHandler', () => {
  let mockRepository: ILaneControlRepository;
  let handler: GetScoreSheetsHandler;

  beforeEach(() => {
    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByChannel: vi.fn(),
      findAll: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };
    handler = new GetScoreSheetsHandler(mockRepository);
  });

  function createLaneWithPlayer(id: string, channel: number): LaneControl {
    const lane = LaneControl.create(id, Channel.create(channel), QUALIFICATION_CONFIG, 1);
    return lane.assignPlayer(Player.create('Player A', 'Team A'), 1);
  }

  it('should return empty scoreSheets when no laneIds provided', async () => {
    const result = await handler.execute({ laneIds: [] });

    expect(result.success).toBe(true);
    expect(result.scoreSheets).toEqual([]);
  });

  it('should skip non-existent lanes', async () => {
    vi.mocked(mockRepository.findById).mockReturnValue(undefined);

    const result = await handler.execute({ laneIds: ['nonexistent'] });

    expect(result.success).toBe(true);
    expect(result.scoreSheets).toEqual([]);
  });

  it('should return score sheet for a lane with no shots', async () => {
    const lane = createLaneWithPlayer('lane-1', 1);
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    const result = await handler.execute({ laneIds: ['lane-1'] });

    expect(result.success).toBe(true);
    expect(result.scoreSheets).toHaveLength(1);
    expect(result.scoreSheets[0]!.laneId).toBe('lane-1');
    expect(result.scoreSheets[0]!.channel).toBe(1);
    expect(result.scoreSheets[0]!.playerName).toBe('Player A');
    expect(result.scoreSheets[0]!.affiliation).toBe('Team A');
    expect(result.scoreSheets[0]!.allShots).toEqual([]);
    expect(result.scoreSheets[0]!.totalScore).toBe(0);
    expect(result.scoreSheets[0]!.totalIntegerScore).toBe(0);
  });

  it('should handle multiple laneIds', async () => {
    const lane1 = createLaneWithPlayer('lane-1', 1);
    const lane2 = createLaneWithPlayer('lane-2', 2);
    vi.mocked(mockRepository.findById).mockImplementation((id) => {
      if (id === 'lane-1') return lane1;
      if (id === 'lane-2') return lane2;
      return undefined;
    });

    const result = await handler.execute({ laneIds: ['lane-1', 'lane-2'] });

    expect(result.scoreSheets).toHaveLength(2);
  });

  it('should return relay number from the lane', async () => {
    const lane = createLaneWithPlayer('lane-1', 1);
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    const result = await handler.execute({ laneIds: ['lane-1'] });

    expect(result.scoreSheets[0]!.relay).toBe(1);
  });

  it('should expose a timer miss separately from a scored zero', async () => {
    let lane = LaneControl.create('lane-1', Channel.create(1), buildFinalConfig(8), 1);
    lane = lane.assignPlayer(Player.create('Player A', 'Team A'), 1);
    lane = lane.startPreparation().advanceToNextStage().startMatch();
    for (let index = 0; index < 3; index++) {
      lane = lane.addShotByScore(10, Date.now(), index + 1);
    }
    lane = lane.tickTimer(250).tickTimer();
    vi.mocked(mockRepository.findById).mockReturnValue(lane);

    const result = await handler.execute({ laneIds: ['lane-1'] });

    expect(result.scoreSheets[0]?.allShots.slice(3)).toEqual([
      expect.objectContaining({ value: 0, disposition: 'MISS' }),
      expect.objectContaining({ value: 0, disposition: 'MISS' }),
    ]);
  });
});
