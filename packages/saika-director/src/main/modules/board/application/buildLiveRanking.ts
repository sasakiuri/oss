import type { LaneControl } from '@/main/modules/lane-control';
import type { LiveRankingDto } from '@/shared/types/LiveRankingDto';

function calculateAverage(lane: LaneControl): number {
  const shotCount = lane.matchShots.length;
  if (shotCount === 0) return 0;
  return Math.round((lane.totalScore / shotCount) * 100) / 100;
}

/** Ranks Lanes with a player by average, then total score, then the earlier last shot. */
export function buildLiveRanking(lanes: readonly LaneControl[]): LiveRankingDto[] {
  const rankingData = lanes
    .filter((lane) => lane.player !== null)
    .map((lane) => ({
      lane,
      average: calculateAverage(lane),
      totalScore: lane.totalScore,
      firstShotTime: lane.lastShotTime,
    }));

  rankingData.sort((a, b) => {
    if (a.average !== b.average) return b.average - a.average;
    if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
    if (a.firstShotTime === null && b.firstShotTime === null) return 0;
    if (a.firstShotTime === null) return 1;
    if (b.firstShotTime === null) return -1;
    return a.firstShotTime - b.firstShotTime;
  });

  return rankingData.map(({ lane, average }, index) => ({
    rank: index + 1,
    laneId: lane.id,
    channel: lane.channel.value,
    playerName: lane.player?.name ?? '',
    affiliation: lane.player?.affiliation ?? '',
    seriesScores: lane.seriesScores,
    totalScore: lane.totalScore,
    average,
    shotCount: lane.matchShots.length,
    phase: lane.phase,
  }));
}
