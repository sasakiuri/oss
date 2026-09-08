import { useEffect, useRef, useState } from 'react';

import { estBackupVerificationService } from '@/renderer/services';
import type {
  EstBackupCaptureStatusDto,
  EstBackupColumnMappingDto,
} from '@/shared/ipc/contracts/estBackupVerification.contract';

import { Button } from '../../shared/common/Button';

type CaptureResponse = Awaited<ReturnType<typeof estBackupVerificationService.startCapture>>;

export function EstBackupCapturePanel({
  eventId,
  mapping,
  onCaptured,
}: {
  eventId: string;
  mapping?: EstBackupColumnMappingDto;
  onCaptured: () => void;
}) {
  const [status, setStatus] = useState<EstBackupCaptureStatusDto | null>(null);
  const [seconds, setSeconds] = useState(5);
  const [snapshotMode, setSnapshotMode] = useState<'STABLE_READS' | 'COMPLETE_FILES'>('STABLE_READS');
  const [resumeOnStartup, setResumeOnStartup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSource = useRef<string | null>(null);
  const mounted = useRef(true);
  const currentEventId = useRef(eventId);
  currentEventId.current = eventId;
  useEffect(() => {
    setStatus(null);
    setBusy(false);
    setError(null);
    lastSource.current = null;
  }, [eventId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (busy) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const result = await estBackupVerificationService.getCapture({ eventId });
        if (cancelled) return;
        if (!result.success) throw new Error(result.error.message);
        setStatus(result.data);
        setError(null);
      } catch (caught) {
        if (!cancelled) setError(String(caught));
      } finally {
        if (!cancelled) timer = setTimeout(() => void refresh(), 2000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [eventId, busy]);

  useEffect(() => {
    if (status?.sourceId && lastSource.current !== status.sourceId) {
      lastSource.current = status.sourceId;
      onCaptured();
    }
  }, [status?.sourceId, onCaptured]);

  const act = async (work: () => Promise<CaptureResponse>) => {
    const operationEventId = eventId;
    const current = () => mounted.current && currentEventId.current === operationEventId;
    setBusy(true);
    setError(null);
    try {
      const result = await work();
      if (!result.success) throw new Error(result.error.message);
      if (current()) setStatus(result.data);
    } catch (caught) {
      if (current()) setError(String(caught));
    } finally {
      if (current()) setBusy(false);
    }
  };
  const running = status?.runId && status.state !== 'STOPPED';
  return (
    <section aria-label="Continuous backup capture" className="space-y-2 border-t border-vscode-border pt-3 text-xs">
      <h4>Continuous backup capture</h4>
      <p>
        Choose a file written by an independent backup system. The source and its reading settings are saved for this
        event. Complete files mode captures each valid read without waiting for a second identical sample. Use it only
        when the source publishes complete files by atomic replacement.
      </p>
      <p>
        Uses {mapping ? 'the column mapping selected above' : 'the standard JSON or CSV layout'}. Captured sources
        remain available for printing and later review.
      </p>
      <label className="block">
        Check interval (seconds)
        <input
          type="number"
          min={1}
          max={300}
          value={seconds}
          disabled={busy || !!running}
          onChange={(event) => setSeconds(Number(event.target.value))}
          className="ml-2 w-20 rounded border border-vscode-border bg-vscode-input p-1"
        />
      </label>
      <label className="block">
        <input
          type="checkbox"
          checked={resumeOnStartup}
          disabled={busy}
          onChange={(event) => setResumeOnStartup(event.target.checked)}
        />{' '}
        Resume automatically after restarting Director
      </label>
      <p>
        Stopping capture prevents automatic restart until you resume it. Forgetting a saved source keeps retained
        evidence.
      </p>
      <label className="block">
        Snapshot mode
        <select
          value={snapshotMode}
          disabled={busy}
          onChange={(event) => setSnapshotMode(event.target.value as typeof snapshotMode)}
          className="ml-2 rounded border border-vscode-border bg-vscode-input p-1"
        >
          <option value="STABLE_READS">Two identical reads</option>
          <option value="COMPLETE_FILES">Complete files</option>
        </select>
      </label>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy || !Number.isInteger(seconds) || seconds < 1 || seconds > 300}
        onClick={() =>
          void act(() =>
            estBackupVerificationService.startCapture({
              eventId,
              intervalMilliseconds: seconds * 1000,
              snapshotMode,
              resumeOnStartup,
              ...(mapping ? { mapping } : {}),
            }),
          )
        }
      >
        {running ? 'Choose another capture source' : 'Choose source and start capture'}
      </Button>
      {!running && status?.canResume && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void act(() => estBackupVerificationService.resumeCapture({ eventId }))}
          >
            Resume saved source
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void act(() => estBackupVerificationService.forgetCapture({ eventId }))}
          >
            Forget saved source
          </Button>
        </div>
      )}
      {running && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void act(() => estBackupVerificationService.checkCapture({ eventId, runId: status.runId! }))}
          >
            Check source now
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void act(() => estBackupVerificationService.stopCapture({ eventId, runId: status.runId! }))}
          >
            Stop capture
          </Button>
        </div>
      )}
      {status && (
        <p role="status">
          {status.state} · {status.sourceLabel ?? 'No source selected'}
          {status.snapshotMode &&
            ` · ${status.snapshotMode === 'COMPLETE_FILES' ? 'Complete files' : 'Two identical reads'}`}{' '}
          · Last checked: {status.checkedAt ? new Date(status.checkedAt).toLocaleString() : 'Never'} · Last retained:{' '}
          {status.capturedAt ? new Date(status.capturedAt).toLocaleString() : 'Never'}
          {running && status.resumeOnStartup && ' · Automatic resume enabled'}
        </p>
      )}
      {(error || status?.error) && (
        <p role="alert" className="text-vscode-error">
          {error ?? status?.error}
        </p>
      )}
    </section>
  );
}
