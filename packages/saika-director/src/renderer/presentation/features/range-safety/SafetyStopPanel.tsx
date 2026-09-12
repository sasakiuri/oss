import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertOctagon, CheckCircle2, LoaderCircle, RotateCcw } from 'lucide-react';

import { mqttService } from '@/renderer/services';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import type { DirectorLaneSnapshotDto, SafetyStopAuditEntryDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { Card } from '../shared/common/Card';

interface SafetyStopPanelProps {
  connected: boolean;
  lanes: readonly DirectorLaneSnapshotDto[];
  targetLaneIds: readonly string[];
}

type FirearmCondition = SafetyStopAuditEntryDto['laneClearances'][number]['firearmCondition'];

interface LaneClearanceDraft {
  selected: boolean;
  athleteConfirmationStatus: 'PENDING' | 'CONFIRMED' | 'NOT_APPLICABLE';
  athleteNotApplicableReason: string;
  personnelClear: boolean;
  firearmCondition: FirearmCondition;
  verificationNote: string;
}

const DEFAULT_CLEARANCE_DRAFT: LaneClearanceDraft = {
  selected: false,
  athleteConfirmationStatus: 'PENDING',
  athleteNotApplicableReason: '',
  personnelClear: false,
  firearmCondition: 'UNLOADED_SAFETY_FLAG_INSERTED',
  verificationNote: '',
};

/**
 * Competition-independent range safety control.
 * Clearing the latch never resumes a timer; restart remains a separate workflow.
 */
export function SafetyStopPanel({ connected, lanes, targetLaneIds }: SafetyStopPanelProps) {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [reason, setReason] = useState('Emergency range safety stop');
  const [officialName, setOfficialName] = useState('Director');
  const [clearanceReason, setClearanceReason] = useState('Range inspected and declared safe');
  const [clearanceDrafts, setClearanceDrafts] = useState<Record<string, LaneClearanceDraft>>({});
  const [busy, setBusy] = useState<'stop' | 'clear' | null>(null);
  const [audit, setAudit] = useState<SafetyStopAuditEntryDto[]>([]);

  const targetLaneSet = useMemo(() => new Set(targetLaneIds), [targetLaneIds]);
  const targetLanes = useMemo(() => lanes.filter((lane) => targetLaneSet.has(lane.laneId)), [lanes, targetLaneSet]);
  const stoppedGroups = useMemo(() => {
    const groups = new Map<string, DirectorLaneSnapshotDto[]>();
    for (const lane of targetLanes) {
      const state = lane.safetyState;
      if (state?.status !== 'STOPPED' || !state.safetyStopId) continue;
      const group = groups.get(state.safetyStopId) ?? [];
      group.push(lane);
      groups.set(state.safetyStopId, group);
    }
    return [...groups.entries()];
  }, [targetLanes]);

  const refreshAudit = useCallback(async () => {
    try {
      const response = await mqttService.getSafetyStopAudit({});
      if (response.success) setAudit(response.data);
    } catch {
      // Audit availability must not disable the emergency control surface.
    }
  }, []);

  useEffect(() => {
    void refreshAudit();
  }, [refreshAudit]);

  const activate = useCallback(async () => {
    const normalizedReason = reason.trim();
    const normalizedOfficial = officialName.trim();
    if (!normalizedReason || !normalizedOfficial) {
      addNotification('error', 'Safety STOP requires a reason and responsible official');
      return;
    }

    const existingId = stoppedGroups[0]?.[0];
    const safetyStopId = existingId ?? crypto.randomUUID();
    const laneIds = targetLanes.filter((lane) => lane.safetyState?.status !== 'STOPPED').map((lane) => lane.laneId);
    if (laneIds.length === 0) return;

    setBusy('stop');
    try {
      const response = await mqttService.activateSafetyStop({
        safetyStopId,
        laneIds,
        reason: normalizedReason,
        officialName: normalizedOfficial,
      });
      if (!response.success) {
        addNotification('error', response.error.message);
        return;
      }
      const completed = response.data.commands.filter((command) => command.success).length;
      addNotification(
        response.data.success ? 'success' : 'error',
        `Safety STOP acknowledged by ${completed}/${laneIds.length} Lane(s)`,
      );
      await refreshAudit();
    } catch (caught) {
      addNotification('error', caught instanceof Error ? caught.message : 'Failed to issue the safety STOP');
    } finally {
      setBusy(null);
    }
  }, [addNotification, officialName, reason, refreshAudit, stoppedGroups, targetLanes]);

  const updateClearanceDraft = useCallback((laneId: string, patch: Partial<LaneClearanceDraft>) => {
    setClearanceDrafts((current) => ({
      ...current,
      [laneId]: { ...DEFAULT_CLEARANCE_DRAFT, ...current[laneId], ...patch },
    }));
  }, []);

  const clear = useCallback(
    async (safetyStopId: string, group: readonly DirectorLaneSnapshotDto[]) => {
      const normalizedReason = clearanceReason.trim();
      const normalizedOfficial = officialName.trim();
      const verifiedLanes = group.filter((lane) => laneClearanceReady(lane, clearanceDrafts[lane.laneId]));
      if (verifiedLanes.length === 0 || !normalizedReason || !normalizedOfficial) return;

      setBusy('clear');
      try {
        const response = await mqttService.clearSafetyStop({
          safetyStopId,
          clearanceReason: normalizedReason,
          officialName: normalizedOfficial,
          laneClearances: verifiedLanes.map((lane) => {
            const draft = clearanceDrafts[lane.laneId]!;
            const athlete = lane.assignment?.athlete ?? null;
            return {
              laneId: lane.laneId,
              participantId: athlete?.id ?? null,
              participantName: athlete?.name ?? null,
              athleteConfirmation: athlete
                ? draft.athleteConfirmationStatus === 'CONFIRMED'
                  ? { status: 'CONFIRMED' as const, confirmedBy: athlete.name }
                  : {
                      status: 'NOT_APPLICABLE' as const,
                      reason: draft.athleteNotApplicableReason.trim(),
                    }
                : { status: 'NOT_APPLICABLE' as const, reason: 'No athlete assigned at verification' },
              firearmCondition: draft.firearmCondition,
              personnelClear: true as const,
              verifiedBy: normalizedOfficial,
              ...(draft.verificationNote.trim() ? { verificationNote: draft.verificationNote.trim() } : {}),
            };
          }),
        });
        if (!response.success) {
          addNotification('error', response.error.message);
          return;
        }
        const completed = response.data.commands.filter((command) => command.success).length;
        addNotification(
          response.data.success ? 'success' : 'error',
          `Safety latch cleared on ${completed}/${verifiedLanes.length} verified Lane(s); competition timers remain stopped`,
        );
        if (response.data.success) {
          setClearanceDrafts((current) => {
            const next = { ...current };
            for (const lane of verifiedLanes) delete next[lane.laneId];
            return next;
          });
        }
        await refreshAudit();
      } catch (caught) {
        addNotification('error', caught instanceof Error ? caught.message : 'Failed to clear the safety latch');
      } finally {
        setBusy(null);
      }
    },
    [addNotification, clearanceDrafts, clearanceReason, officialName, refreshAudit],
  );

  const pendingStopCount = targetLanes.filter((lane) => lane.safetyState?.status !== 'STOPPED').length;

  return (
    <Card className={stoppedGroups.length > 0 ? 'border-red-500 bg-red-950/20' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <AlertOctagon size={18} className="text-red-400" aria-hidden="true" />
            Range safety STOP
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-vscode-text-muted">
            Stops all discovered Lanes. Timers pause and further shots are excluded until safety clearance.
          </p>
        </div>
        <Button
          variant="danger"
          size="lg"
          className="border-red-400 bg-red-700 font-semibold text-white hover:bg-red-600"
          disabled={!connected || busy !== null || pendingStopCount === 0 || targetLanes.length === 0}
          onClick={() => void activate()}
        >
          {busy === 'stop' ? <LoaderCircle size={18} className="animate-spin" /> : <AlertOctagon size={18} />}
          {targetLanes.length === 0
            ? 'EMERGENCY STOP'
            : pendingStopCount === 0
              ? 'SAFETY STOP ACTIVE'
              : `EMERGENCY STOP · ${pendingStopCount} LANE(S)`}
        </Button>
      </div>

      <div className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-[minmax(10rem,1fr)_2fr]">
        <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
          Responsible official
          <input
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 text-[13px] text-vscode-text"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
          STOP reason
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 text-[13px] text-vscode-text"
          />
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {targetLanes.length === 0 ? (
          <span className="text-vscode-text-muted">No target Lanes are available.</span>
        ) : (
          targetLanes.map((lane) => (
            <span
              key={lane.laneId}
              className={`py-1 ${
                lane.safetyState?.status === 'STOPPED' ? 'font-semibold text-red-200' : 'text-vscode-text-muted'
              }`}
            >
              {lane.firingPointNumber ?? (lane.laneAlias || lane.laneId.slice(0, 8))} ·{' '}
              {lane.safetyState?.status ?? 'UNKNOWN'}
            </span>
          ))
        )}
      </div>

      {stoppedGroups.length > 0 && (
        <div className="mt-5 border-t border-red-500/40 pt-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-red-200">
            <CheckCircle2 size={16} aria-hidden="true" /> Explicit safety clearance
          </h4>
          <p className="mt-1 text-xs leading-5 text-red-100/80">
            Verify each firing point independently. Clearing only removes the selected Lane safety latch and shot
            quarantine; it does not restart a timer or authorize firing. A separate START or READY command is required
            by ISSF 6.2.3.6.
          </p>
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
            Clearance statement
            <input
              value={clearanceReason}
              onChange={(event) => setClearanceReason(event.target.value)}
              className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 text-[13px] text-vscode-text"
            />
          </label>
          <div className="mt-3 space-y-4">
            {stoppedGroups.map(([safetyStopId, group]) => {
              const verifiedCount = group.filter((lane) =>
                laneClearanceReady(lane, clearanceDrafts[lane.laneId]),
              ).length;
              return (
                <section key={safetyStopId} className="space-y-3 rounded border border-red-500/40 p-3">
                  <div className="text-xs font-semibold text-red-100">STOP {safetyStopId.slice(0, 8)}</div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {group.map((lane) => {
                      const draft = clearanceDrafts[lane.laneId] ?? DEFAULT_CLEARANCE_DRAFT;
                      const label = firingPointLabel(lane);
                      const athlete = lane.assignment?.athlete ?? null;
                      return (
                        <div key={lane.laneId} className="space-y-2 border border-vscode-border bg-vscode-bg p-3">
                          <label className="flex items-start gap-2 text-[13px] font-semibold text-vscode-text">
                            <input
                              type="checkbox"
                              aria-label={`Select safety clearance for ${label}`}
                              checked={draft.selected}
                              onChange={(event) =>
                                updateClearanceDraft(lane.laneId, { selected: event.target.checked })
                              }
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
                                updateClearanceDraft(lane.laneId, {
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
                                    updateClearanceDraft(lane.laneId, {
                                      athleteConfirmationStatus: event.target
                                        .value as LaneClearanceDraft['athleteConfirmationStatus'],
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
                                      updateClearanceDraft(lane.laneId, {
                                        athleteNotApplicableReason: event.target.value,
                                      })
                                    }
                                    maxLength={500}
                                    className="mt-1 min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 text-[13px] text-vscode-text"
                                  />
                                </label>
                              )}
                              <p className="text-[11px] text-vscode-dimmed">
                                Athlete confirmation applies when leaving the firing point or after firing is complete
                                (ISSF 6.2.2.4). The assigned athlete snapshot is retained in either case.
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
                              onChange={(event) =>
                                updateClearanceDraft(lane.laneId, { personnelClear: event.target.checked })
                              }
                              className="mt-0.5 h-4 w-4 accent-vscode-primary"
                            />
                            Personnel position and the area forward of this firing point are controlled and clear.
                          </label>
                          <label className="block text-xs text-vscode-text-muted">
                            Verification note (optional)
                            <input
                              aria-label={`Verification note for ${label}`}
                              value={draft.verificationNote}
                              onChange={(event) =>
                                updateClearanceDraft(lane.laneId, { verificationNote: event.target.value })
                              }
                              maxLength={1000}
                              className="mt-1 min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 text-[13px] text-vscode-text"
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    variant="secondary"
                    disabled={verifiedCount === 0 || busy !== null || !clearanceReason.trim() || !officialName.trim()}
                    onClick={() => void clear(safetyStopId, group)}
                  >
                    {busy === 'clear' ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                    Clear {verifiedCount} verified Lane(s) · {safetyStopId.slice(0, 8)}
                  </Button>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {audit.length > 0 && (
        <details className="mt-4 border-t border-vscode-border pt-3 text-xs">
          <summary className="cursor-pointer font-medium text-vscode-text">
            Safety command audit ({audit.length})
          </summary>
          <div className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-vscode-text-muted">
            {audit
              .slice(-10)
              .reverse()
              .map((entry) => (
                <div key={entry.id}>
                  {new Date(entry.occurredAt).toLocaleString()} · {entry.operation} ·{' '}
                  {entry.success ? 'ACK' : 'PARTIAL'} · {entry.safetyStopId.slice(0, 8)} · {entry.officialName}
                  {entry.laneClearances.length > 0 ? ` · ${entry.laneClearances.length} physical verification(s)` : ''}
                </div>
              ))}
          </div>
        </details>
      )}
    </Card>
  );
}

function laneClearanceReady(lane: DirectorLaneSnapshotDto, draft: LaneClearanceDraft | undefined): boolean {
  if (!draft?.selected || !draft.personnelClear) return false;
  if (!lane.assignment?.athlete) return true;
  return (
    draft.athleteConfirmationStatus === 'CONFIRMED' ||
    (draft.athleteConfirmationStatus === 'NOT_APPLICABLE' && Boolean(draft.athleteNotApplicableReason.trim()))
  );
}

function firingPointLabel(lane: DirectorLaneSnapshotDto): string {
  return lane.firingPointNumber
    ? `Firing point ${lane.firingPointNumber}`
    : lane.laneAlias || `Lane ${lane.laneId.slice(0, 8)}`;
}
