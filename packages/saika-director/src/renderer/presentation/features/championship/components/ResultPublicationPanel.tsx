import { Clock3, FileCheck2, History, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { resultPublicationService } from '@/renderer/services';
import type { ResultPublicationStatusDto } from '@/shared/ipc/contracts';

import { ObservationReviewsPanel } from '../../observation-reviews/ObservationReviewsPanel';
import { Button } from '../../shared/common/Button';
import { Modal } from '../../shared/common/Modal';

interface ResultPublicationPanelProps {
  eventId: string;
  eventName?: string;
  onClose: () => void;
}

const inputClass =
  'w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text focus:border-vscode-focus focus:outline-none';

export function ResultPublicationPanel({ eventId, eventName, onClose }: ResultPublicationPanelProps) {
  const [status, setStatus] = useState<ResultPublicationStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [postingLocation, setPostingLocation] = useState('');
  const [postingReference, setPostingReference] = useState('');
  const [postingTimeMode, setPostingTimeMode] = useState('NOW');
  const [postingTime, setPostingTime] = useState('');
  const [protestReference, setProtestReference] = useState('');
  const [selectedProtest, setSelectedProtest] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await resultPublicationService.getStatus({
        eventId,
        resultScope: 'QUALIFICATION',
      });
      if (!response.success) throw new Error(response.error.message);
      setStatus(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load result publication status');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.canRegisterProtest || !status.protestEndsAt) return;
    const delayMs = Math.max(0, new Date(status.protestEndsAt).getTime() - Date.now() + 50);
    const timeout = window.setTimeout(() => void loadStatus(), delayMs);
    return () => window.clearTimeout(timeout);
  }, [loadStatus, status?.canRegisterProtest, status?.protestEndsAt]);

  const run = useCallback(
    async (
      operation: () => Promise<{ success: boolean; data?: ResultPublicationStatusDto; error?: { message: string } }>,
    ): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const response = await operation();
        if (!response.success || !response.data)
          throw new Error(response.error?.message ?? 'Publication command failed');
        setStatus(response.data);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Publication command failed');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const publishPreliminary = useCallback(
    () =>
      run(() =>
        resultPublicationService.publishPreliminary({
          eventId,
          resultScope: 'QUALIFICATION',
          officialName,
          posting: {
            snapshotRevision: status!.currentSnapshotRevision!,
            location: postingLocation.trim(),
            ...(postingReference.trim() ? { reference: postingReference.trim() } : {}),
            ...(postingTimeMode === 'EARLIER' ? { postedAt: new Date(postingTime).toISOString() } : {}),
          },
        }),
      ),
    [eventId, officialName, run, status, postingLocation, postingReference, postingTimeMode, postingTime],
  );

  const registerProtest = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const succeeded = await run(() =>
        resultPublicationService.registerProtest({
          eventId,
          resultScope: 'QUALIFICATION',
          protestReference,
        }),
      );
      if (succeeded) setProtestReference('');
    },
    [eventId, protestReference, run],
  );

  const resolveProtest = useCallback(async () => {
    if (!selectedProtest) return;
    const succeeded = await run(() =>
      resultPublicationService.resolveProtest({
        eventId,
        resultScope: 'QUALIFICATION',
        protestReference: selectedProtest,
        resolution,
        officialName,
      }),
    );
    if (succeeded) {
      setSelectedProtest(null);
      setResolution('');
    }
  }, [eventId, officialName, resolution, run, selectedProtest]);

  const publishOfficial = useCallback(
    () =>
      run(() =>
        resultPublicationService.publishOfficial({
          eventId,
          resultScope: 'QUALIFICATION',
          officialName,
        }),
      ),
    [eventId, officialName, run],
  );

  return (
    <Modal isOpen onClose={onClose} title={`Result publication${eventName ? ` — ${eventName}` : ''}`} size="xl">
      <div className="space-y-4">
        {error && <div className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</div>}
        {loading || !status ? (
          <p className="text-[13px] text-vscode-text-muted">Loading publication status…</p>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Summary label="Status" value={status.status.replaceAll('_', ' ')} />
              <Summary label="Preliminary posted" value={formatDate(status.postedAt)} />
              <Summary label="Score protest ends" value={formatDate(status.protestEndsAt)} />
            </section>

            {!status.publicationCurrent && status.preliminaryId && (
              <div className="flex gap-2 border-l-2 border-vscode-warning pl-3 text-xs text-vscode-warning">
                <TriangleAlert size={15} className="shrink-0" aria-hidden="true" />
                {status.status === 'OFFICIAL'
                  ? 'The Official publication requires review because its result revision, RTS approval, or an operational blocker is no longer current. The journal remains unchanged; follow the event correction procedure.'
                  : 'The result list changed after preliminary publication. Publish the current revision again.'}
              </div>
            )}

            <label className="block text-xs text-vscode-text-muted">
              Responsible official
              <input
                aria-label="Result publication official"
                className={`${inputClass} mt-1`}
                value={officialName}
                onChange={(event) => setOfficialName(event.target.value)}
              />
            </label>

            {status.status !== 'OFFICIAL' && (
              <fieldset className="space-y-3 border-t border-vscode-border pt-4" disabled={saving}>
                <legend className="text-[13px] font-semibold">Preliminary posting</legend>
                <p className="text-xs text-vscode-text-muted">
                  Record this after the result list is visible. The score protest deadline starts at the actual posting
                  time.
                </p>
                <label className="block text-xs">
                  Posting destination
                  <input
                    className={`${inputClass} mt-1`}
                    value={postingLocation}
                    maxLength={300}
                    onChange={(event) => setPostingLocation(event.target.value)}
                  />
                </label>
                <label className="block text-xs">
                  Posting time
                  <select
                    className={`${inputClass} mt-1`}
                    value={postingTimeMode}
                    onChange={(event) => setPostingTimeMode(event.target.value)}
                  >
                    <option value="NOW">Displayed now</option>
                    <option value="EARLIER">Record an earlier posting</option>
                  </select>
                </label>
                {postingTimeMode === 'EARLIER' && (
                  <label className="block text-xs">
                    Actual posting time (local)
                    <input
                      className={`${inputClass} mt-1`}
                      type="datetime-local"
                      step="1"
                      value={postingTime}
                      onChange={(event) => setPostingTime(event.target.value)}
                    />
                  </label>
                )}
                <label className="block text-xs">
                  Posting reference (optional)
                  <input
                    className={`${inputClass} mt-1`}
                    value={postingReference}
                    maxLength={1000}
                    onChange={(event) => setPostingReference(event.target.value)}
                  />
                </label>
              </fieldset>
            )}

            <section className="flex flex-wrap gap-2 border-t border-vscode-border pt-4">
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  saving ||
                  !officialName.trim() ||
                  !postingLocation.trim() ||
                  !status.currentSnapshotRevision ||
                  (postingTimeMode === 'EARLIER' && !postingTime) ||
                  status.status === 'OFFICIAL' ||
                  (status.preliminaryId !== null && status.publicationCurrent)
                }
                onClick={publishPreliminary}
              >
                <Clock3 size={14} aria-hidden="true" />
                {status.preliminaryId ? 'Record revised posting' : 'Record preliminary posting'}
              </Button>
              <Button
                size="sm"
                disabled={saving || !officialName.trim() || !status.canPublishOfficial}
                onClick={publishOfficial}
              >
                <FileCheck2 size={14} aria-hidden="true" />
                Publish official results
              </Button>
            </section>

            {status.status !== 'DRAFT' && status.status !== 'OFFICIAL' && (
              <section className="space-y-3 border-t border-vscode-border pt-4">
                <h3 className="text-[13px] font-semibold text-vscode-text">Score protests</h3>
                {status.canRegisterProtest ? (
                  <form className="flex gap-2" onSubmit={registerProtest}>
                    <input
                      aria-label="Score protest reference"
                      className={inputClass}
                      placeholder="Form P / protest reference"
                      required
                      value={protestReference}
                      onChange={(event) => setProtestReference(event.target.value)}
                    />
                    <Button type="submit" size="sm" disabled={saving || !protestReference.trim()}>
                      Register
                    </Button>
                  </form>
                ) : (
                  <p className="text-xs text-vscode-text-muted">The score protest registration window is closed.</p>
                )}

                {status.openProtestReferences.map((reference) => (
                  <div key={reference} className="rounded-[3px] border border-vscode-warning/50 p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-vscode-warning">{reference}</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => setSelectedProtest(reference)}
                      >
                        Resolve
                      </Button>
                    </div>
                    {selectedProtest === reference && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          aria-label={`Resolution for ${reference}`}
                          className={`${inputClass} min-h-16 resize-y`}
                          required
                          value={resolution}
                          onChange={(event) => setResolution(event.target.value)}
                        />
                        <Button
                          size="sm"
                          disabled={saving || !resolution.trim() || !officialName.trim()}
                          onClick={resolveProtest}
                        >
                          Append resolution
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {status.issues.length > 0 && (
              <section className="space-y-2 border-t border-vscode-border pt-4">
                <h3 className="text-[13px] font-semibold text-vscode-text">
                  {status.status === 'OFFICIAL' ? 'Official publication review' : 'Official publication blockers'}
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-xs text-vscode-text-muted">
                  {status.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2 border-t border-vscode-border pt-4">
              <div className="flex items-center gap-2">
                <History size={15} aria-hidden="true" />
                <h3 className="text-[13px] font-semibold text-vscode-text">Append-only history</h3>
              </div>
              {status.history.length === 0 ? (
                <p className="text-xs text-vscode-text-muted">No publication entries yet.</p>
              ) : (
                <ol className="space-y-1 text-xs text-vscode-text-muted">
                  {status.history.map((entry) => (
                    <li key={entry.id}>
                      {formatDate(entry.recordedAt)} · {entry.type.replaceAll('_', ' ')}
                      {entry.type === 'PRELIMINARY_PUBLISHED' && entry.postingLocation && (
                        <span>
                          {' '}
                          · Posted {formatDate(entry.postedAt)} · {entry.postingLocation}
                          {entry.postingReference ? ` · ${entry.postingReference}` : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm">Review target observations</summary>
        <ObservationReviewsPanel key={eventId} eventId={eventId} resultScope="QUALIFICATION" />
      </details>
    </Modal>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3px] border border-vscode-border p-3">
      <p className="text-xs text-vscode-text-muted">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-vscode-text">{value}</p>
    </div>
  );
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}
