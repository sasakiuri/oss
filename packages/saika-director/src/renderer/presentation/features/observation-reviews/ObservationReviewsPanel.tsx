import { useCallback, useEffect, useRef, useState } from 'react';
import { observationReviewsService } from '@/renderer/services';
import type { ObservationReviewItemDto } from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

type Props =
  | { competitionId: string; eventId?: never; resultScope?: never }
  | { competitionId?: never; eventId: string; resultScope: 'QUALIFICATION' | 'FINAL' };
export function ObservationReviewsPanel({ competitionId, eventId, resultScope }: Props) {
  const [items, setItems] = useState<ObservationReviewItemDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('');
  const [correctionId, setCorrectionId] = useState('');
  const [action, setAction] = useState<'NO_SCORE_CHANGE' | 'SCORE_CORRECTION' | 'REOPEN'>('NO_SCORE_CHANGE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const response = await (competitionId
        ? observationReviewsService.list({ competitionId })
        : observationReviewsService.listEvent({ eventId: eventId!, resultScope: resultScope! }));
      if (request !== generation.current) return;
      if (!response.success) throw new Error(response.error.message);
      setItems(response.data);
      setError(null);
    } catch (caught) {
      if (request === generation.current) setError(String(caught));
    }
  }, [competitionId, eventId, resultScope]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  const selected = items.find((item) => item.subject.id === selectedId);
  const record = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const response = await observationReviewsService.record({
        id: crypto.randomUUID(),
        competitionId: selected.subject.competitionId,
        subjectId: selected.subject.id,
        subjectRevision: selected.subject.revision,
        previousReviewId: selected.latest?.id ?? null,
        action,
        correctionId: action === 'SCORE_CORRECTION' ? correctionId : null,
        officialName,
        statement,
      });
      if (!response.success) throw new Error(response.error.message);
      setStatement('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Target observation review" className="space-y-3 border-t border-vscode-border pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Target observation review ({items.filter((item) => !item.resolved).length} pending)
        </h3>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void refresh()}>
          Refresh review
        </Button>
      </div>
      <p className="text-xs text-vscode-text-muted">
        Review unscored shots and firing-window detections. Record a no-change decision or link a current Jury score
        correction. Reopening a review preserves its history.
      </p>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="space-y-2 text-xs">
        <label className="block">
          Observation
          <select
            aria-label="Observation to review"
            className="input-base mt-1 w-full"
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setStatement('');
              setCorrectionId('');
              setAction('NO_SCORE_CHANGE');
            }}
          >
            <option value="">Select evidence</option>
            {items.map((item) => (
              <option key={item.subject.id} value={item.subject.id}>
                {item.resolved ? 'Reviewed' : 'Pending'} · {item.subject.laneId.slice(0, 8)} ·{' '}
                {item.subject.kind.replaceAll('_', ' ')} · {item.subject.occurredAt}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <>
            <p>{selected.subject.detail}</p>
            <p className="break-all">Evidence reference: {selected.subject.evidenceReference}</p>
            {selected.issue && <p role="status">{selected.issue}</p>}
            <label className="block">
              Review action
              <select
                aria-label="Review action"
                className="input-base mt-1 w-full"
                value={action}
                onChange={(event) => setAction(event.target.value as typeof action)}
              >
                <option value="NO_SCORE_CHANGE">No score change after official review</option>
                <option value="SCORE_CORRECTION">Score correction applied</option>
                <option value="REOPEN" disabled={!selected.latest}>
                  Reopen for review
                </option>
              </select>
            </label>
            {action === 'SCORE_CORRECTION' && (
              <label className="block">
                Applied correction ID
                <input
                  aria-label="Applied correction ID"
                  className="input-base mt-1 w-full"
                  value={correctionId}
                  onChange={(event) => setCorrectionId(event.target.value)}
                />
                <span className="block text-vscode-text-muted">
                  Use the score correction in Results and include the exact evidence reference above on the corrected
                  shot.
                </span>
              </label>
            )}
            <label className="block">
              Official
              <input
                aria-label="Review official"
                className="input-base mt-1 w-full"
                value={officialName}
                onChange={(event) => setOfficialName(event.target.value)}
              />
            </label>
            <label className="block">
              Decision and reasons
              <textarea
                aria-label="Review statement"
                className="input-base mt-1 w-full"
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
              />
            </label>
            <Button
              size="sm"
              disabled={
                !officialName.trim() || !statement.trim() || (action === 'SCORE_CORRECTION' && !correctionId.trim())
              }
              onClick={() => void record()}
            >
              Record official review
            </Button>
            {selected.reviews.length > 0 && (
              <details>
                <summary>Review history</summary>
                <ul>
                  {selected.reviews.map((review) => (
                    <li key={review.id} className="mt-2">
                      {review.recordedAt} · {review.officialName} · {review.action.replaceAll('_', ' ')}:{' '}
                      {review.statement}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </fieldset>
    </section>
  );
}
