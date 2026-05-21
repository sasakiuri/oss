// SPDX-License-Identifier: MIT
/**
 * SidePanel component
 *
 * @description
 * VSCode-style side panel component.
 * Displays session info, shot history, and score information.
 *
 * Layout:
 * +------------+
 * | P1: Discipline |
 * +----+-------+
 * | P2 | P3    | <- Lane number | Mode
 * +----+-------+
 * | P4: Total  |
 * | P5: History| <- Last 10 shots
 * | P6: Series | <- 3 cols x 2 rows
 * | P7: Average|
 * +------------+
 */

import React, { useMemo } from 'react';

import { useCompetitionStore } from '../stores/competitionStore';
import { useSessionStore } from '../stores/sessionStore';
import { withDisplayShotNumbers } from '../utils/displayShotNumbers';
import { DISCIPLINE_LABELS, calculateSeriesScores } from '../utils/scoreUtils';

import { SeriesProgress } from './side-panel/SeriesProgress';
import { SeriesScoreGrid } from './side-panel/SeriesScoreGrid';
import { ShotHistory } from './side-panel/ShotHistory';
import { TimerDisplay } from './side-panel/TimerDisplay';
import { StageIndicator } from './StageIndicator';

export interface SidePanelProps {
  className?: string;
}

export const SidePanel: React.FC<SidePanelProps> = ({ className = '' }) => {
  const discipline = useSessionStore((s) => s.discipline);
  const laneNumber = useSessionStore((s) => s.laneNumber);
  const mode = useSessionStore((s) => s.mode);
  const shots = useSessionStore((s) => s.shots);
  const preparationShotNumberResetIndices = useSessionStore((s) => s.preparationShotNumberResetIndices);
  const totalScore = useSessionStore((s) => s.totalScore);
  const seriesScores = useSessionStore((s) => s.seriesScores);
  const phase = useCompetitionStore((s) => s.phase);
  const shotsPerSeries = useCompetitionStore((s) => s.shotsPerSeries);
  const acc = useCompetitionStore((s) => s.acc);

  const displayShots = useMemo(
    () => withDisplayShotNumbers(shots, { preparationResetIndices: preparationShotNumberResetIndices }),
    [shots, preparationShotNumberResetIndices],
  );
  const recentShots = useMemo(() => displayShots.slice(-10).reverse(), [displayShots]);

  const scoringShots = useMemo(
    () => (mode === 'SIGHTING' ? shots : shots.filter((shot) => shot.isRecorded)),
    [mode, shots],
  );

  const displayTotalScore = useMemo(
    () =>
      mode === 'MATCH' && seriesScores.length > 0
        ? totalScore
        : scoringShots.reduce((sum, shot) => sum + shot.score, 0),
    [mode, seriesScores, totalScore, scoringShots],
  );

  const averageScore = useMemo(
    () => (scoringShots.length > 0 ? displayTotalScore / scoringShots.length : 0),
    [scoringShots, displayTotalScore],
  );

  const calculatedSeriesScores = useMemo(
    () => calculateSeriesScores(scoringShots, shotsPerSeries),
    [scoringShots, shotsPerSeries],
  );

  const displaySeriesScores = useMemo(
    () => (mode === 'MATCH' && seriesScores.length > 0 ? seriesScores : calculatedSeriesScores),
    [mode, seriesScores, calculatedSeriesScores],
  );

  return (
    <aside
      className={`flex w-[448px] flex-col border-r border-zinc-500 bg-zinc-700 text-zinc-300 ${className}`.trim()}
      role="complementary"
      aria-label="Side Panel"
    >
      {/* Top-aligned group: P1, P2, P3, P4 */}
      <div className="flex-shrink-0">
        {/* P1: Discipline name */}
        <div className="flex h-14 items-center justify-center border-b border-zinc-500 px-2">
          <span className="truncate text-center text-4xl font-semibold">
            {discipline ? DISCIPLINE_LABELS[discipline] : 'No Discipline'}
          </span>
        </div>

        {/* P2 + P3: Lane number | Mode */}
        <div className="flex h-12 border-b border-zinc-500">
          <div className="flex flex-1 items-center justify-center border-r border-zinc-500 px-2">
            <span className="text-4xl font-medium text-zinc-300">{laneNumber}</span>
          </div>
          <div className="flex flex-1 items-center justify-center px-2">
            {phase !== 'IDLE' ? (
              <StageIndicator />
            ) : (
              <span className="text-4xl font-medium text-zinc-300">{mode === 'SIGHTING' ? 'Sighting' : 'Match'}</span>
            )}
          </div>
        </div>

        {/* P4: Total score */}
        <div className="flex h-16 flex-col items-center justify-center border-b border-zinc-500 px-2">
          <span className="text-5xl font-bold text-zinc-300">
            {acc === 'RING' ? String(Math.floor(displayTotalScore / 10)) : (displayTotalScore / 10).toFixed(1)}
          </span>
        </div>

        {/* Timer (competition active only) */}
        {phase !== 'IDLE' && <TimerDisplay />}
      </div>

      {/* P5: Last 10 shots */}
      <ShotHistory shots={recentShots} acc={acc} />

      {/* Bottom-aligned group: P6, P7 */}
      <div className="flex-shrink-0">
        {/* Series progress (competition active only) */}
        {phase !== 'IDLE' && <SeriesProgress />}

        {/* P6: Series scores */}
        <SeriesScoreGrid scores={displaySeriesScores} acc={acc} />

        {/* P7: Average score */}
        <div className="flex h-16 flex-col items-center justify-center px-2">
          <span className="text-4xl font-bold text-zinc-100">~ {(averageScore / 10).toFixed(2)}</span>
        </div>
      </div>
    </aside>
  );
};
