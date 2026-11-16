// SPDX-License-Identifier: MIT
import type { DirectorLaneSnapshotDto, FinalOperationRunDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { laneLabelById } from '../shared/lanes/laneLabels';

import { isShootOffRoundComplete, shootOffUnitProgress } from './finalOperationRules';
import { TextField } from './TextField';
import type { FinalOperationRunState } from './useFinalOperationRun';

type ResolutionState = Pick<
  FinalOperationRunState,
  'saving' | 'officialName' | 'setOfficialName' | 'statement' | 'setStatement' | 'closeShootOffRound' | 'abortRun'
>;

interface ShootOffResolutionCardProps {
  readonly shootOff: NonNullable<FinalOperationRunDto['shootOff']>;
  readonly lanes: readonly DirectorLaneSnapshotDto[];
  readonly state: ResolutionState;
  readonly disabled: boolean;
}

/** A shoot-off round whose shots are in: each unit's total, then the command that closes the round. */
export function ShootOffResolutionCard({ shootOff, lanes, state, disabled }: ShootOffResolutionCardProps) {
  const { saving, officialName, statement } = state;
  return (
    <div className="rounded-[3px] border border-vscode-border bg-vscode-bg-light p-4">
      <p className="text-xs font-semibold text-vscode-text">Resolve shoot-off round {shootOff.iteration}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {shootOff.units.map((unit) => {
          const progress = shootOffUnitProgress(shootOff, unit);
          return (
            <div key={unit.unitId} className="rounded-[3px] border border-vscode-border px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-vscode-text">{unit.label}</span>
                <span className={progress.complete ? 'font-semibold text-vscode-text' : 'text-vscode-warning'}>
                  {progress.complete ? `${(progress.totalX10 / 10).toFixed(1)} total` : 'Waiting for shot(s)'}
                </span>
              </div>
              <div className="mt-1 space-y-0.5 text-[11px] text-vscode-text-muted">
                {progress.lanes.map(({ laneId, shots }) => (
                  <div key={laneId}>
                    {laneLabelById(lanes, laneId)} ·{' '}
                    {shots.length > 0 ? shots.map((shot) => (shot.scoreX10 / 10).toFixed(1)).join(', ') : 'waiting'} (
                    {shots.length}/{shootOff.shotsPerLane})
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <TextField label="Official name" value={officialName} onChange={state.setOfficialName} />
        <TextField label="Resolution note" value={statement} onChange={state.setStatement} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={
            disabled || saving || !isShootOffRoundComplete(shootOff) || !statement.trim() || !officialName.trim()
          }
          onClick={() => void state.closeShootOffRound()}
        >
          Calculate and return to checkpoint
        </Button>
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
