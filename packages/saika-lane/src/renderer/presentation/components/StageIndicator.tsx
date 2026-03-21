// SPDX-License-Identifier: MIT
/**
 * StageIndicator — Stage display badge
 *
 * Displays a label based on the current phase and stage type.
 * Hidden when in IDLE phase.
 */

import React from 'react';

import { useCompetitionStore } from '../stores/competitionStore';

export const StageIndicator: React.FC = () => {
  const phase = useCompetitionStore((s) => s.phase);
  const scored = useCompetitionStore((s) => s.scored);

  if (phase === 'IDLE') return null;

  let label: string;
  let colorClass: string;

  switch (phase) {
    case 'ACTIVE':
      if (!scored) {
        label = 'Preparation';
        colorClass = 'text-blue-400';
      } else {
        label = 'Match';
        colorClass = 'text-red-400';
      }
      break;
    case 'SERIES_COMPLETE':
      label = 'Series Complete';
      colorClass = 'text-yellow-400';
      break;
    case 'SERIES_ENTERED':
      label = 'Next Series';
      colorClass = 'text-green-400';
      break;
    case 'STAGE_ENTERED':
      label = 'Next Stage';
      colorClass = 'text-green-400';
      break;
    case 'FINISHED':
      label = 'Finished';
      colorClass = 'text-gray-400';
      break;
    default:
      return null;
  }

  return <span className={`text-4xl font-medium ${colorClass}`}>{label}</span>;
};
