import type { LanePhase } from '@/shared/constants/competition';
import { Card } from '../../shared/common/Card';

interface TargetBoardCardProps {
  channel: number;
  playerName: string | null;
  affiliation: string | null;
  totalScore: number;
  seriesScores: number[];
  shotCount: number;
  recentShots: number[];
  phase: LanePhase;
}

const phaseColors: Record<LanePhase, { bg: string; text: string; border: string }> = {
  IDLE: { bg: 'bg-zinc-800', text: 'text-zinc-400', border: 'border-zinc-600' },
  ACTIVE: { bg: 'bg-green-900/40', text: 'text-green-300', border: 'border-green-500' },
  SHOT_COMPLETE: { bg: 'bg-yellow-900/40', text: 'text-yellow-300', border: 'border-yellow-500' },
  SERIES_COMPLETE: { bg: 'bg-blue-900/40', text: 'text-blue-300', border: 'border-blue-500' },
  STAGE_ENTERED: { bg: 'bg-yellow-900/40', text: 'text-yellow-300', border: 'border-yellow-500' },
  SHOOTOFF: { bg: 'bg-red-900/40', text: 'text-red-300', border: 'border-red-500' },
  FINISHED: { bg: 'bg-blue-900/40', text: 'text-blue-300', border: 'border-blue-500' },
};

export function TargetBoardCard({
  channel,
  playerName,
  affiliation,
  totalScore,
  seriesScores,
  shotCount,
  recentShots,
  phase,
}: TargetBoardCardProps) {
  const colors = phaseColors[phase];
  const average = shotCount > 0 ? totalScore / shotCount : 0;

  return (
    <Card className={`flex flex-col gap-2 h-full bg-zinc-700 border-2 ${colors.border} transition-colors p-3`}>
      {/* Header: Channel + Phase */}
      <div className="flex items-center justify-between pb-1 border-b border-zinc-500">
        <span className="text-xl font-mono font-bold text-zinc-100">CH{channel.toString().padStart(2, '0')}</span>
        <span className={`text-base font-semibold uppercase ${colors.text}`}>{phase}</span>
      </div>

      {/* Player Info */}
      <div className="flex flex-col">
        <span className="text-xl font-bold text-zinc-100 truncate">{playerName || 'Unregistered'}</span>
        {affiliation && <span className="text-base text-zinc-300 truncate">{affiliation}</span>}
      </div>

      {/* Total Score - Large Display */}
      <div className="flex items-center justify-center py-2 bg-zinc-800/50 rounded">
        <span className="text-5xl font-bold font-mono text-zinc-100 tabular-nums">{totalScore.toFixed(1)}</span>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: seriesScores.length }, (_, i) => {
          const score = seriesScores[i];
          return (
            <div key={i} className="flex items-center justify-center py-1 bg-zinc-800/50 rounded">
              <span className="text-lg font-mono font-bold text-zinc-100 tabular-nums">
                {score !== undefined ? score.toFixed(1) : '-'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-5 gap-1 flex-1">
        {Array.from({ length: 10 }, (_, i) => {
          const score = recentShots[i];
          return (
            <div key={i} className="flex items-center justify-center bg-zinc-800/50 rounded">
              <span className="text-base font-mono font-bold text-zinc-100 tabular-nums">
                {score !== undefined ? score.toFixed(1) : '-'}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center py-1 bg-zinc-800/50 rounded">
        <span className="text-xl font-mono font-bold text-zinc-100 tabular-nums">~{average.toFixed(2)}</span>
      </div>
    </Card>
  );
}
