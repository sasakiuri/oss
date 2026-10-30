// SPDX-License-Identifier: MIT
/** Displays the selected discipline, lane, session scores, and shot history. */

import React, { useMemo } from 'react';

import { localProgressControls } from '../policies/localProgressControls';
import { useCompetitionStore } from '../stores/competitionStore';
import { useDirectorMembershipStore } from '../stores/directorMembershipStore';
import { useSessionStore } from '../stores/sessionStore';
import { withDisplayShotNumbers } from '../utils/displayShotNumbers';
import { DISCIPLINE_LABELS, calculateSeriesScores } from '../utils/scoreUtils';

import { ModeIndicator } from './ModeIndicator';
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
  const nullifiedExtras = useSessionStore((s) => s.nullifiedExtras);
  const targetResetError = useSessionStore((s) => s.targetResetError);
  const recordingError = useSessionStore((s) => s.recordingError);
  const nullificationMessage = useSessionStore((s) => s.nullificationMessage);
  const preparationShotNumberResetIndices = useSessionStore((s) => s.preparationShotNumberResetIndices);
  const totalScore = useSessionStore((s) => s.totalScore);
  const seriesScores = useSessionStore((s) => s.seriesScores);
  const phase = useCompetitionStore((s) => s.phase);
  const athleteTargetControl = useCompetitionStore((s) => s.athleteTargetControl);
  const athleteTargetControlLoaded = useCompetitionStore((s) => s.athleteTargetControlLoaded);
  const athleteTargetControlPending = useCompetitionStore((s) => s.athleteTargetControlPending);
  const scored = useCompetitionStore((s) => s.scored);
  const scoreMode = scored ? 'MATCH' : mode;
  const membership = useDirectorMembershipStore();
  const targetModeContext = { phase, athleteTargetControl, athleteTargetControlLoaded, athleteTargetControlPending };
  const targetModeReason =
    (athleteTargetControl || (phase === 'ACTIVE' && !athleteTargetControlLoaded)) &&
    (localProgressControls(membership, 'sighting', targetModeContext).reason ??
      localProgressControls(membership, 'match', targetModeContext).reason);
  const shotsPerSeries = useCompetitionStore((s) => s.shotsPerSeries);
  const acc = useCompetitionStore((s) => s.acc);

  const displayShots = useMemo(
    () => withDisplayShotNumbers(shots, { preparationResetIndices: preparationShotNumberResetIndices }),
    [shots, preparationShotNumberResetIndices],
  );
  const recentShots = useMemo(() => displayShots.slice(-10).reverse(), [displayShots]);

  const scoringShots = useMemo(
    () => (scoreMode === 'SIGHTING' ? shots : shots.filter((shot) => shot.isRecorded)),
    [scoreMode, shots],
  );

  const displayTotalScore = useMemo(
    () =>
      scoreMode === 'MATCH' && seriesScores.length > 0
        ? totalScore
        : scoringShots.reduce((sum, shot) => sum + shot.score, 0),
    [scoreMode, seriesScores, totalScore, scoringShots],
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
    () => (scoreMode === 'MATCH' && seriesScores.length > 0 ? seriesScores : calculatedSeriesScores),
    [scoreMode, seriesScores, calculatedSeriesScores],
  );

  return (
    <aside
      className={`flex w-[448px] flex-col border-r border-zinc-500 bg-zinc-700 text-zinc-300 ${className}`.trim()}
      role="complementary"
      aria-label="Side Panel"
    >
      {/* Session details */}
      <div className="flex-shrink-0">
        {/* Discipline name */}
        <div className="flex h-14 items-center justify-center border-b border-zinc-500 px-2">
          <span className="truncate text-center text-4xl font-semibold">
            {discipline ? DISCIPLINE_LABELS[discipline] : 'No Discipline'}
          </span>
        </div>

        {/* Lane number | Mode */}
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

        {phase === 'ACTIVE' && athleteTargetControl && (
          <ModeIndicator mode={athleteTargetControl.effective} className="justify-center" />
        )}

        {phase === 'ACTIVE' && targetModeReason && (
          <p role="note" className="px-3 pb-2 text-sm">
            {targetModeReason}
          </p>
        )}

        {/* Total score */}
        {recordingError && (
          <p role="alert" className="px-3 py-2 text-red-300">
            {recordingError}
          </p>
        )}
        {targetResetError && (
          <p role="alert" className="px-3 py-2 text-red-300">
            {targetResetError}
          </p>
        )}
        {nullificationMessage && (
          <p role="status" className="px-3 py-2 text-sm">
            {nullificationMessage}
          </p>
        )}
        <div className="flex h-16 flex-col items-center justify-center border-b border-zinc-500 px-2">
          <span className="text-5xl font-bold text-zinc-300">
            {acc === 'RING' ? String(Math.floor(displayTotalScore / 10)) : (displayTotalScore / 10).toFixed(1)}
          </span>
        </div>

        {/* Timer (competition active only) */}
        {phase !== 'IDLE' && <TimerDisplay />}
      </div>

      {/* Last 10 shots */}
      <ShotHistory shots={recentShots} nullifiedExtras={nullifiedExtras} acc={acc} />

      {/* Series totals */}
      <div className="flex-shrink-0">
        {/* Series scores */}
        <SeriesScoreGrid scores={displaySeriesScores} acc={acc} />

        {/* Average score */}
        <div className="flex h-16 flex-col items-center justify-center px-2">
          <span className="text-4xl font-bold text-zinc-100">~ {(averageScore / 10).toFixed(2)}</span>
        </div>
      </div>
    </aside>
  );
};
