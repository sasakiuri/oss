// SPDX-License-Identifier: MIT
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import { laneLabel } from '../shared/lanes/laneLabels';

interface ExecutionLaneSelectionProps {
  readonly count: number;
  readonly lanes: readonly DirectorLaneSnapshotDto[];
  readonly selectedLaneIds: ReadonlySet<string>;
  readonly onToggle: (laneId: string, selected: boolean) => void;
}

/** The firing Lanes the official selects before confirming an official-selected timed-target step. */
export function ExecutionLaneSelection({ count, lanes, selectedLaneIds, onToggle }: ExecutionLaneSelectionProps) {
  return (
    <div className="mt-4 rounded-[3px] border border-vscode-border p-3">
      <p className="text-xs font-semibold text-vscode-text">
        Select exactly {count} firing {count === 1 ? 'Lane' : 'Lanes'}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-vscode-text-muted">
        Follow the Finals Start Number order stated in the command. The selected set is persisted with the official
        confirmation and used only for this timed-target sequence.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {lanes.map((lane) => (
          <label key={lane.laneId} className="flex items-start gap-2 text-xs text-vscode-text">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selectedLaneIds.has(lane.laneId)}
              onChange={(event) => onToggle(lane.laneId, event.target.checked)}
            />
            <span>
              {laneLabel(lane)}
              {lane.assignment?.athlete?.startNumber
                ? ` · Start ${lane.assignment.athlete.startNumber}`
                : ' · Start number missing'}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
