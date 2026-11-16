// SPDX-License-Identifier: MIT
import { Clock3 } from 'lucide-react';

import type { DirectorLaneSnapshotDto, FinalOperationRunDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { ExecutionLaneSelection } from './ExecutionLaneSelection';
import { canSkipStep, isAtMainCheckpoint, requiredExecutionLaneCount } from './finalOperationRules';
import { ShootOffBranchSelection } from './ShootOffBranchSelection';
import { TextField } from './TextField';
import type { FinalOperationRunState } from './useFinalOperationRun';

type CurrentStepState = Pick<
  FinalOperationRunState,
  | 'saving'
  | 'officialName'
  | 'setOfficialName'
  | 'statement'
  | 'setStatement'
  | 'finalProtestsResolved'
  | 'setFinalProtestsResolved'
  | 'resultProcessConfirmed'
  | 'setResultProcessConfirmed'
  | 'shootOffCandidates'
  | 'selectedExecutionLaneIds'
  | 'toggleExecutionLane'
  | 'shootOffUnitOptions'
  | 'selectedShootOffUnitIds'
  | 'toggleShootOffUnit'
  | 'selectedShootOffUnits'
  | 'latestShootOffOutcome'
  | 'executeCurrentStep'
  | 'skipCurrentStep'
  | 'abortRun'
  | 'startShootOff'
>;

interface CurrentStepCardProps {
  readonly run: FinalOperationRunDto;
  readonly current: FinalOperationRunDto['steps'][number];
  readonly state: CurrentStepState;
  readonly competitorUnit: 'INDIVIDUAL' | 'MIXED_TEAM';
  readonly lanes: readonly DirectorLaneSnapshotDto[];
  readonly eventId?: string;
  readonly disabled: boolean;
}

/** The step the run waits on, with its confirmation entries and commands. */
export function CurrentStepCard({
  run,
  current,
  state,
  competitorUnit,
  lanes,
  eventId,
  disabled,
}: CurrentStepCardProps) {
  const { saving, officialName, statement } = state;
  const canSkip = canSkipStep(current);
  const isDeclaration = current.step.effect.type === 'DECLARE_RESULTS';
  const declarationReady =
    !isDeclaration || (Boolean(eventId) && state.finalProtestsResolved && state.resultProcessConfirmed);
  const selectedExecutionCount = requiredExecutionLaneCount(current.step);
  const executionSelectionReady =
    selectedExecutionCount === undefined ||
    current.status === 'AWAITING_EXECUTION' ||
    state.selectedExecutionLaneIds.size === selectedExecutionCount;

  return (
    <div className="rounded-[3px] border border-vscode-border bg-vscode-bg-light p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-vscode-text-muted">
            {current.step.actor} · {current.step.kind} · {current.status.replaceAll('_', ' ')}
          </p>
          <p className="mt-2 text-xl font-bold text-vscode-text">{current.step.text}</p>
          <p className="mt-1 text-xs text-vscode-text-muted">ISSF {current.step.ruleReference}</p>
        </div>
        {current.scheduledFor && (
          <div className="flex items-center gap-1 text-xs text-vscode-text-muted">
            <Clock3 size={13} aria-hidden="true" /> {new Date(current.scheduledFor).toLocaleString()}
          </div>
        )}
      </div>

      {current.executionAttempts.length > 0 && (
        <p className="mt-3 text-xs text-vscode-warning">
          Previous attempt: {current.executionAttempts.at(-1)?.status} · retry uses the same confirmation.
        </p>
      )}

      {selectedExecutionCount !== undefined && current.status === 'AWAITING_CONFIRMATION' && (
        <ExecutionLaneSelection
          count={selectedExecutionCount}
          lanes={state.shootOffCandidates}
          selectedLaneIds={state.selectedExecutionLaneIds}
          onToggle={state.toggleExecutionLane}
        />
      )}

      {isAtMainCheckpoint(run) && (
        <ShootOffBranchSelection
          competitorUnit={competitorUnit}
          options={state.shootOffUnitOptions}
          selectedUnitIds={state.selectedShootOffUnitIds}
          onToggle={state.toggleShootOffUnit}
          selectedCount={state.selectedShootOffUnits.length}
          outcome={state.latestShootOffOutcome}
          lanes={lanes}
          startDisabled={
            disabled || saving || state.selectedShootOffUnits.length < 2 || !officialName.trim() || !statement.trim()
          }
          onStart={() => void state.startShootOff()}
        />
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TextField label="Official name" value={officialName} onChange={state.setOfficialName} />
        <TextField label="Confirmation / exception note" value={statement} onChange={state.setStatement} />
      </div>
      {isDeclaration && (
        <div className="mt-3 space-y-2 rounded-[3px] border border-vscode-border p-3 text-xs">
          {!eventId && (
            <p className="text-vscode-warning">Link this Final run to an event before declaring RESULTS ARE FINAL.</p>
          )}
          <label className="flex items-start gap-2 text-vscode-text">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={state.finalProtestsResolved}
              onChange={(event) => state.setFinalProtestsResolved(event.target.checked)}
            />
            All immediate Final protests and ties are resolved, as confirmed with the Control Room.
          </label>
          <label className="flex items-start gap-2 text-vscode-text">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={state.resultProcessConfirmed}
              onChange={(event) => state.setResultProcessConfirmed(event.target.checked)}
            />
            The current RTS result list, ranks, displayed identities, and approval are confirmed.
          </label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={disabled || saving || !officialName.trim() || !declarationReady || !executionSelectionReady}
          onClick={() => void state.executeCurrentStep()}
        >
          {current.status === 'AWAITING_EXECUTION' ? 'Retry execution' : 'Confirm and execute'}
        </Button>
        {canSkip && (
          <Button
            variant="secondary"
            disabled={saving || !officialName.trim() || !statement.trim()}
            onClick={() => void state.skipCurrentStep()}
          >
            Skip with reason
          </Button>
        )}
        <Button
          variant="danger"
          disabled={saving || !officialName.trim() || !statement.trim()}
          onClick={() => void state.abortRun()}
        >
          Abort run
        </Button>
      </div>
    </div>
  );
}
