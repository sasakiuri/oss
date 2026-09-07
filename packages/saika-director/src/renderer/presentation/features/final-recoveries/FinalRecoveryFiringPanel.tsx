import { useEffect, useState } from 'react';
import { finalRecoveryFiringService } from '@/renderer/services';
import type { FinalFiringRecordDto, FinalRecoveryCaseDto } from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

export function FinalRecoveryFiringPanel({ value, disabled }: { value: FinalRecoveryCaseDto; disabled: boolean }) {
  const [runs, setRuns] = useState<FinalFiringRecordDto[]>([]);
  const [laneId, setLaneId] = useState(value.affectedLaneIds[0] ?? '');
  const [delay, setDelay] = useState(10);
  const [ready, setReady] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authorization = value.entries.filter((entry) => entry.type === 'REMEDY_AUTHORIZED').at(-1);
  const supported =
    ['PISTOL_25M_RAPID_FIRE', 'PISTOL_25M_WOMEN'].includes(value.procedureProfile) && value.phase === 'MATCH_SERIES';
  async function load() {
    const response = await finalRecoveryFiringService.list({ caseId: value.id });
    if (!response.success) throw new Error(response.error.message);
    setRuns(response.data);
  }
  useEffect(() => {
    void load().catch((caught: unknown) => setError(messageOf(caught)));
  }, [value.id]);
  async function execute(operation: () => Promise<{ success: boolean; error?: { message: string } }>) {
    setBusy(true);
    setError(null);
    try {
      const response = await operation();
      if (!response.success) throw new Error(response.error?.message ?? 'Operation failed');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      try {
        await load();
      } catch (caught) {
        setError(messageOf(caught));
      }
      setBusy(false);
    }
  }
  if (!supported) return null;
  const locked = busy || disabled;
  const existing = runs.find((run) => run.intent.authorizationId === authorization?.id && run.intent.laneId === laneId);
  return (
    <section className="space-y-3 rounded border border-vscode-border p-3">
      <h3 className="text-sm font-semibold">Authorized recovery firing</h3>
      <p className="text-xs text-vscode-text-muted">
        Clear the Lane safety STOP after verifying readiness. Recovery shots are recorded separately. Review hit
        evidence and apply the Jury score correction separately; Final placement still requires review.
      </p>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      <label className="block text-xs">
        Affected Lane
        <select
          aria-label="Recovery Lane"
          value={laneId}
          disabled={locked}
          onChange={(event) => setLaneId(event.target.value)}
          className="ml-2 bg-vscode-bg-light"
        >
          {value.affectedLaneIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        Seconds until READY
        <input
          aria-label="Seconds until recovery READY"
          type="number"
          min={2}
          max={60}
          value={delay}
          onChange={(event) => setDelay(Number(event.target.value))}
          className="ml-2 w-20 bg-vscode-bg-light"
        />
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={ready} onChange={(event) => setReady(event.target.checked)} />
        Jury has verified the applicable readiness limit, original series and authorized shot count.
      </label>
      <Button
        size="sm"
        disabled={
          locked ||
          !ready ||
          !authorization ||
          !laneId ||
          !!existing ||
          !Number.isInteger(delay) ||
          delay < 2 ||
          delay > 60 ||
          !['RECOVERY_AUTHORIZED', 'RESUMED'].includes(value.status)
        }
        onClick={() =>
          authorization &&
          void execute(() =>
            finalRecoveryFiringService.start({
              id: crypto.randomUUID(),
              readinessConfirmed: true,
              caseId: value.id,
              authorizationId: authorization.id,
              laneId,
              loadAt: new Date(Date.now() + delay * 1000).toISOString(),
            }),
          )
        }
      >
        Start isolated firing
      </Button>
      <label className="block text-xs">
        Cancellation reason
        <input
          aria-label="Recovery cancellation reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="ml-2 bg-vscode-bg-light"
        />
      </label>
      {runs.map((run) => (
        <div key={run.intent.id} className="space-y-2 border-t border-vscode-border pt-2 text-xs">
          <p>
            {run.intent.id} · {run.evidence?.status ?? 'Awaiting Lane evidence'} · {run.request.shotsToFire} shots ·
            LOAD {run.intent.loadAt}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={locked}
              onClick={() => void execute(() => finalRecoveryFiringService.read({ id: run.intent.id }))}
            >
              Read Lane evidence
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                locked ||
                !ready ||
                (!!run.evidence && run.evidence.status !== 'RUNNING') ||
                !['RECOVERY_AUTHORIZED', 'RESUMED'].includes(value.status)
              }
              onClick={() => void execute(() => finalRecoveryFiringService.start(run.intent))}
            >
              Retry same firing
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={locked || !reason.trim() || (!!run.evidence && run.evidence.status !== 'RUNNING')}
              onClick={() => void execute(() => finalRecoveryFiringService.cancel({ id: run.intent.id, reason }))}
            >
              Cancel firing
            </Button>
          </div>
          {run.evidence && (
            <>
              <p>
                {run.evidence.shots.filter((shot) => shot.eligible).length} eligible observations ·{' '}
                {run.evidence.shots.filter((shot) => !shot.eligible).length} require review
              </p>
              {run.evidence.captureIssues.map((issue) => (
                <p key={issue} className="text-vscode-error">
                  {issue}
                </p>
              ))}
              <details>
                <summary>Shot evidence for Jury review</summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(run.evidence, null, 2)}
                </pre>
              </details>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
