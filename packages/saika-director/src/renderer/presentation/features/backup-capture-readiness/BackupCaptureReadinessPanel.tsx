import { useEffect, useState } from 'react';

import { backupCaptureReadinessService } from '@/renderer/services';
import type {
  BackupCaptureReadinessDto,
  BackupCaptureReadinessSettings,
} from '@/shared/ipc/contracts/backupCaptureReadiness.contract';

import { Button } from '../shared/common/Button';

export function BackupCaptureReadinessPanel({ competitionId }: { competitionId: string }) {
  const [current, setCurrent] = useState<BackupCaptureReadinessDto | null>(null);
  const [draft, setDraft] = useState<(BackupCaptureReadinessSettings & { expectedRevision: string }) | null>(null);
  const [sources, setSources] = useState<{ eventId: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (busy) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const [response, choices] = await Promise.all([
          backupCaptureReadinessService.get({ competitionId }),
          backupCaptureReadinessService.sources(),
        ]);
        if (cancelled) return;
        if (!response.success) throw new Error(response.error.message);
        if (!choices.success) throw new Error(choices.error.message);
        setCurrent(response.data);
        setPollError(null);
        setSources(choices.data);
        setDraft((value) => value ?? { ...response.data.settings, expectedRevision: response.data.revision });
      } catch (caught) {
        if (!cancelled) setPollError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!cancelled) timer = setTimeout(() => void refresh(), 2000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [competitionId, busy]);

  const update = (patch: Partial<BackupCaptureReadinessSettings>) => {
    setDraft((value) => (value ? { ...value, ...patch } : null));
    setSaved(false);
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await backupCaptureReadinessService.save(draft);
      if (!response.success) throw new Error(response.error.message);
      setCurrent(response.data);
      setDraft({ ...response.data.settings, expectedRevision: response.data.revision });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Backup capture start checks" className="space-y-3 text-xs">
      <h2 className="text-sm font-semibold">Backup capture start checks</h2>
      <p>
        Check capture availability before START. Configure an independent source in the event's backup panel first.
        These checks do not compare scores or confirm that the source contains every shot.
      </p>
      {(error || pollError) && (
        <p role="alert" className="text-vscode-error">
          {error ?? pollError}
        </p>
      )}
      {saved && <p role="status">Backup capture settings saved.</p>}
      {draft && (
        <fieldset disabled={busy} className="space-y-3">
          <label className="block">
            Backup check mode
            <select
              aria-label="Backup check mode"
              value={draft.mode}
              onChange={(event) => update({ mode: event.target.value as BackupCaptureReadinessSettings['mode'] })}
              className="ml-2 border border-vscode-border bg-vscode-input p-1"
            >
              <option value="DISABLED">Disabled</option>
              <option value="ADVISORY">Advisory</option>
              <option value="REQUIRED">Required</option>
            </select>
          </label>
          <label className="block">
            Independent backup source
            <select
              aria-label="Independent backup source"
              value={draft.eventId ?? ''}
              onChange={(event) => update({ eventId: event.target.value || null })}
              className="ml-2 border border-vscode-border bg-vscode-input p-1"
            >
              <option value="">Select a source</option>
              {draft.eventId && !sources.some((source) => source.eventId === draft.eventId) && (
                <option value={draft.eventId}>Saved source unavailable</option>
              )}
              {sources.map((source) => (
                <option key={source.eventId} value={source.eventId}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Maximum time since a retained snapshot was checked (seconds)
            <input
              aria-label="Maximum backup check age (seconds)"
              type="number"
              min={1}
              max={3600}
              value={draft.maximumAgeMilliseconds / 1000}
              onChange={(event) => update({ maximumAgeMilliseconds: Number(event.target.value) * 1000 })}
              className="ml-2 w-20 border border-vscode-border bg-vscode-input p-1"
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={
                !Number.isInteger(draft.maximumAgeMilliseconds) ||
                draft.maximumAgeMilliseconds < 1000 ||
                draft.maximumAgeMilliseconds > 3_600_000
              }
              onClick={() => void save()}
            >
              Save backup checks
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!current}
              onClick={() => {
                if (current) setDraft({ ...current.settings, expectedRevision: current.revision });
                setSaved(false);
                setError(null);
              }}
            >
              Reload saved settings
            </Button>
          </div>
        </fieldset>
      )}
      {current && (
        <p role="status">
          Saved policy: {current.settings.mode} · Capture: {current.health.state}
        </p>
      )}
      {!!current?.health.issues.length && (
        <div role="alert" className="text-vscode-error">
          {current.health.issues.join('; ')}
        </div>
      )}
    </section>
  );
}
