import { useState, useEffect, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import type { LaneControlDto } from '../../../stores/domain/laneControl.store';
import { useShootoffStore } from '../../../stores/domain/shootoff.store';
import { shootoffService } from '@/renderer/services';
import { ShootoffTimer } from './ShootoffTimer';
import { ShootoffScoreboard } from './ShootoffScoreboard';
import { ShootoffActions } from './ShootoffActions';
import type { RoundResult } from './ShootoffActions';

interface ShootoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  shootoff: {
    id: string;
    targetLaneIds: string[];
    contestedRank: number;
    currentRound: number;
    isResolved: boolean;
  };
  laneControls: LaneControlDto[];
}

function getRankLabel(rank: number): string {
  return `rank ${rank}`;
}

export function ShootoffModal({ isOpen, onClose, eventId: _eventId, shootoff, laneControls }: ShootoffModalProps) {
  void _eventId;
  const {
    activeShootoff,
    currentRoundScores,
    timerSeconds,
    timerRunning,
    setActiveShootoff,
    setRoundScore,
    removeRoundScore,
    clearCurrentRound,
    clearAll,
    setTimer,
    setTimerRunning,
    addRound,
    resolveShootoff,
  } = useShootoffStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetLanes = useMemo(() => {
    return laneControls.filter((lc) => shootoff.targetLaneIds.includes(lc.id));
  }, [laneControls, shootoff.targetLaneIds]);

  useEffect(() => {
    if (isOpen && shootoff) {
      setActiveShootoff({
        id: shootoff.id,
        targetLaneIds: shootoff.targetLaneIds,
        contestedRank: shootoff.contestedRank,
        rounds: [],
        isResolved: shootoff.isResolved,
      });
    }
  }, [isOpen, shootoff, setActiveShootoff]);

  useEffect(() => {
    if (!timerRunning || timerSeconds <= 0) return;

    const timer = setInterval(() => {
      setTimer(timerSeconds - 1);
      if (timerSeconds - 1 <= 0) {
        setTimerRunning(false);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [timerRunning, timerSeconds, setTimer, setTimerRunning]);

  const currentRoundNumber = useMemo(() => {
    return (activeShootoff?.rounds.length ?? 0) + 1;
  }, [activeShootoff]);

  const shootoffTotals = useMemo(() => {
    const totals = new Map<string, number>();
    if (!activeShootoff) return totals;

    for (const laneId of activeShootoff.targetLaneIds) {
      let total = 0;
      for (const round of activeShootoff.rounds) {
        const shot = round.shots.find((s) => s.laneId === laneId);
        if (shot) {
          total = Math.round((total + shot.score) * 10) / 10;
        }
      }
      totals.set(laneId, total);
    }
    return totals;
  }, [activeShootoff]);

  const allScoresEntered = useMemo(() => {
    if (!activeShootoff) return false;
    return activeShootoff.targetLaneIds.every((laneId) => currentRoundScores.has(laneId));
  }, [activeShootoff, currentRoundScores]);

  const roundResult = useMemo((): RoundResult | null => {
    if (!activeShootoff || activeShootoff.rounds.length === 0) return null;

    const latestRound = activeShootoff.rounds[activeShootoff.rounds.length - 1];
    if (!latestRound) return null;

    const sortedShots = [...latestRound.shots].sort((a, b) => b.score - a.score);
    const topScore = sortedShots[0]?.score ?? 0;
    const winners = sortedShots.filter((s) => s.score === topScore);

    if (winners.length === 1) {
      return {
        type: 'winner' as const,
        winnerLaneId: winners[0]!.laneId,
      };
    } else {
      return {
        type: 'tie' as const,
        tieLaneIds: winners.map((w) => w.laneId),
      };
    }
  }, [activeShootoff]);

  const handleStartTimer = useCallback(() => {
    setTimerRunning(true);
  }, [setTimerRunning]);

  const handlePauseTimer = useCallback(() => {
    setTimerRunning(false);
  }, [setTimerRunning]);

  const handleResetTimer = useCallback(() => {
    setTimer(50);
    setTimerRunning(false);
  }, [setTimer, setTimerRunning]);

  const handleScoreChange = useCallback(
    (laneId: string, value: string) => {
      const score = parseFloat(value);
      if (!isNaN(score) && score >= 0 && score <= 10.9) {
        setRoundScore(laneId, Math.round(score * 10) / 10);
      } else if (value === '') {
        removeRoundScore(laneId);
      }
    },
    [setRoundScore, removeRoundScore],
  );

  const handleCompleteRound = useCallback(async () => {
    if (!activeShootoff || !allScoresEntered) return;

    setIsLoading(true);
    setError(null);

    try {
      const shots = Array.from(currentRoundScores.entries()).map(([laneId, score]) => {
        const lane = targetLanes.find((l) => l.id === laneId);
        return {
          participantId: lane?.participantId ?? '',
          laneId,
          score,
        };
      });

      await shootoffService.completeRound({ shootoffId: activeShootoff.id });

      addRound({
        roundNumber: currentRoundNumber,
        shots,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm the round');
    } finally {
      setIsLoading(false);
    }
  }, [activeShootoff, allScoresEntered, currentRoundScores, targetLanes, currentRoundNumber, addRound]);

  const handleNextRound = useCallback(() => {
    clearCurrentRound();
  }, [clearCurrentRound]);

  const handleResolve = useCallback(async () => {
    if (!activeShootoff || !roundResult || roundResult.type !== 'winner') return;

    setIsLoading(true);
    setError(null);

    try {
      const winnerLaneId = roundResult.winnerLaneId;
      const losers = activeShootoff.targetLaneIds.filter((id) => id !== winnerLaneId);
      const rankedLaneIds = [winnerLaneId, ...losers];

      await shootoffService.resolve({ shootoffId: activeShootoff.id, rankedLaneIds });

      resolveShootoff(winnerLaneId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve the shoot-off');
    } finally {
      setIsLoading(false);
    }
  }, [activeShootoff, roundResult, resolveShootoff]);

  const handleClose = useCallback(() => {
    clearAll();
    onClose();
  }, [clearAll, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-vscode-bg border border-vscode-border rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-vscode-border">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-vscode-text">
              Shoot-off for {getRankLabel(shootoff.contestedRank)}
            </h2>
            <span className="px-3 py-1 rounded-full text-base font-medium bg-orange-900/50 text-orange-300">
              Round {currentRoundNumber}
            </span>
          </div>
          <button onClick={handleClose} className="text-vscode-dimmed hover:text-vscode-text">
            <X size={20} />
          </button>
        </div>

        {error && <div className="px-6 py-2 bg-red-900/30 text-red-400 text-base">{error}</div>}

        <ShootoffTimer
          timerSeconds={timerSeconds}
          timerRunning={timerRunning}
          onStart={handleStartTimer}
          onPause={handlePauseTimer}
          onReset={handleResetTimer}
        />

        <ShootoffScoreboard
          targetLanes={targetLanes}
          activeShootoff={activeShootoff}
          currentRoundScores={currentRoundScores}
          shootoffTotals={shootoffTotals}
          onScoreChange={handleScoreChange}
        />

        <ShootoffActions
          activeShootoff={activeShootoff}
          roundResult={roundResult}
          targetLanes={targetLanes}
          contestedRank={shootoff.contestedRank}
          allScoresEntered={allScoresEntered}
          isLoading={isLoading}
          onCompleteRound={handleCompleteRound}
          onNextRound={handleNextRound}
          onResolve={handleResolve}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}
