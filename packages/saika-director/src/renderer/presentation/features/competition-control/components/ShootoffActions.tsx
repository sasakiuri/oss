import { Check, ChevronRight, Trophy } from 'lucide-react';
import type { LaneControlDto } from '../../../stores/domain/laneControl.store';
import type { ActiveShootoff } from '../../../stores/domain/shootoff.store';
import { Button } from '../../shared/common/Button';

export type RoundResult = { type: 'winner'; winnerLaneId: string } | { type: 'tie'; tieLaneIds: string[] };

interface ShootoffActionsProps {
  activeShootoff: ActiveShootoff | null;
  roundResult: RoundResult | null;
  targetLanes: LaneControlDto[];
  contestedRank: number;
  allScoresEntered: boolean;
  isLoading: boolean;
  onCompleteRound: () => void;
  onNextRound: () => void;
  onResolve: () => void;
  onClose: () => void;
}

function getRankLabel(rank: number): string {
  return `rank ${rank}`;
}

export function ShootoffActions({
  activeShootoff,
  roundResult,
  targetLanes,
  contestedRank,
  allScoresEntered,
  isLoading,
  onCompleteRound,
  onNextRound,
  onResolve,
  onClose,
}: ShootoffActionsProps) {
  return (
    <>
      {roundResult && !activeShootoff?.isResolved && (
        <div className="px-6 py-4 bg-vscode-bg-light border-t border-vscode-border">
          {roundResult.type === 'winner' ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="text-yellow-400" size={24} />
                <div>
                  <div className="text-base font-semibold text-vscode-text">Winner Decided!</div>
                  <div className="text-base text-vscode-dimmed">
                    {targetLanes.find((l) => l.id === roundResult.winnerLaneId)?.playerName ?? 'Unknown'} won{' '}
                    {getRankLabel(contestedRank)}
                  </div>
                </div>
              </div>
              <Button onClick={onResolve} disabled={isLoading}>
                <Check size={16} className="mr-2" />
                {isLoading ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-vscode-text">Tie</div>
                <div className="text-base text-vscode-dimmed">
                  {roundResult.tieLaneIds.length} athletes remain tied. Continue to the next round.
                </div>
              </div>
              <Button onClick={onNextRound}>
                <ChevronRight size={16} className="mr-2" />
                Next round
              </Button>
            </div>
          )}
        </div>
      )}

      {activeShootoff?.isResolved && (
        <div className="px-6 py-4 bg-green-900/20 border-t border-green-500/30">
          <div className="flex items-center gap-3">
            <Check className="text-green-400" size={24} />
            <div>
              <div className="text-base font-semibold text-green-400">Shoot-off Complete</div>
              <div className="text-base text-vscode-dimmed">
                {targetLanes.find((l) => l.id === activeShootoff.winnerLaneId)?.playerName ?? 'Unknown'} won{' '}
                {getRankLabel(contestedRank)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-vscode-border">
        {!activeShootoff?.isResolved && !roundResult && (
          <Button onClick={onCompleteRound} disabled={!allScoresEntered || isLoading}>
            {isLoading ? 'Processing...' : 'Confirm round'}
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>
          {activeShootoff?.isResolved ? 'Close' : 'Cancel'}
        </Button>
      </div>
    </>
  );
}
