import type { FinalBoardLaneData } from '../types';
import { Medal, AlertTriangle } from 'lucide-react';
import { formatScore, getRankStyle, calculateStage1Series } from '../../shared/scoring';

interface FinalBoardTableRowProps {
  lane: FinalBoardLaneData;
  rank: number | null;
  isLowest: boolean;
  isShootoffTarget: boolean;
  latestShotIndex: number;
  latestShotHighScorers: string[];
}

export function FinalBoardTableRow({
  lane,
  rank,
  isLowest,
  isShootoffTarget,
  latestShotIndex,
  latestShotHighScorers,
}: FinalBoardTableRowProps) {
  const isEliminated = lane.eliminated;
  const rankStyle = getRankStyle(lane.eliminationRank ?? rank);

  const {
    first5Total: stage1First5Total,
    second5Total: stage1Second5Total,
    first5: stage1First5,
    second5: stage1Second5,
  } = calculateStage1Series(lane.stage1Shots);

  const stage2Shots = lane.stage2Shots.slice(0, 14);

  const currentStage2ShotIndex = lane.stage2Shots.length;

  return (
    <tr
      className={`
        border-b border-zinc-700 transition-colors
        ${isEliminated ? 'opacity-50 grayscale' : ''}
        ${isLowest && !isShootoffTarget ? 'border-l-4 border-l-red-500' : ''}
        ${isShootoffTarget ? 'border-l-4 border-l-yellow-500 bg-yellow-900/20' : ''}
        ${!isEliminated && !isLowest && !isShootoffTarget ? 'hover:bg-zinc-800/50' : ''}
      `}
    >
      {/* Rank */}
      <td className="px-2 py-2 text-center">
        <div className={`flex items-center justify-center gap-1 ${rankStyle.color} font-bold`}>
          {rankStyle.icon && <Medal size={14} />}
          <span className="text-base tabular-nums">{isEliminated ? `${lane.eliminationRank}th` : (rank ?? '-')}</span>
        </div>
      </td>

      {/* Channel */}
      <td className="px-2 py-2 text-center">
        <span className="font-mono text-blue-400">CH{lane.channel.toString().padStart(2, '0')}</span>
      </td>

      {/* Name */}
      <td className="px-2 py-2">
        <span className="font-medium truncate">{lane.playerName}</span>
      </td>

      {/* Affiliation */}
      <td className="px-2 py-2 text-zinc-400 truncate">{lane.affiliation || '-'}</td>

      {/* 1st Stage: 1-5 */}
      <td className="px-1 py-1 text-center font-mono tabular-nums text-sm border-l border-zinc-600">
        {stage1First5.length > 0 ? formatScore(stage1First5Total) : '-'}
      </td>

      {/* 1st Stage: 6-10 */}
      <td className="px-1 py-1 text-center font-mono tabular-nums text-sm">
        {stage1Second5.length > 0 ? formatScore(stage1Second5Total) : '-'}
      </td>

      {/* 1st Stage Total (ST1) */}
      <td className="px-1 py-1 text-center font-mono tabular-nums text-sm font-bold bg-zinc-800/30">
        {formatScore(lane.stage1Total)}
      </td>

      {/* 2nd Stage: Individual shots 11-24 */}
      {Array.from({ length: 14 }, (_, i) => {
        const score = stage2Shots[i];
        const isCurrent =
          !isEliminated && lane.unifiedPhase === 'ACTIVE' && lane.stageIndex === 2 && currentStage2ShotIndex === i;

        const isLatestHighScorer =
          i === latestShotIndex && latestShotHighScorers.includes(lane.id) && score !== undefined;

        return (
          <td
            key={i}
            className={`
              px-1 py-1 text-center font-mono tabular-nums text-sm
              ${i === 0 ? 'border-l border-zinc-600' : ''}
              ${isCurrent ? 'bg-green-900/40 font-bold' : ''}
              ${isLatestHighScorer && !isCurrent ? 'text-yellow-400 font-bold' : ''}
            `}
          >
            {formatScore(score)}
          </td>
        );
      })}

      {/* 2nd Stage Total (ST2) */}
      <td className="px-1 py-1 text-center font-mono tabular-nums text-sm font-bold bg-zinc-800/30">
        {formatScore(lane.stage2Total)}
      </td>

      {/* Total */}
      <td className="px-2 py-2 text-center font-mono tabular-nums font-bold text-lg border-l border-zinc-600">
        {formatScore(lane.totalScore)}
      </td>

      {/* Remarks */}
      <td className="px-2 py-2 text-center border-l border-zinc-600">
        {isEliminated ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-900/50 text-red-300 rounded text-xs font-semibold">
            ELIMINATED
          </span>
        ) : isShootoffTarget ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-900/50 text-yellow-300 rounded text-xs font-semibold">
            <AlertTriangle size={12} />
            SHOOTOFF
          </span>
        ) : null}
      </td>
    </tr>
  );
}
