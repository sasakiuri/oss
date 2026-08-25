import type { FinalBoardLaneData } from '../types';
import { Trophy } from 'lucide-react';
import { calculateCurrentRanks } from '../../shared/scoring';
import { FinalBoardTableHeader } from './FinalBoardTableHeader';
import { FinalBoardTableRow } from './FinalBoardTableRow';

interface FinalBoardTableProps {
  laneControls: FinalBoardLaneData[];
  currentStageName: string;
  shootoff?: {
    targetLaneIds: string[];
    currentRound: number;
  };
}

function findLowestRankedLaneIds(laneControls: FinalBoardLaneData[], ranks: Map<string, number>): string[] {
  const activeLanes = laneControls.filter((lc) => !lc.eliminated);
  if (activeLanes.length === 0) return [];

  const lowestRank = Math.max(...activeLanes.map((lc) => ranks.get(lc.id) ?? 0));
  return activeLanes.filter((lc) => ranks.get(lc.id) === lowestRank).map((lc) => lc.id);
}

function getLatestStage2ShotIndex(laneControls: FinalBoardLaneData[]): number {
  let maxShotCount = 0;
  for (const lane of laneControls) {
    if (lane.eliminated) continue;
    const shotCount = lane.stage2Shots.length;
    if (shotCount > maxShotCount) {
      maxShotCount = shotCount;
    }
  }
  return maxShotCount > 0 ? maxShotCount - 1 : -1;
}

function calculateLatestShotHighScorers(laneControls: FinalBoardLaneData[], latestShotIndex: number): string[] {
  if (latestShotIndex < 0 || latestShotIndex > 12) return [];

  let maxScore = -1;
  let maxScorerIds: string[] = [];

  for (const lane of laneControls) {
    if (lane.eliminated) continue;

    const score = lane.stage2Shots[latestShotIndex];
    if (score === undefined) continue;

    if (score > maxScore) {
      maxScore = score;
      maxScorerIds = [lane.id];
    } else if (score === maxScore && maxScore > 0) {
      maxScorerIds.push(lane.id);
    }
  }

  return maxScorerIds;
}

export function FinalBoardTable({ laneControls, currentStageName, shootoff }: FinalBoardTableProps) {
  if (laneControls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
        <Trophy size={48} className="mb-4 opacity-50" />
        <div className="text-lg">No Final data</div>
        <div className="text-base mt-2">Data will appear after the competition starts</div>
      </div>
    );
  }

  const ranks = calculateCurrentRanks(laneControls);
  const lowestRankedIds = findLowestRankedLaneIds(laneControls, ranks);

  const sortedLanes = [...laneControls].sort((a, b) => {
    if (!a.eliminated && !b.eliminated) {
      return (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99);
    }
    if (a.eliminated && !b.eliminated) return 1;
    if (!a.eliminated && b.eliminated) return -1;
    return (a.eliminationRank ?? 99) - (b.eliminationRank ?? 99);
  });

  const isStage2Active =
    currentStageName === '2nd Competition Stage' || laneControls.some((lc) => !lc.eliminated && lc.stageIndex === 2);

  const latestShotIndex = getLatestStage2ShotIndex(laneControls);
  const latestShotHighScorers = calculateLatestShotHighScorers(laneControls, latestShotIndex);

  return (
    <div className="overflow-auto border border-zinc-700 rounded-lg">
      <table className="w-full text-zinc-100">
        <FinalBoardTableHeader />
        <tbody>
          {sortedLanes.map((lane) => {
            const rank = ranks.get(lane.id) ?? null;
            const isEliminated = lane.eliminated;
            const isLowest = !isEliminated && lowestRankedIds.includes(lane.id) && isStage2Active;
            const isShootoffTarget = shootoff?.targetLaneIds.includes(lane.id) ?? false;

            return (
              <FinalBoardTableRow
                key={lane.id}
                lane={lane}
                rank={rank}
                isLowest={isLowest}
                isShootoffTarget={isShootoffTarget}
                latestShotIndex={latestShotIndex}
                latestShotHighScorers={latestShotHighScorers}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
