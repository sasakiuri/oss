import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import { clearanceLaneLabel, type FirearmCondition, type LaneClearanceDraft } from './safetyStopRules';

/** The physical verification of one stopped Lane: selection, firearm condition, athlete and personnel checks. */
export function LaneClearanceCard({
  lane,
  draft,
  onChange,
}: {
  lane: DirectorLaneSnapshotDto;
  draft: LaneClearanceDraft;
  onChange: (patch: Partial<LaneClearanceDraft>) => void;
}) {
  const label = clearanceLaneLabel(lane);
  const athlete = lane.assignment?.athlete ?? null;
  return (
    <div className="space-y-2 border border-vscode-border bg-vscode-bg p-3">
      <label className="flex items-start gap-2 text-[13px] font-semibold text-vscode-text">
        <input
          type="checkbox"
          aria-label={`Select safety clearance for ${label}`}
          checked={draft.selected}
          onChange={(event) => onChange({ selected: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-vscode-primary"
        />
        {label} · {athlete?.name ?? 'No assigned athlete'}
      </label>
      <label className="block text-xs text-vscode-text-muted">
        Firearm condition
        <select
          aria-label={`Firearm condition for ${label}`}
          value={draft.firearmCondition}
          onChange={(event) =>
            onChange({
              firearmCondition: event.target.value as FirearmCondition,
            })
          }
          className="mt-1 min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 text-[13px] text-vscode-text"
        >
          <option value="UNLOADED_SAFETY_FLAG_INSERTED">Unloaded · safety flag inserted</option>
          <option value="UNLOADED_ACTION_OPEN">Unloaded · action open</option>
          <option value="NO_FIREARM_PRESENT">No firearm present</option>
        </select>
      </label>
      {athlete ? (
        <div className="space-y-2">
          <label className="block text-xs text-vscode-text-muted">
            Athlete confirmation
            <select
              aria-label={`Athlete confirmation for ${label}`}
              value={draft.athleteConfirmationStatus}
              onChange={(event) =>
                onChange({
                  athleteConfirmationStatus: event.target.value as LaneClearanceDraft['athleteConfirmationStatus'],
                })
              }
              className="mt-1 min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 text-[13px] text-vscode-text"
            >
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed by {athlete.name}</option>
              <option value="NOT_APPLICABLE">Not applicable · reason required</option>
            </select>
          </label>
          {draft.athleteConfirmationStatus === 'NOT_APPLICABLE' && (
            <label className="block text-xs text-vscode-text-muted">
              Athlete confirmation exception
              <input
                aria-label={`Athlete confirmation exception for ${label}`}
                value={draft.athleteNotApplicableReason}
                onChange={(event) =>
                  onChange({
                    athleteNotApplicableReason: event.target.value,
                  })
                }
                maxLength={500}
                className="mt-1 min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 text-[13px] text-vscode-text"
              />
            </label>
          )}
          <p className="text-[11px] text-vscode-dimmed">
            Athlete confirmation applies when leaving the firing point or after firing is complete (ISSF 6.2.2.4). The
            assigned athlete snapshot is retained in either case.
          </p>
        </div>
      ) : (
        <p className="text-xs text-vscode-text-muted">
          Athlete confirmation is not applicable because no athlete is assigned.
        </p>
      )}
      <label className="flex items-start gap-2 text-xs text-vscode-text">
        <input
          type="checkbox"
          aria-label={`Personnel clear for ${label}`}
          checked={draft.personnelClear}
          onChange={(event) => onChange({ personnelClear: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-vscode-primary"
        />
        Personnel position and the area forward of this firing point are controlled and clear.
      </label>
      <label className="block text-xs text-vscode-text-muted">
        Verification note (optional)
        <input
          aria-label={`Verification note for ${label}`}
          value={draft.verificationNote}
          onChange={(event) => onChange({ verificationNote: event.target.value })}
          maxLength={1000}
          className="mt-1 min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 text-[13px] text-vscode-text"
        />
      </label>
    </div>
  );
}
