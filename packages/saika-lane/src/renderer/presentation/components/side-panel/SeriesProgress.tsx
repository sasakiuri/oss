// SPDX-License-Identifier: MIT
/** Shows the current series outside the IDLE phase. */

import React from 'react';

import { useCompetitionStore } from '../../stores/competitionStore';

export const SeriesProgress: React.FC = () => {
  const phase = useCompetitionStore((s) => s.phase);
  const seriesIndex = useCompetitionStore((s) => s.seriesIndex);

  if (phase === 'IDLE') return null;

  return (
    <div className="flex items-center justify-center border-b border-zinc-500 px-2 py-2">
      <span className="text-3xl font-medium text-zinc-300">Series {seriesIndex + 1}</span>
    </div>
  );
};
