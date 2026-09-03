import { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore, DatabaseBackup, FileCheck2 } from 'lucide-react';

import { operationalArchivesService } from '@/renderer/services';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import type { PendingRestoreDto, RestoreCandidateDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

type ReadyCandidate = Extract<RestoreCandidateDto, { status: 'READY' }>;

export function OperationalArchivesPanel() {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [busy, setBusy] = useState(false);
  const [candidate, setCandidate] = useState<ReadyCandidate | null>(null);
  const [pending, setPending] = useState<PendingRestoreDto | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);

  const loadPending = useCallback(async () => {
    const response = await operationalArchivesService.getPendingRestore();
    if (!response.success) addNotification('error', response.error.message);
    else setPending(response.data);
  }, [addNotification]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const createBackup = async () => {
    setBusy(true);
    try {
      const response = await operationalArchivesService.createDatabaseBackup();
      if (!response.success) throw new Error(response.error.message);
      if (response.data.status === 'COMPLETED') {
        addNotification('success', `Verified database backup created: ${response.data.inspection.fileName}`);
      }
    } catch (error) {
      addNotification('error', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const inspectRestore = async () => {
    setBusy(true);
    setCandidate(null);
    setRestoreConfirmed(false);
    try {
      const response = await operationalArchivesService.inspectRestoreCandidate();
      if (!response.success) throw new Error(response.error.message);
      if (response.data.status === 'READY') setCandidate(response.data);
    } catch (error) {
      addNotification('error', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const scheduleRestore = async () => {
    if (!candidate || !restoreConfirmed) return;
    setBusy(true);
    try {
      const response = await operationalArchivesService.scheduleRestore({
        candidateToken: candidate.candidateToken,
        confirmation: true,
      });
      if (!response.success) throw new Error(response.error.message);
      setPending(response.data);
      setCandidate(null);
      setRestoreConfirmed(false);
      addNotification('success', 'Restore staged. Restart Director to apply it.');
    } catch (error) {
      addNotification('error', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const cancelRestore = async () => {
    setBusy(true);
    try {
      const response = await operationalArchivesService.cancelPendingRestore();
      if (!response.success) throw new Error(response.error.message);
      setPending(null);
      addNotification('success', response.data.cancelled ? 'Pending restore cancelled' : 'No restore was pending');
    } catch (error) {
      addNotification('error', messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="operational-archives-heading" className="mt-6 border-t border-vscode-border">
      <div className="border-b border-vscode-border py-3">
        <h3
          id="operational-archives-heading"
          className="flex items-center gap-2 text-sm font-semibold text-vscode-text"
        >
          <DatabaseBackup size={15} aria-hidden="true" /> Operational archives
        </h3>
      </div>

      <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div>
          <h4 className="text-[13px] font-medium text-vscode-text">Database backup</h4>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Creates a consistent SQLite backup, then verifies its integrity and SHA-256 digest.
          </p>
        </div>
        <div className="max-w-xl">
          <Button size="sm" disabled={busy} onClick={() => void createBackup()}>
            <DatabaseBackup size={14} aria-hidden="true" /> Create verified backup
          </Button>
        </div>
      </div>

      <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div>
          <h4 className="text-[13px] font-medium text-vscode-text">Restore</h4>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            A candidate is inspected before it can be staged. The current database is retained as a recovery copy.
          </p>
        </div>
        <div className="max-w-xl space-y-3">
          {pending ? (
            <div className="rounded-[3px] border border-vscode-warning p-3 text-xs text-vscode-text">
              <p className="font-medium">Restore pending for the next Director restart</p>
              <p className="mt-1 text-vscode-text-muted">
                {pending.sourceFileName} · schema {pending.schemaVersion} · {shortHash(pending.stagedSha256)}
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void cancelRestore()}
              >
                Cancel pending restore
              </Button>
            </div>
          ) : (
            <>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void inspectRestore()}>
                <FileCheck2 size={14} aria-hidden="true" /> Inspect restore candidate
              </Button>
              {candidate && (
                <div className="rounded-[3px] border border-vscode-border p-3 text-xs">
                  <p className="font-medium text-vscode-text">{candidate.inspection.fileName}</p>
                  <p className="mt-1 text-vscode-text-muted">
                    {formatBytes(candidate.inspection.sizeBytes)} · schema {candidate.inspection.schemaVersion} ·{' '}
                    {candidate.inspection.championshipCount} championship(s) · {shortHash(candidate.inspection.sha256)}
                  </p>
                  {candidate.compatibilityIssues.map((issue) => (
                    <p key={issue} className="mt-1 text-vscode-error">
                      {issue}
                    </p>
                  ))}
                  {candidate.compatible && (
                    <>
                      <label className="mt-3 flex items-start gap-2 text-vscode-text">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={restoreConfirmed}
                          onChange={(event) => setRestoreConfirmed(event.target.checked)}
                        />
                        I understand that the selected backup will replace the active database after restart.
                      </label>
                      <Button
                        className="mt-3"
                        size="sm"
                        disabled={busy || !restoreConfirmed}
                        onClick={() => void scheduleRestore()}
                      >
                        <ArchiveRestore size={14} aria-hidden="true" /> Stage restore
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function shortHash(value: string): string {
  return `SHA-256 ${value.slice(0, 12)}…`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
