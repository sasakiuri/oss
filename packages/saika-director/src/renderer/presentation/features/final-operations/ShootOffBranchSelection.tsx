// SPDX-License-Identifier: MIT
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { shootOffOutcomeUnitLabel, type ShootOffOutcome } from './finalOperationOutcome';
import type { ShootOffUnitOption } from './finalOperationRules';

interface ShootOffBranchSelectionProps {
  readonly competitorUnit: 'INDIVIDUAL' | 'MIXED_TEAM';
  readonly options: readonly ShootOffUnitOption[];
  readonly selectedUnitIds: ReadonlySet<string>;
  readonly onToggle: (unitId: string, selected: boolean) => void;
  readonly selectedCount: number;
  /** The previous round's outcome, described below the options. */
  readonly outcome: ShootOffOutcome | null;
  readonly lanes: readonly DirectorLaneSnapshotDto[];
  readonly startDisabled: boolean;
  readonly onStart: () => void;
}

/** At a main-branch checkpoint: the tied Finalists or Teams that enter a shoot-off. */
export function ShootOffBranchSelection({
  competitorUnit,
  options,
  selectedUnitIds,
  onToggle,
  selectedCount,
  outcome,
  lanes,
  startDisabled,
  onStart,
}: ShootOffBranchSelectionProps) {
  const unitNoun = competitorUnit === 'MIXED_TEAM' ? 'Teams' : 'Finalists';
  return (
    <div className="mt-4 rounded-[3px] border border-vscode-border p-3">
      <p className="text-xs font-semibold text-vscode-text">Shoot-off branch (only when the low score is tied)</p>
      <p className="mt-1 text-[11px] leading-5 text-vscode-text-muted">
        Select only the tied {unitNoun}. Shoot-off shots are kept outside the normal MATCH score and attached to this
        checkpoint.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((unit) => (
          <label key={unit.unitId} className="flex items-start gap-2 text-xs text-vscode-text">
            <input
              type="checkbox"
              className="mt-0.5"
              disabled={Boolean(unit.issue)}
              checked={selectedUnitIds.has(unit.unitId)}
              onChange={(event) => onToggle(unit.unitId, event.target.checked)}
            />
            <span>
              {unit.label}
              {unit.issue && <span className="block text-vscode-warning">{unit.issue}</span>}
            </span>
          </label>
        ))}
      </div>
      {outcome && (
        <p className="mt-2 text-[11px] text-vscode-text-muted">
          {outcome.eliminatedUnitId
            ? `Previous round resolved: ${shootOffOutcomeUnitLabel(outcome, outcome.eliminatedUnitId, lanes)} had the unique lowest aggregate.`
            : `Tie remains between ${outcome.remainingTiedUnitIds.map((unitId) => shootOffOutcomeUnitLabel(outcome, unitId, lanes)).join(', ')}.`}
        </p>
      )}
      <Button className="mt-3" variant="secondary" disabled={startDisabled} onClick={onStart}>
        Start shoot-off branch ({selectedCount} {unitNoun})
      </Button>
    </div>
  );
}
