export interface RankableLane {
  id: string;
  totalScore: number;
  eliminated: boolean;
  eliminationRank: number | null;
}

export function calculateCurrentRanks(laneControls: RankableLane[]): Map<string, number> {
  const activeLanes = laneControls.filter((lc) => !lc.eliminated).sort((a, b) => b.totalScore - a.totalScore);

  const ranks = new Map<string, number>();
  let currentRank = 1;
  let previousScore = -1;

  activeLanes.forEach((lane, index) => {
    if (lane.totalScore === previousScore) {
    } else {
      currentRank = index + 1;
    }
    ranks.set(lane.id, currentRank);
    previousScore = lane.totalScore;
  });

  laneControls
    .filter((lc) => lc.eliminated)
    .forEach((lane) => {
      if (lane.eliminationRank !== null) {
        ranks.set(lane.id, lane.eliminationRank);
      }
    });

  return ranks;
}

export function getRankStyle(rank: number | null): { color: string; icon: boolean } {
  if (rank === null) return { color: 'text-zinc-100', icon: false };
  switch (rank) {
    case 1:
      return { color: 'text-yellow-400', icon: true };
    case 2:
      return { color: 'text-gray-300', icon: true };
    case 3:
      return { color: 'text-amber-600', icon: true };
    default:
      return { color: 'text-zinc-100', icon: false };
  }
}
