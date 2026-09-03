import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Megaphone, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';

import { eliminationPlanningService } from '@/renderer/services';
import type { OutdoorEliminationPlanDto } from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';

export function OutdoorEliminationPlanningPanel({ eventId }: { eventId: string }) {
  const [plans, setPlans] = useState<OutdoorEliminationPlanDto[]>([]);
  const [capacity, setCapacity] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('Checked against the published start list and current range capacity.');
  const [waive, setWaive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = plans.at(-1) ?? null;

  const load = useCallback(async () => {
    const response = await eliminationPlanningService.list({ eventId });
    if (!response.success) setError(response.error.message);
    else setPlans(response.data);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (operation: () => Promise<OutdoorEliminationPlanDto>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await operation();
      setPlans((current) => {
        const without = current.filter((plan) => plan.id !== updated.id);
        return [...without, updated];
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const usableFiringPoints = Number(capacity);
    if (!Number.isInteger(usableFiringPoints) || usableFiringPoints < 1 || !createdBy.trim()) return;
    await run(async () => {
      const response = await eliminationPlanningService.create({
        eventId,
        usableFiringPoints,
        createdBy: createdBy.trim(),
        ...(waive
          ? {
              waiver: {
                authorityRole: 'TECHNICAL_DELEGATE' as const,
                officialName: officialName.trim(),
                reason: 'SCHEDULE_LIMITATIONS' as const,
                statement: statement.trim(),
              },
            }
          : {}),
      });
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    });
  };

  const append = async (action: 'approve' | 'announceQuotas' | 'voidPlan') => {
    if (!latest || !officialName.trim() || !statement.trim()) return;
    await run(async () => {
      const response = await eliminationPlanningService[action]({
        planId: latest.id,
        officialName: officialName.trim(),
        statement: statement.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <ShieldAlert size={16} aria-hidden="true" /> Outdoor Elimination plan
          </h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            ISSF 6.6.6.1 · capacity decision, random-relay source, proportional quotas and Technical Delegate ledger
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}

      <div className="grid gap-3 rounded-[3px] border border-vscode-border p-3 md:grid-cols-3">
        <label className={labelClass}>
          Usable firing points
          <input
            className={inputClass}
            inputMode="numeric"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
        <label className={labelClass}>
          Plan author
          <input className={inputClass} value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-xs text-vscode-text-muted">
          <input type="checkbox" checked={waive} onChange={(event) => setWaive(event.target.checked)} />
          TD schedule-limit waiver
        </label>
        <p className="md:col-span-3 text-xs text-vscode-text-muted">
          Entry count and relay sizes are read from current starting entries and firing-point assignments. Incomplete
          assignments create a blocked assessment; the Squadding workflow remains the independent draw mechanism.
        </p>
        <Button disabled={busy || !capacity || !createdBy.trim()} onClick={() => void create()}>
          Create immutable assessment
        </Button>
      </div>

      {latest && (
        <div className="space-y-3 rounded-[3px] border border-vscode-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-vscode-text">
                {latest.status} · {latest.entryCount} entries / {latest.usableFiringPoints} firing points
              </p>
              <p className="text-xs text-vscode-text-muted">
                {latest.stale ? 'SOURCE CHANGED — create a new assessment' : 'Source snapshot current'} · minimum{' '}
                {latest.minimumRelayCount} relay(s) · {latest.qualificationPlaces} Qualification places
              </p>
            </div>
            {latest.voidEntry ? (
              <span className="text-xs font-semibold text-vscode-error">VOID</span>
            ) : latest.quotaAnnouncement ? (
              <span className="text-xs font-semibold text-green-400">QUOTAS ANNOUNCED</span>
            ) : latest.approval ? (
              <span className="text-xs font-semibold text-blue-400">TD APPROVED</span>
            ) : null}
          </div>

          {latest.relayQuotas.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {latest.relayQuotas.map((quota) => (
                <div key={quota.relayNumber} className="rounded bg-vscode-bg px-3 py-2 text-xs text-vscode-text">
                  Relay {quota.relayNumber}: {quota.startCount} starts → <strong>{quota.qualifyCount} qualify</strong>
                  <span className="ml-1 text-vscode-text-muted">({quota.rawQuota.toFixed(2)})</span>
                </div>
              ))}
            </div>
          )}

          <ul className="space-y-1 text-xs">
            {latest.findings.map((finding) => (
              <li
                key={finding.code}
                className={finding.severity === 'BLOCKING' ? 'text-vscode-error' : 'text-vscode-text-muted'}
              >
                {finding.severity}: {finding.message} ({finding.ruleReference})
              </li>
            ))}
          </ul>

          <div className="grid gap-3 md:grid-cols-2">
            <label className={labelClass}>
              Official / Technical Delegate
              <input
                className={inputClass}
                value={officialName}
                onChange={(event) => setOfficialName(event.target.value)}
              />
            </label>
            <label className={labelClass}>
              Audit statement
              <input className={inputClass} value={statement} onChange={(event) => setStatement(event.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || latest.stale || Boolean(latest.approval) || latest.status === 'REQUIRED'}
              onClick={() => void append('approve')}
            >
              <CheckCircle2 size={13} aria-hidden="true" /> TD approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                busy ||
                latest.stale ||
                latest.status !== 'PLANNED' ||
                !latest.approval ||
                Boolean(latest.quotaAnnouncement)
              }
              onClick={() => void append('announceQuotas')}
            >
              <Megaphone size={13} aria-hidden="true" /> Record quota announcement
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || Boolean(latest.voidEntry)}
              onClick={() => void append('voidPlan')}
            >
              <XCircle size={13} aria-hidden="true" /> Void
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const labelClass = 'flex flex-col gap-1 text-xs text-vscode-text-muted';
const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text';
