import { memo } from 'react';
import type { LanePhase } from '@/shared/constants/competition';

interface PhaseIndicatorProps {
  phase: LanePhase;
}

const phaseConfig: Record<LanePhase, { label: string; color: string }> = {
  IDLE: { label: 'IDLE', color: 'text-vscode-text-muted' },
  ACTIVE: { label: 'ACTIVE', color: 'text-vscode-success' },
  SHOT_COMPLETE: { label: 'SHOT', color: 'text-vscode-warning' },
  SERIES_COMPLETE: { label: 'COMPLETE', color: 'text-vscode-accent' },
  STAGE_ENTERED: { label: 'READY', color: 'text-vscode-warning' },
  SHOOTOFF: { label: 'SHOOTOFF', color: 'text-vscode-error' },
  FINISHED: { label: 'FINISHED', color: 'text-vscode-accent' },
};

export const PhaseIndicator = memo(function PhaseIndicator({ phase }: PhaseIndicatorProps) {
  const config = phaseConfig[phase];

  return <span className={`text-base font-medium uppercase ${config.color}`}>{config.label}</span>;
});
