import { useCallback, useEffect, useState } from 'react';
import { Dices, RefreshCw, ShieldCheck } from 'lucide-react';

import { squaddingService } from '@/renderer/services';
import type { SquaddingDrawDto } from '@/shared/ipc/contracts';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { Button } from '../../shared/common/Button';

interface SquaddingPanelProps {
  eventId: string;
  competitionTypeId: string;
  relayCount: number;
  firingPointCount: number;
  onApplied: () => Promise<void>;
}

export function SquaddingPanel({
  eventId,
  competitionTypeId,
  relayCount,
  firingPointCount,
  onApplied,
}: SquaddingPanelProps) {
  const [draws, setDraws] = useState<SquaddingDrawDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seed, setSeed] = useState<string>(() => crypto.randomUUID());
  const [firstFiringPoint, setFirstFiringPoint] = useState(1);
  const [statusSectionPolicy, setStatusSectionPolicy] = useState<'OFF' | 'END_OF_RELAY'>('OFF');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('Range constraints and draw evidence reviewed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = draws.find((draw) => draw.id === selectedId) ?? draws[0] ?? null;

  const load = useCallback(async () => {
    setError(null);
    const response = await squaddingService.list({ eventId });
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    setDraws(response.data);
    setSelectedId((current) => current ?? response.data[0]?.id ?? null);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (
    operation: () => Promise<{ success: boolean; data?: SquaddingDrawDto; error?: { message: string } }>,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const response = await operation();
      if (!response.success || !response.data) throw new Error(response.error?.message ?? 'Squadding operation failed');
      setSelectedId(response.data.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const createDraw = () =>
    run(() =>
      squaddingService.createDraw({
        eventId,
        competitionTypeId,
        seed: seed.trim(),
        relayCount,
        firstFiringPoint,
        firingPointCount,
        statusSectionPolicy,
        createdBy: officialName.trim(),
      }),
    );

  const approve = () =>
    selected &&
    run(() =>
      squaddingService.approve({
        drawId: selected.id,
        officialName: officialName.trim(),
        statement: statement.trim(),
      }),
    );

  const apply = async () => {
    if (!selected) return;
    const confirmed = await useConfirmDialogStore
      .getState()
      .openConfirm(
        `Apply approved draw ${selected.seed}? This replaces all current firing-point assignments for the event.`,
      );
    if (!confirmed) return;
    await run(async () => {
      const response = await squaddingService.apply({
        drawId: selected.id,
        officialName: officialName.trim(),
        statement: statement.trim(),
      });
      if (response.success) await onApplied();
      return response;
    });
  };

  const voidDraw = () =>
    selected &&
    run(() =>
      squaddingService.voidDraw({
        drawId: selected.id,
        officialName: officialName.trim(),
        statement: statement.trim(),
      }),
    );

  const ready = Boolean(officialName.trim() && statement.trim());
  return (
    <section className="space-y-3 rounded border border-vscode-border bg-vscode-bg p-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-[13px] font-semibold text-vscode-text">
            <Dices size={15} aria-hidden="true" /> ISSF computer draw
          </h4>
          <p className="mt-1 text-xs text-vscode-text-muted">
            Seeded draw · ISSF 6.6.6 / 6.18.2.2 · Technical Delegate approval is separate from application.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className={labelClass}>
          Seed
          <div className="mt-1 flex gap-1">
            <input className={inputClass} value={seed} onChange={(event) => setSeed(event.target.value)} />
            <Button size="sm" variant="secondary" onClick={() => setSeed(crypto.randomUUID())}>
              New
            </Button>
          </div>
        </label>
        <label className={labelClass}>
          First firing point
          <input
            className={inputClass}
            type="number"
            min={1}
            value={firstFiringPoint}
            onChange={(event) => setFirstFiringPoint(Number(event.target.value))}
          />
        </label>
        <label className={labelClass}>
          MQS/RPO/OOC section
          <select
            className={inputClass}
            value={statusSectionPolicy}
            onChange={(event) => setStatusSectionPolicy(event.target.value as 'OFF' | 'END_OF_RELAY')}
          >
            <option value="OFF">No dedicated section</option>
            <option value="END_OF_RELAY">End of each relay</option>
          </select>
        </label>
        <label className={labelClass}>
          Official / operator
          <input
            className={inputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </label>
      </div>
      <label className={labelClass}>
        Audit statement
        <input className={inputClass} value={statement} onChange={(event) => setStatement(event.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void createDraw()} disabled={busy || !officialName.trim() || !seed.trim()}>
          <Dices size={13} aria-hidden="true" /> Draw {relayCount} relay(s) × {firingPointCount} points
        </Button>
        {draws.length > 0 && (
          <select
            aria-label="Stored squadding draw"
            className="min-h-8 rounded border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text"
            value={selected?.id ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {draws.map((draw) => (
              <option key={draw.id} value={draw.id}>
                {draw.seed} · {new Date(draw.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        )}
      </div>

      {selected && (
        <div className="space-y-2 border-t border-vscode-border pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-vscode-text-muted">
            <span>{selected.assignments.length} assignments</span>
            <span>hash {selected.outputHash.slice(0, 12)}</span>
            <span>{selected.stale ? 'STALE' : 'entry snapshot current'}</span>
            <span>{selected.approval ? `approved by ${selected.approval.officialName}` : 'approval pending'}</span>
            <span>{selected.application ? `applied by ${selected.application.officialName}` : 'not applied'}</span>
            {selected.voidEntry && <span className="text-vscode-error">void</span>}
          </div>
          <ul className="space-y-0.5 text-vscode-text-muted">
            {selected.findings.map((finding) => (
              <li key={finding.code} className={finding.severity === 'WARNING' ? 'text-vscode-warning' : ''}>
                {finding.ruleReference} · {finding.message}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {!selected.approval && !selected.voidEntry && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void approve()}
                disabled={busy || !ready || selected.stale}
              >
                <ShieldCheck size={13} aria-hidden="true" /> TD approve
              </Button>
            )}
            {selected.approval && !selected.application && !selected.voidEntry && (
              <Button size="sm" onClick={() => void apply()} disabled={busy || !ready || selected.stale}>
                Apply approved draw
              </Button>
            )}
            {!selected.application && !selected.voidEntry && (
              <Button size="sm" variant="secondary" onClick={() => void voidDraw()} disabled={busy || !ready}>
                Void
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const labelClass = 'text-xs text-vscode-text-muted';
const inputClass =
  'mt-1 min-h-8 w-full rounded border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text';
