import { describe, expect, it } from 'vitest';

import { buildLiveRanking } from '@/main/modules/board/application/buildLiveRanking';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';

import { QUALIFICATION_CONFIG } from '../../../../helpers/testConfigs';

function lane(channel: number, scores: number[], lastShotTime: number | null): LaneControl {
  const snapshot = LaneControl.create(`lane-${channel}`, Channel.create(channel), QUALIFICATION_CONFIG).toSnapshot();
  return LaneControl.fromSnapshot({
    ...snapshot,
    player: { name: `Athlete ${channel}`, affiliation: 'Team' },
    matchShots: scores.map((score, index) => ({ shotNumber: index + 1, score, seriesNumber: 1 })),
    lastShotTime,
  });
}

describe('buildLiveRanking', () => {
  it('breaks an equal average by the higher total score', () => {
    const ranking = buildLiveRanking([lane(1, [10], 1_000), lane(2, [10, 10], 2_000)]);

    expect(ranking.map(({ rank, laneId, average, totalScore }) => [rank, laneId, average, totalScore])).toEqual([
      [1, 'lane-2', 10, 20],
      [2, 'lane-1', 10, 10],
    ]);
  });

  it('ranks the earlier last shot first when average and total are equal', () => {
    const ranking = buildLiveRanking([lane(1, [9, 10], 5_000), lane(2, [10, 9], 3_000), lane(3, [9.5, 9.5], 4_000)]);

    expect(ranking.map(({ rank, laneId }) => [rank, laneId])).toEqual([
      [1, 'lane-2'],
      [2, 'lane-3'],
      [3, 'lane-1'],
    ]);
  });

  it('places Lanes without a shot time after timed Lanes and keeps their order among themselves', () => {
    const ranking = buildLiveRanking([lane(1, [], null), lane(2, [], 1_000), lane(3, [], null)]);

    expect(ranking.map(({ rank, laneId, shotCount }) => [rank, laneId, shotCount])).toEqual([
      [1, 'lane-2', 0],
      [2, 'lane-1', 0],
      [3, 'lane-3', 0],
    ]);
  });
});
