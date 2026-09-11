// SPDX-License-Identifier: MIT
/** Controls zoom, competition progress, official requests, printing, and settings. */

import { Printer, Settings, TableProperties, Target, ZoomIn } from 'lucide-react';
import React from 'react';

import { useCompetitionStore } from '../stores/competitionStore';

import { RangeOfficerMenu } from './RangeOfficerMenu';
import { SideMenuButton } from './SideMenuButton';

export interface SideMenuProps {
  /** Zoom button click callback */
  onZoomClick: () => void;
  /** Preparation button click callback */
  onPreparationClick: () => void;
  /** Match button click callback */
  onMatchClick: () => void;
  /** Next Stage button click callback */
  onNextStageClick: () => void;
  /** Settings button click callback */
  onSettingsClick: () => void;
  /** Print button click callback */
  onPrintClick?: () => void;
  /** Optional CSS class name */
  className?: string;
}

function getNextStageTooltip(phase: string, scored: boolean): string {
  if (phase === 'ACTIVE' && !scored) return 'End Preparation';
  if (phase === 'SERIES_COMPLETE') return 'Advance';
  return 'Next Stage';
}

export const SideMenu: React.FC<SideMenuProps> = ({
  onZoomClick,
  onPreparationClick,
  onMatchClick,
  onNextStageClick,
  onSettingsClick,
  onPrintClick,
  className = '',
}) => {
  const phase = useCompetitionStore((s) => s.phase);
  const scored = useCompetitionStore((s) => s.scored);
  const competitionId = useCompetitionStore((s) => s.competitionId);

  const hasCompetition = competitionId !== null;

  // Derive disabled states
  let preparationDisabled: boolean;
  let matchDisabled: boolean;
  let nextStageDisabled: boolean;

  if (!hasCompetition) {
    // Legacy mode: Preparation/Match always enabled, Next Stage always disabled
    preparationDisabled = false;
    matchDisabled = false;
    nextStageDisabled = true;
  } else if (phase === 'IDLE') {
    preparationDisabled = false;
    matchDisabled = true;
    nextStageDisabled = true;
  } else if (phase === 'ACTIVE' && !scored) {
    preparationDisabled = false;
    matchDisabled = false;
    nextStageDisabled = false;
  } else if (phase === 'ACTIVE' && scored) {
    preparationDisabled = false;
    matchDisabled = true;
    nextStageDisabled = true;
  } else if (phase === 'SERIES_COMPLETE') {
    preparationDisabled = false;
    matchDisabled = false;
    nextStageDisabled = false;
  } else if (phase === 'SERIES_ENTERED') {
    preparationDisabled = false;
    matchDisabled = false;
    nextStageDisabled = true;
  } else if (phase === 'STAGE_ENTERED') {
    preparationDisabled = false;
    matchDisabled = false;
    nextStageDisabled = true;
  } else {
    // FINISHED
    preparationDisabled = true;
    matchDisabled = true;
    nextStageDisabled = true;
  }

  // Derive active states from phase + scored
  const preparationActive = hasCompetition && phase === 'ACTIVE' && !scored;
  const matchActive = hasCompetition && phase === 'ACTIVE' && scored;

  return (
    <aside
      className={`flex w-20 shrink-0 flex-col border-r border-zinc-700 bg-zinc-800 ${className}`.trim()}
      role="navigation"
      aria-label="Side Menu"
    >
      {/* Top section - Main actions */}
      <div className="flex min-h-0 flex-col">
        <SideMenuButton icon={<ZoomIn size={30} />} label="Zoom" onClick={onZoomClick} />
        <SideMenuButton
          icon={<Target size={30} />}
          label="Preparation"
          onClick={onPreparationClick}
          disabled={preparationDisabled}
          active={preparationActive}
          activeColor="#029863"
        />
        <SideMenuButton
          icon={<Target size={30} />}
          label="Match"
          onClick={onMatchClick}
          disabled={matchDisabled}
          active={matchActive}
          activeColor="#E54437"
        />
        <SideMenuButton
          icon={<TableProperties size={30} />}
          label={getNextStageTooltip(phase, scored)}
          onClick={onNextStageClick}
          disabled={nextStageDisabled}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom section - Official requests, printing and settings */}
      <div className="flex min-h-0 flex-col">
        <RangeOfficerMenu />
        <SideMenuButton icon={<Printer size={30} />} label="Print" onClick={onPrintClick} disabled={!onPrintClick} />
        <SideMenuButton icon={<Settings size={30} />} label="Settings" onClick={onSettingsClick} />
      </div>
    </aside>
  );
};
