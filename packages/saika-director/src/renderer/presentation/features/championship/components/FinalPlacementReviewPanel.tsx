import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { finalPlacementReviewService } from '@/renderer/services';
import type { FinalPlacementReviewStatusDto } from '@/shared/ipc/contracts';
import { Button } from '../../shared/common/Button';
import { Modal } from '../../shared/common/Modal';

interface FinalPlacementReviewPanelProps {
  eventId: string;
  eventName?: string;
  onClose: () => void;
  onChanged: () => void;
}

const inputClass =
  'w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text focus:border-vscode-focus focus:outline-none';

export function FinalPlacementReviewPanel({
  eventId,
  eventName,
  onClose,
  onChanged,
}: FinalPlacementReviewPanelProps) {
  const [status, setStatus] = useState<FinalPlacementReviewStatusDto | null>(null);
  const [ranks, setRanks] = useState<Record<string, string>>({});
  const [ruleReference, setRuleReference] = useState('6.17');
  const [statement, setStatement] = useState('Final placements reviewed against elimination and shoot-off history');
  const [officialName, setOfficialName] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [showRevocation, setShowRevocation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await finalPlacementReviewService.getStatus({ eventId });
      if (!response.success) throw new Error(response.error.message);
      setStatus(response.data);
      setRanks(
        Object.fromEntries(
          response.data.results
            .filter((result) => result.classificationCode === null)
            .map((result) => [result.participantId, String(result.rank || result.sourceRank)]),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load Final placement review');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const restoreSourceRanks = useCallback(() => {
    if (!status) return;
    setRanks(
      Object.fromEntries(
        status.results
          .filter((result) => result.classificationCode === null)
          .map((result) => [result.participantId, String(result.sourceRank)]),
      ),
    );
  }, [status]);

  const handleRecord = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!status) return;
      setSaving(true);
      setError(null);
      try {
        const placements = status.results
          .filter((result) => result.classificationCode === null)
          .map((result) => ({
            resultId: result.id,
            participantId: result.participantId,
            rank: Number.parseInt(ranks[result.participantId] ?? '', 10),
          }));
        const response = await finalPlacementReviewService.record({
          eventId,
          scoringRevision: status.scoringRevision,
          placements,
          ruleReference,
          statement,
          officialName,
        });
        if (!response.success) throw new Error(response.error.message);
        await loadStatus();
        onChanged();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to record Final placement review');
      } finally {
        setSaving(false);
      }
    },
    [eventId, loadStatus, officialName, onChanged, ranks, ruleReference, statement, status],
  );

  const handleRevoke = useCallback(async () => {
    if (!status?.currentReview) return;
    setSaving(true);
    setError(null);
    try {
      const response = await finalPlacementReviewService.revoke({
        reviewId: status.currentReview.id,
        ruleReference,
        reason: revokeReason,
        officialName,
      });
      if (!response.success) throw new Error(response.error.message);
      setShowRevocation(false);
      setRevokeReason('');
      await loadStatus();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to revoke Final placement review');
    } finally {
      setSaving(false);
    }
  }, [loadStatus, officialName, onChanged, revokeReason, ruleReference, status?.currentReview]);

  return (
    <Modal isOpen onClose={onClose} title={`Final placement review — ${eventName ?? 'Final'}`}>
      <div className="space-y-5">
        {loading && <p className="text-[13px] text-vscode-text-muted">Loading…</p>}
        {error && <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>}

        {status && (
          <>
            <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-vscode-text-muted">Scoring snapshot</span>
                <code className="text-vscode-text">{status.scoringRevision.slice(0, 12)}</code>
              </div>
              {status.currentReview ? (
                <p className="mt-2 text-vscode-success">
                  Current review recorded by {status.currentReview.officialName}
                </p>
              ) : status.reviewRequired ? (
                <p className="mt-2 text-vscode-warning">A current placement review is required.</p>
              ) : (
                <p className="mt-2 text-vscode-text-muted">No score intervention currently requires review.</p>
              )}
              {status.issues.map((issue) => (
                <p key={issue} className="mt-1 text-vscode-warning">
                  {issue}
                </p>
              ))}
            </section>

            <form onSubmit={handleRecord} className="space-y-3" aria-label="Record Final placement review">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-vscode-text">Explicit placements</h3>
                <Button size="sm" variant="secondary" onClick={restoreSourceRanks}>
                  Restore source ranks
                </Button>
              </div>
              <div className="overflow-auto border border-vscode-border">
                <table className="w-full text-[13px] text-vscode-text">
                  <thead className="bg-vscode-sidebar text-xs">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Athlete</th>
                      <th className="px-2 py-1.5 text-right">Score</th>
                      <th className="px-2 py-1.5 text-center">Source</th>
                      <th className="px-2 py-1.5 text-center">Reviewed rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.results.map((result) => (
                      <tr key={result.id} className="border-t border-vscode-border">
                        <td className="px-2 py-1.5">
                          {result.playerName}
                          {result.scoreAdjustment > 0 && (
                            <span className="ml-2 text-xs text-vscode-warning">
                              −{result.scoreAdjustment.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {result.classificationCode ?? result.totalScore.toFixed(1)}
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{result.sourceRank}</td>
                        <td className="px-2 py-1.5 text-center">
                          {result.classificationCode ? (
                            <span className="text-vscode-error">{result.classificationCode}</span>
                          ) : (
                            <input
                              aria-label={`Reviewed rank for ${result.playerName}`}
                              className={`${inputClass} mx-auto w-20 text-center tabular-nums`}
                              type="number"
                              min="1"
                              required
                              value={ranks[result.participantId] ?? ''}
                              onChange={(event) =>
                                setRanks((current) => ({
                                  ...current,
                                  [result.participantId]: event.target.value,
                                }))
                              }
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-vscode-text-muted">
                  ISSF rule reference
                  <input
                    className={`${inputClass} mt-1`}
                    required
                    value={ruleReference}
                    onChange={(event) => setRuleReference(event.target.value)}
                  />
                </label>
                <label className="text-xs text-vscode-text-muted">
                  Official / Jury member
                  <input
                    className={`${inputClass} mt-1`}
                    required
                    value={officialName}
                    onChange={(event) => setOfficialName(event.target.value)}
                  />
                </label>
              </div>
              <label className="block text-xs text-vscode-text-muted">
                Review statement
                <textarea
                  className={`${inputClass} mt-1 min-h-14 resize-y`}
                  required
                  value={statement}
                  onChange={(event) => setStatement(event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2">
                {status.currentReview && (
                  <Button type="button" size="sm" variant="danger" onClick={() => setShowRevocation(true)}>
                    Revoke current review
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={saving || status.results.length === 0}>
                  {saving ? 'Saving…' : status.currentReview ? 'Record amended placements' : 'Record placement review'}
                </Button>
              </div>
            </form>

            {showRevocation && status.currentReview && (
              <section className="space-y-2 rounded-[3px] border border-vscode-error/50 bg-vscode-error/5 p-3">
                <label className="block text-xs text-vscode-text-muted">
                  Revocation reason
                  <textarea
                    className={`${inputClass} mt-1 min-h-14 resize-y`}
                    required
                    value={revokeReason}
                    onChange={(event) => setRevokeReason(event.target.value)}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setShowRevocation(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={saving || !revokeReason.trim() || !officialName.trim() || !ruleReference.trim()}
                    onClick={handleRevoke}
                  >
                    Append revocation
                  </Button>
                </div>
              </section>
            )}

            <section className="space-y-2 border-t border-vscode-border pt-4">
              <h3 className="text-[13px] font-semibold text-vscode-text">Review history</h3>
              {status.reviewHistory.length === 0 && (
                <p className="text-xs text-vscode-text-muted">No Final placement reviews.</p>
              )}
              {status.reviewHistory.map((entry) => (
                <div key={entry.id} className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className={entry.current ? 'font-semibold text-vscode-success' : 'text-vscode-text'}>
                      {entry.type === 'REVIEW' ? 'Placement review' : 'Revocation'}
                    </span>
                    <span className="text-vscode-text-muted">
                      {entry.current ? 'Current' : entry.active ? 'Stale' : 'History'}
                    </span>
                  </div>
                  <p className="mt-1 text-vscode-text">{entry.statement}</p>
                  <p className="mt-1 text-vscode-text-muted">
                    Rule {entry.ruleReference} · {entry.officialName} · {new Date(entry.recordedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
