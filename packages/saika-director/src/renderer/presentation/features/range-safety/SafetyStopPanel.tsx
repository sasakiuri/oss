import { useMemo, useState } from 'react';
import { AlertOctagon, CheckCircle2, LoaderCircle, RotateCcw } from 'lucide-react';

import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { Card } from '../shared/common/Card';
import { stackedMediumLabelClass } from '../shared/common/formClasses';

import { LaneClearanceCard } from './LaneClearanceCard';
import { DEFAULT_CLEARANCE_DRAFT, laneClearanceReady } from './safetyStopRules';
import { useSafetyStop } from './useSafetyStop';

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
  const [reason, setReason] = useState('Emergency range safety stop');
  const [officialName, setOfficialName] = useState('Director');
  const [clearanceReason, setClearanceReason] = useState('Range inspected and declared safe');
  const targetLaneSet = useMemo(() => new Set(targetLaneIds), [targetLaneIds]);
  const targetLanes = useMemo(() => lanes.filter((lane) => targetLaneSet.has(lane.laneId)), [lanes, targetLaneSet]);
  const { audit, busy, stoppedGroups, clearanceDrafts, updateClearanceDraft, activate, clear } =
    useSafetyStop(targetLanes);

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
          onClick={() => void activate(reason, officialName)}
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
        <label className={stackedMediumLabelClass}>
          Responsible official
          <input
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 text-[13px] text-vscode-text"
          />
        </label>
        <label className={stackedMediumLabelClass}>
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
          <label className={`mt-3 ${stackedMediumLabelClass}`}>
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
                    {group.map((lane) => (
                      <LaneClearanceCard
                        key={lane.laneId}
                        lane={lane}
                        draft={clearanceDrafts[lane.laneId] ?? DEFAULT_CLEARANCE_DRAFT}
                        onChange={(patch) => updateClearanceDraft(lane.laneId, patch)}
                      />
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    disabled={verifiedCount === 0 || busy !== null || !clearanceReason.trim() || !officialName.trim()}
                    onClick={() => void clear(safetyStopId, group, clearanceReason, officialName)}
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
