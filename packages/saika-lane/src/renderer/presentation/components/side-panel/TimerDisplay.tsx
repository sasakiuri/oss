// SPDX-License-Identifier: MIT
/**
 * TimerDisplay — Timer countdown display
 *
 * Shown when the competition phase is not IDLE.
 * Color changes based on remaining time (blue → yellow → red).
 */

import React from 'react';

import { useCompetitionStore } from '../../stores/competitionStore';
import { formatSeconds } from '../../utils/formatSeconds';

const TIMER_WARNING_SECONDS = 60;
const TIMER_DANGER_SECONDS = 30;

export const TimerDisplay: React.FC = () => {
  const phase = useCompetitionStore((s) => s.phase);
  const remainingSeconds = useCompetitionStore((s) => s.remainingSeconds);
  const totalSeconds = useCompetitionStore((s) => s.totalSeconds);
  const interruption = useCompetitionStore((s) => s.interruption);
  const formattedRemaining = formatSeconds(remainingSeconds);

  if (phase === 'IDLE') return null;

  const progress = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;

  let textColor: string;
  let barColor: string;
  if (remainingSeconds <= TIMER_DANGER_SECONDS) {
    textColor = 'text-red-500';
    barColor = 'bg-red-500';
  } else if (remainingSeconds <= TIMER_WARNING_SECONDS) {
    textColor = 'text-yellow-500';
    barColor = 'bg-yellow-500';
  } else {
    textColor = 'text-blue-400';
    barColor = 'bg-blue-400';
  }

  return (
    <div className="flex flex-col items-center justify-center border-b border-zinc-500 px-2 py-3">
      {interruption && interruption.status !== 'RUNNING_MATCH' && (
        <span
          className={`mb-1 rounded px-3 py-1 text-lg font-bold tracking-widest ${
            interruption.status === 'SIGHTING' ? 'bg-amber-400 text-zinc-950' : 'bg-red-600 text-white'
          }`}
        >
          {interruption.status === 'SIGHTING' ? 'AUTHORIZED SIGHTING' : 'STOP — INTERRUPTED'}
        </span>
      )}
      <span className={`font-mono text-5xl font-bold tabular-nums ${textColor}`}>{formattedRemaining}</span>
      <div className="mt-2 h-2 w-full rounded bg-zinc-600">
        <div className={`h-full rounded transition-all ${barColor}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
};
