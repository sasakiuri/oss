import { memo } from 'react';
import type { LaneControlDto } from '@/renderer/presentation/stores/domain/laneControl.store';
import { Card } from './Card';
import { ShotScore } from '../../competition-control/components/ShotScore';
import { SeriesSubtotal } from '../../competition-control/components/SeriesSubtotal';
import { TotalScore } from '../../competition-control/components/TotalScore';
import { PhaseIndicator } from './PhaseIndicator';
import { formatRemainingTime } from '@/shared/utils/timeFormat';

interface LaneCardProps {
  lane: LaneControlDto;
}

export const LaneCard = memo(function LaneCard({ lane }: LaneCardProps) {
  const currentSeriesShots = (lane.recentShots ?? []).slice(-10);

  return (
    <Card className="flex flex-col gap-2">
      {/* Player info */}
      <div className="flex items-center gap-2 pb-2 border-b border-vscode-border">
        <span className="font-mono text-base text-blue-400">CH{lane.channel.toString().padStart(2, '0')}</span>
        <span className="text-base font-medium text-vscode-text truncate">{lane.playerName || 'Unregistered'}</span>
        {lane.affiliation && <span className="text-base text-vscode-text-muted truncate">({lane.affiliation})</span>}
      </div>

      {/* Phase and Timer */}
      <div className="flex items-center justify-between text-sm">
        <PhaseIndicator phase={lane.phase} />
        {lane.remainingTime > 0 && (
          <span
            className={`font-mono ${lane.remainingTime <= 60 ? 'text-vscode-error animate-pulse' : 'text-vscode-text-muted'}`}
          >
            {formatRemainingTime(lane.remainingTime)}
          </span>
        )}
      </div>

      {/* Current shots (10 per visible row) */}
      <div className="grid grid-cols-10 gap-0.5">
        {Array.from({ length: 10 }, (_, i) => {
          const score = currentSeriesShots[i];
          return <ShotScore key={i} shotNumber={i + 1} score={score} />;
        })}
      </div>

      {/* Series subtotals */}
      {(lane.seriesScores?.length ?? 0) > 0 && <SeriesSubtotal seriesScores={lane.seriesScores} />}

      {/* Total */}
      <TotalScore total={lane.totalScore} shotCount={lane.shotNumber} />
    </Card>
  );
});
