// SPDX-License-Identifier: MIT
import { ListChecks, RefreshCw } from 'lucide-react';

import type { CompetitionPhase } from '@sasakiuri/saika-protocol/CompetitionState';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { CreateRunForm } from './CreateRunForm';
import { CurrentStepCard } from './CurrentStepCard';
import { completedStepCount } from './finalOperationRules';
import { ShootOffResolutionCard } from './ShootOffResolutionCard';
import { useFinalOperationRun } from './useFinalOperationRun';

interface FinalOperationPanelProps {
  competitionId: string;
  competitionTypeId: string;
  competitorUnit: 'INDIVIDUAL' | 'MIXED_TEAM';
  phase: CompetitionPhase;
  lanes: readonly DirectorLaneSnapshotDto[];
  eventId?: string;
  disabled?: boolean;
}

export function FinalOperationPanel({
  competitionId,
  competitionTypeId,
  competitorUnit,
  phase,
  lanes,
  eventId,
  disabled = false,
}: FinalOperationPanelProps) {
  const state = useFinalOperationRun({ competitionId, competitionTypeId, competitorUnit, phase, lanes, eventId });
  const { run, loading, saving, error, refreshError } = state;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Final command runner</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Follow the competition commands and record each confirmation. Check the Lane responses before proceeding.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void state.load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <InlineError as="div">{error}</InlineError>}
      {refreshError && <InlineError as="div">{refreshError}</InlineError>}

      {!run && !loading && <CreateRunForm state={state} disabled={disabled} />}

      {run && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vscode-text-muted">
            <span>{run.rulePackId}</span>
            <span>Script {run.scriptVersion}</span>
            {run.scriptSource && (
              <span title={run.scriptSource.title}>
                {run.scriptSource.organization} · {run.scriptSource.version}
              </span>
            )}
            <span>
              {completedStepCount(run)}/{run.steps.length} steps
            </span>
            <span className="font-semibold text-vscode-text">{run.status}</span>
            {run.currentBranch === 'SHOOT_OFF' && run.shootOff && <span>Shoot-off round {run.shootOff.iteration}</span>}
          </div>

          {run.status === 'ABORTED' && (
            <div className="rounded-[3px] border border-vscode-warning p-3">
              <p className="text-xs leading-5 text-vscode-text-muted">
                Abort is already recorded. Retrying this cleanup only removes the presentation cue retained for Lane; it
                does not issue STOP or change the command history.
              </p>
              <Button
                className="mt-2"
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => void state.clearRetainedCue()}
              >
                Clear retained Lane cue
              </Button>
            </div>
          )}

          {run.currentStep && (
            <CurrentStepCard
              run={run}
              current={run.currentStep}
              state={state}
              competitorUnit={competitorUnit}
              lanes={lanes}
              eventId={eventId}
              disabled={disabled}
            />
          )}

          {run.shootOff?.status === 'AWAITING_RESOLUTION' && (
            <ShootOffResolutionCard shootOff={run.shootOff} lanes={lanes} state={state} disabled={disabled} />
          )}

          {!run.currentStep && run.shootOff?.status !== 'AWAITING_RESOLUTION' && (
            <p className="border-l-2 border-vscode-accent pl-3 text-xs text-vscode-text">
              This run is {run.status.toLowerCase()}. Its command and execution audit remains read-only.
            </p>
          )}
        </>
      )}
    </div>
  );
}
