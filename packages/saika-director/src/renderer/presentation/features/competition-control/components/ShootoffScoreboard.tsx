import { Trophy } from 'lucide-react';
import type { LaneControlDto } from '../../../stores/domain/laneControl.store';
import type { ActiveShootoff } from '../../../stores/domain/shootoff.store';

interface ShootoffScoreboardProps {
  targetLanes: LaneControlDto[];
  activeShootoff: ActiveShootoff | null;
  currentRoundScores: Map<string, number>;
  shootoffTotals: Map<string, number>;
  onScoreChange: (laneId: string, value: string) => void;
}

export function ShootoffScoreboard({
  targetLanes,
  activeShootoff,
  currentRoundScores,
  shootoffTotals,
  onScoreChange,
}: ShootoffScoreboardProps) {
  return (
    <div className="flex-1 overflow-auto p-6">
      <table className="w-full">
        <thead>
          <tr className="text-left text-base text-vscode-dimmed border-b border-vscode-border">
            <th className="pb-2 font-medium">Lane</th>
            <th className="pb-2 font-medium">Athlete</th>
            <th className="pb-2 font-medium">Affiliation</th>
            {activeShootoff?.rounds.map((round) => (
              <th key={round.roundNumber} className="pb-2 font-medium text-center">
                R{round.roundNumber}
              </th>
            ))}
            <th className="pb-2 font-medium text-center">Current</th>
            <th className="pb-2 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {targetLanes.map((lane) => {
            const total = shootoffTotals.get(lane.id) ?? 0;
            const currentScore = currentRoundScores.get(lane.id);
            const isWinner = activeShootoff?.isResolved && activeShootoff.winnerLaneId === lane.id;

            return (
              <tr key={lane.id} className={`border-b border-vscode-border/50 ${isWinner ? 'bg-yellow-900/20' : ''}`}>
                <td className="py-3 font-mono text-base">{String(lane.channel).padStart(2, '0')}</td>
                <td className="py-3 text-base text-vscode-text">
                  <div className="flex items-center gap-2">
                    {isWinner && <Trophy size={16} className="text-yellow-400" />}
                    {lane.playerName ?? 'Unassigned'}
                  </div>
                </td>
                <td className="py-3 text-base text-vscode-dimmed">{lane.affiliation ?? '--'}</td>
                {activeShootoff?.rounds.map((round) => {
                  const shot = round.shots.find((s) => s.laneId === lane.id);
                  return (
                    <td key={round.roundNumber} className="py-3 text-base text-center text-vscode-text">
                      {shot?.score.toFixed(1) ?? '--'}
                    </td>
                  );
                })}
                <td className="py-3 text-center">
                  {activeShootoff?.isResolved ? (
                    <span className="text-base text-vscode-dimmed">--</span>
                  ) : (
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10.9"
                      value={currentScore ?? ''}
                      onChange={(e) => onScoreChange(lane.id, e.target.value)}
                      placeholder="0.0"
                      className="w-20 px-2 py-1 text-base text-center bg-vscode-input border border-vscode-border rounded text-vscode-text focus:border-orange-500 focus:outline-none"
                    />
                  )}
                </td>
                <td className="py-3 text-right font-mono text-base font-semibold text-vscode-text">
                  {(total + (currentScore ?? 0)).toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
