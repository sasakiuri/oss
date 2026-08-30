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

/**
 * Competition-independent range safety control.
 * Clearing the latch never resumes a timer; restart remains a separate workflow.
 */
export function SafetyStopPanel({ connected, lanes, targetLaneIds }: SafetyStopPanelProps) {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [reason, setReason] = useState('Emergency range safety stop');
  const [officialName, setOfficialName] = useState('Director');
  const [clearanceReason, setClearanceReason] = useState('Range inspected and declared safe');
  const [confirmedSafe, setConfirmedSafe] = useState(false);
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

  const clear = useCallback(
    async (safetyStopId: string, group: readonly DirectorLaneSnapshotDto[]) => {
      const normalizedReason = clearanceReason.trim();
      const normalizedOfficial = officialName.trim();
      if (!confirmedSafe || !normalizedReason || !normalizedOfficial) return;

      setBusy('clear');
      try {
        const response = await mqttService.clearSafetyStop({
          safetyStopId,
          laneIds: group.map((lane) => lane.laneId),
          clearanceReason: normalizedReason,
          officialName: normalizedOfficial,
          confirmedSafe: true,
        });
        if (!response.success) {
          addNotification('error', response.error.message);
          return;
        }
        const completed = response.data.commands.filter((command) => command.success).length;
        addNotification(
          response.data.success ? 'success' : 'error',
          `Safety latch cleared on ${completed}/${group.length} Lane(s); competition timers remain stopped`,
        );
        if (response.data.success) setConfirmedSafe(false);
        await refreshAudit();
      } catch (caught) {
        addNotification('error', caught instanceof Error ? caught.message : 'Failed to clear the safety latch');
      } finally {
        setBusy(null);
      }
    },
    [addNotification, clearanceReason, confirmedSafe, officialName, refreshAudit],
  );

  const pendingStopCount = targetLanes.filter((lane) => lane.safetyState?.status !== 'STOPPED').length;

  return (
    <Card className={stoppedGroups.length > 0 ? 'border-red-500 bg-red-950/20' : ''}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <AlertOctagon size={18} className="text-red-400" aria-hidden="true" />
            Range safety STOP
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-vscode-text-muted">
            Independent of interruption cases and competition phase. It freezes each Lane timer, blocks firing commands,
            quarantines subsequent shots, and shows a full-screen STOP / UNLOAD indication. The emergency action targets
            all discovered Lanes; the command API also accepts an explicit Lane subset for other operating surfaces.
          </p>
        </div>
        <Button
          variant="danger"
          size="lg"
          className="min-w-72 border-2 border-red-400 bg-red-700 font-black tracking-wide text-white hover:bg-red-600"
          disabled={!connected || busy !== null || pendingStopCount === 0 || targetLanes.length === 0}
          onClick={() => void activate()}
        >
          {busy === 'stop' ? <LoaderCircle size={18} className="animate-spin" /> : <AlertOctagon size={18} />}
          {pendingStopCount === 0 ? 'SAFETY STOP ACTIVE' : `EMERGENCY STOP · ${pendingStopCount} LANE(S)`}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
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

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {targetLanes.length === 0 ? (
          <span className="text-vscode-text-muted">No target Lanes are available.</span>
        ) : (
          targetLanes.map((lane) => (
            <span
              key={lane.laneId}
              className={`rounded border px-2 py-1 ${
                lane.safetyState?.status === 'STOPPED'
                  ? 'border-red-500 bg-red-950/40 text-red-200'
                  : 'border-vscode-border text-vscode-text-muted'
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
            Clearing removes the Lane safety overlay and shot quarantine only. It does not restart any timer or
            authorize firing.
          </p>
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
            Clearance statement
            <input
              value={clearanceReason}
              onChange={(event) => setClearanceReason(event.target.value)}
              className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 text-[13px] text-vscode-text"
            />
          </label>
          <label className="mt-3 flex items-start gap-2 text-xs text-vscode-text">
            <input
              type="checkbox"
              checked={confirmedSafe}
              onChange={(event) => setConfirmedSafe(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-vscode-primary"
            />
            I confirm the range has been inspected, all firearms are unloaded, and the safety condition is resolved.
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {stoppedGroups.map(([safetyStopId, group]) => (
              <Button
                key={safetyStopId}
                variant="secondary"
                disabled={!confirmedSafe || busy !== null || !clearanceReason.trim() || !officialName.trim()}
                onClick={() => void clear(safetyStopId, group)}
              >
                {busy === 'clear' ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                Clear {group.length} Lane(s) · {safetyStopId.slice(0, 8)}
              </Button>
            ))}
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
                </div>
              ))}
          </div>
        </details>
      )}
    </Card>
  );
}
