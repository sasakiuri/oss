import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, History, ShieldCheck, TriangleAlert } from 'lucide-react';

import { resultVerificationService } from '@/renderer/services';
import type { ResultVerificationStatusDto, VerificationResultItemDto } from '@/shared/ipc/contracts';
import { Button } from '../../shared/common/Button';
import { Modal } from '../../shared/common/Modal';

interface ResultVerificationPanelProps {
  eventId: string;
  eventName?: string;
  resultScope: 'QUALIFICATION' | 'FINAL';
  onClose: () => void;
}

const inputClass =
  'w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text focus:border-vscode-focus focus:outline-none';

export function ResultVerificationPanel({ eventId, eventName, resultScope, onClose }: ResultVerificationPanelProps) {
  const [status, setStatus] = useState<ResultVerificationStatusDto | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkOfficialName, setCheckOfficialName] = useState('');
  const [approvalOfficialName, setApprovalOfficialName] = useState('');
  const [revocationOfficialName, setRevocationOfficialName] = useState('');
  const [evidenceSource, setEvidenceSource] = useState<'TARGET_PRINTOUT' | 'INDEPENDENT_MEMORY' | 'OTHER'>(
    'INDEPENDENT_MEMORY',
  );
  const [evidenceReference, setEvidenceReference] = useState('');
  const [comparisonStatus, setComparisonStatus] = useState<'MATCHED' | 'MISMATCH' | 'UNAVAILABLE'>('MATCHED');
  const [manualInterventionsReviewed, setManualInterventionsReviewed] = useState(false);
  const [note, setNote] = useState('');
  const [approvalStatement, setApprovalStatement] = useState(
    `Official ${resultScope === 'FINAL' ? 'Final' : 'Qualification'} Results verified for accuracy in accordance with ISSF 6.14.5 and 6.14.8.`,
  );
  const [revocationReason, setRevocationReason] = useState('');
  const [showRevocation, setShowRevocation] = useState(false);
  const [signatureMethod, setSignatureMethod] = useState<'SELF' | 'EXTERNAL'>('SELF');
  const [signatureRecorder, setSignatureRecorder] = useState('');
  const [signatureReference, setSignatureReference] = useState('');
  const signatureIncomplete = signatureMethod === 'EXTERNAL' && !signatureReference.trim();

  const resetSignature = useCallback(() => {
    setSignatureMethod('SELF');
    setSignatureRecorder('');
    setSignatureReference('');
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await resultVerificationService.getStatus({ eventId, resultScope });
      if (!response.success) throw new Error(response.error.message);
      setStatus(response.data);
      setSelectedResultId((current) => {
        if (current && response.data.results.some((result) => result.resultId === current)) return current;
        return (
          response.data.results.find((result) => result.required && !result.currentCheck?.qualifies)?.resultId ??
          response.data.results.find((result) => result.required)?.resultId ??
          null
        );
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load result verification status');
    } finally {
      setLoading(false);
    }
  }, [eventId, resultScope]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const requiredResults = useMemo(() => status?.results.filter((result) => result.required) ?? [], [status]);
  const selectedResult = useMemo(
    () => status?.results.find((result) => result.resultId === selectedResultId) ?? null,
    [selectedResultId, status],
  );

  const selectResult = useCallback((result: VerificationResultItemDto) => {
    setSelectedResultId(result.resultId);
    setEvidenceSource(result.currentCheck?.evidenceSource ?? 'INDEPENDENT_MEMORY');
    setEvidenceReference(result.currentCheck?.evidenceReference ?? '');
    setComparisonStatus(result.currentCheck?.comparisonStatus ?? 'MATCHED');
    setManualInterventionsReviewed(result.currentCheck?.manualInterventionsReviewed ?? false);
    setNote(result.currentCheck?.note ?? '');
  }, []);

  const submitCheck = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!selectedResult) return;
      setSaving(true);
      setError(null);
      try {
        const response = await resultVerificationService.addCheck({
          eventId,
          resultScope,
          resultId: selectedResult.resultId,
          resultRevision: selectedResult.revision,
          evidenceSource,
          evidenceReference,
          comparisonStatus,
          manualInterventionsReviewed,
          ...(note.trim() ? { note } : {}),
          officialName: checkOfficialName,
        });
        if (!response.success) throw new Error(response.error.message);
        await loadStatus();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Failed to append the verification check');
      } finally {
        setSaving(false);
      }
    },
    [
      comparisonStatus,
      eventId,
      evidenceReference,
      evidenceSource,
      loadStatus,
      manualInterventionsReviewed,
      note,
      checkOfficialName,
      resultScope,
      selectedResult,
    ],
  );

  const approve = useCallback(async () => {
    if (!status) return;
    setSaving(true);
    setError(null);
    try {
      const response = await resultVerificationService.approve({
        eventId,
        resultScope,
        snapshotRevision: status.snapshotRevision,
        statement: approvalStatement,
        officialName: approvalOfficialName,
        method: signatureMethod,
        ...(signatureMethod === 'EXTERNAL'
          ? {
              ...(signatureRecorder.trim() ? { recordedBy: signatureRecorder } : {}),
              evidenceReference: signatureReference,
            }
          : {}),
      });
      if (!response.success) throw new Error(response.error.message);
      resetSignature();
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to approve the result list');
    } finally {
      setSaving(false);
    }
  }, [
    approvalOfficialName,
    approvalStatement,
    eventId,
    loadStatus,
    resultScope,
    status,
    signatureMethod,
    signatureRecorder,
    signatureReference,
    resetSignature,
  ]);

  const revokeApproval = useCallback(async () => {
    if (!status?.currentApproval) return;
    setSaving(true);
    setError(null);
    try {
      const response = await resultVerificationService.revokeApproval({
        approvalId: status.currentApproval.id,
        reason: revocationReason,
        officialName: revocationOfficialName,
        method: signatureMethod,
        ...(signatureMethod === 'EXTERNAL'
          ? {
              ...(signatureRecorder.trim() ? { recordedBy: signatureRecorder } : {}),
              evidenceReference: signatureReference,
            }
          : {}),
      });
      if (!response.success) throw new Error(response.error.message);
      resetSignature();
      setShowRevocation(false);
      setRevocationReason('');
      setRevocationOfficialName('');
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to revoke the result-list approval');
    } finally {
      setSaving(false);
    }
  }, [
    loadStatus,
    revocationOfficialName,
    revocationReason,
    status,
    signatureMethod,
    signatureRecorder,
    signatureReference,
    resetSignature,
  ]);

  return (
    <Modal isOpen onClose={onClose} title={`RTS result verification${eventName ? ` — ${eventName}` : ''}`} size="xl">
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Required individual checks"
            value={`${status?.checkedIndividualResults ?? 0} / ${status?.requiredIndividualChecks ?? 0}`}
          />
          <SummaryCard
            label={resultScope === 'FINAL' ? 'Final results complete' : 'All results confirmed'}
            value={status?.allResultsConfirmed ? 'Yes' : 'No'}
          />
          <SummaryCard
            label="Independent team checks"
            value={
              status && status.configuredTeamChecks > 0
                ? status.teamVerificationSupported
                  ? `${status.checkedTeamResults} / ${status.requiredTeamChecks}`
                  : 'Unsupported'
                : 'Not required'
            }
          />
          <SummaryCard
            label="RTS Jury approval"
            value={
              status?.currentApproval
                ? 'Current'
                : status?.approvalHistory.some((entry) => entry.active)
                  ? 'Stale'
                  : 'None'
            }
          />
        </section>

        {error && <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>}
        {loading && <p className="text-[13px] text-vscode-text-muted">Loading verification status…</p>}

        {status && status.issues.length > 0 && (
          <div className="rounded-[3px] border border-vscode-warning/50 bg-vscode-warning/5 p-3 text-xs text-vscode-text">
            <div className="flex items-center gap-2 font-semibold">
              <TriangleAlert size={14} aria-hidden="true" /> Approval requirements
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-vscode-text-muted">
              {status.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {status && status.configuredTeamChecks > 0 && (
          <div className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3 text-xs text-vscode-text-muted">
            ISSF 6.14.8 team comparison is supplied by the EST backup workflow. Only a verified printout or
            independent-memory run for the current top-team snapshot qualifies; use{' '}
            <span className="font-medium text-vscode-text">EST backup</span> on the results toolbar to append one.
          </div>
        )}

        {status && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[13px] font-semibold text-vscode-text">ISSF 6.14.8 required result checks</h3>
              <span className="text-xs text-vscode-text-muted">Top {status.configuredIndividualChecks}</span>
            </div>
            <div className="overflow-auto rounded-[3px] border border-vscode-border">
              <table className="w-full text-xs text-vscode-text">
                <thead className="bg-vscode-sidebar">
                  <tr className="border-b border-vscode-border">
                    <th className="px-2 py-2 text-center">Rank</th>
                    <th className="px-2 py-2 text-left">Athlete</th>
                    <th className="px-2 py-2 text-right">Score</th>
                    <th className="px-2 py-2 text-left">Stored evidence</th>
                    <th className="px-2 py-2 text-center">Interventions</th>
                    <th className="px-2 py-2 text-center">Check</th>
                    <th className="px-2 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {requiredResults.map((result) => (
                    <tr key={result.resultId} className="border-b border-vscode-border last:border-b-0">
                      <td className="px-2 py-2 text-center tabular-nums">{result.rank}</td>
                      <td className="px-2 py-2">
                        <span className="font-medium">{result.playerName}</span>
                        <span className="block text-vscode-text-muted">{result.affiliation}</span>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">
                        {result.totalScore.toFixed(1)}
                      </td>
                      <td className="px-2 py-2 text-vscode-text-muted">
                        linked {result.evidenceSummary.linkedShots}/{result.evidenceSummary.expectedShots}
                        <span className="block">
                          decimal {result.evidenceSummary.independentDecimalShots} · inner ten{' '}
                          {result.evidenceSummary.innerTenClassifiedShots} · conflicts{' '}
                          {result.evidenceSummary.scoreConflicts}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">{result.decisionCount}</td>
                      <td className="px-2 py-2 text-center">
                        <CheckStatus result={result} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={result.status !== 'confirmed'}
                          onClick={() => selectResult(result)}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {requiredResults.length === 0 && (
              <p className="text-xs text-vscode-text-muted">No ranked qualification result is available.</p>
            )}
          </section>
        )}

        {selectedResult && (
          <form onSubmit={submitCheck} className="space-y-3 border-t border-vscode-border pt-4">
            <h3 className="text-[13px] font-semibold text-vscode-text">
              Append comparison — #{selectedResult.rank} {selectedResult.playerName}
            </h3>
            <p className="text-xs text-vscode-text-muted">
              Stored MQTT evidence is diagnostic context. Enter the target printout or independent-memory reference
              actually used by the RTS Jury. Other evidence is retained for audit but does not satisfy ISSF 6.14.8.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-vscode-text-muted">
                Independent source
                <select
                  className={`${inputClass} mt-1`}
                  value={evidenceSource}
                  onChange={(event) => setEvidenceSource(event.target.value as typeof evidenceSource)}
                >
                  <option value="TARGET_PRINTOUT">Target printout</option>
                  <option value="INDEPENDENT_MEMORY">Independent memory</option>
                  <option value="OTHER">Other evidence (audit only)</option>
                </select>
              </label>
              <label className="text-xs text-vscode-text-muted sm:col-span-2">
                Source reference / printout ID
                <input
                  className={`${inputClass} mt-1`}
                  required
                  value={evidenceReference}
                  onChange={(event) => setEvidenceReference(event.target.value)}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-vscode-text-muted">
                Score comparison
                <select
                  className={`${inputClass} mt-1`}
                  value={comparisonStatus}
                  onChange={(event) => setComparisonStatus(event.target.value as typeof comparisonStatus)}
                >
                  <option value="MATCHED">Matched</option>
                  <option value="MISMATCH">Mismatch found</option>
                  <option value="UNAVAILABLE">Unable to compare</option>
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-xs text-vscode-text">
                <input
                  type="checkbox"
                  checked={manualInterventionsReviewed}
                  onChange={(event) => setManualInterventionsReviewed(event.target.checked)}
                />
                Reviewed all {selectedResult.decisionCount} manual intervention(s)
              </label>
            </div>
            <label className="block text-xs text-vscode-text-muted">
              Verification note
              <textarea
                className={`${inputClass} mt-1 min-h-14 resize-y`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <label className="block text-xs text-vscode-text-muted">
              RTS Jury member
              <input
                className={`${inputClass} mt-1`}
                required
                value={checkOfficialName}
                onChange={(event) => setCheckOfficialName(event.target.value)}
              />
            </label>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saving || selectedResult.status !== 'confirmed'}>
                {saving ? 'Saving…' : 'Append verification check'}
              </Button>
            </div>
          </form>
        )}

        {status && (
          <section className="space-y-3 border-t border-vscode-border pt-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} aria-hidden="true" />
              <h3 className="text-[13px] font-semibold text-vscode-text">Official Results sign-off</h3>
            </div>
            {(!status.currentApproval || showRevocation) && (
              <div className="space-y-2 text-xs text-vscode-text-muted">
                <p>
                  Personal signatures use the signed-in operator and require the RTS Jury role. With access control
                  disabled, the entered name is recorded as a manual confirmation.
                </p>
                <label className="block">
                  Signature method
                  <select
                    className={`${inputClass} mt-1`}
                    value={signatureMethod}
                    onChange={(event) => setSignatureMethod(event.target.value as typeof signatureMethod)}
                  >
                    <option value="SELF">Personal signature / manual confirmation</option>
                    <option value="EXTERNAL">Record an external signature</option>
                  </select>
                </label>
                {signatureMethod === 'EXTERNAL' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      Recorded by (when signed out)
                      <input
                        className={`${inputClass} mt-1`}
                        value={signatureRecorder}
                        onChange={(event) => setSignatureRecorder(event.target.value)}
                      />
                    </label>
                    <label>
                      Signed form / signature evidence reference
                      <input
                        className={`${inputClass} mt-1`}
                        required
                        value={signatureReference}
                        onChange={(event) => setSignatureReference(event.target.value)}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
            {status.currentApproval ? (
              <div className="rounded-[3px] border border-vscode-success/50 bg-vscode-success/5 p-3 text-xs">
                <p className="font-semibold text-vscode-success">Current result-list revision approved</p>
                <p className="mt-1 text-vscode-text">{status.currentApproval.statement}</p>
                <p className="mt-1 text-vscode-text-muted">
                  {status.currentApproval.officialName} · {new Date(status.currentApproval.recordedAt).toLocaleString()}
                </p>
                {!showRevocation ? (
                  <Button
                    size="sm"
                    variant="danger"
                    className="mt-3"
                    onClick={() => {
                      resetSignature();
                      setShowRevocation(true);
                    }}
                  >
                    Revoke approval
                  </Button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <label className="block text-vscode-text-muted">
                      Revoking RTS Jury member
                      <input
                        className={`${inputClass} mt-1`}
                        required
                        value={revocationOfficialName}
                        onChange={(event) => setRevocationOfficialName(event.target.value)}
                      />
                    </label>
                    <textarea
                      aria-label="Approval revocation reason"
                      className={`${inputClass} min-h-14 resize-y`}
                      required
                      value={revocationReason}
                      onChange={(event) => setRevocationReason(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={
                          saving || signatureIncomplete || !revocationReason.trim() || !revocationOfficialName.trim()
                        }
                        onClick={revokeApproval}
                      >
                        Append revocation
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setShowRevocation(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs text-vscode-text-muted">
                  Approving RTS Jury member
                  <input
                    className={`${inputClass} mt-1`}
                    required
                    value={approvalOfficialName}
                    onChange={(event) => setApprovalOfficialName(event.target.value)}
                  />
                </label>
                <label className="block text-xs text-vscode-text-muted">
                  Accuracy statement
                  <textarea
                    className={`${inputClass} mt-1 min-h-16 resize-y`}
                    required
                    value={approvalStatement}
                    onChange={(event) => setApprovalStatement(event.target.value)}
                  />
                </label>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={
                      !status.readyForApproval ||
                      !approvalOfficialName.trim() ||
                      !approvalStatement.trim() ||
                      saving ||
                      signatureIncomplete
                    }
                    onClick={approve}
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                    Approve this result-list revision
                  </Button>
                </div>
              </div>
            )}

            {status.approvalHistory.length > 0 && (
              <details className="text-xs text-vscode-text-muted">
                <summary className="flex cursor-pointer items-center gap-2 text-vscode-text">
                  <History size={13} aria-hidden="true" /> Approval audit history ({status.approvalHistory.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {status.approvalHistory.map((entry) => (
                    <div key={entry.id} className="border-l-2 border-vscode-border pl-3">
                      <span className="font-medium text-vscode-text">{entry.type}</span> · {entry.officialName} ·{' '}
                      {new Date(entry.recordedAt).toLocaleString()}
                      <span className="block">{entry.statement}</span>
                      <span className="block">
                        {entry.signingEvidence?.method ?? 'LEGACY'}
                        {entry.signingEvidence && ` · recorded by ${entry.signingEvidence.recordedBy}`}
                        {entry.signingEvidence?.evidenceReference && ` · ${entry.signingEvidence.evidenceReference}`}
                      </span>
                      {entry.type === 'APPROVAL' && entry.active && !entry.current && (
                        <span className="text-vscode-warning">Superseded by a changed result-list revision</span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <p className="text-xs text-vscode-text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-vscode-text">{value}</p>
    </div>
  );
}

function CheckStatus({ result }: { result: VerificationResultItemDto }) {
  if (result.currentCheck?.qualifies) return <span className="text-vscode-success">Matched</span>;
  if (result.currentCheck) return <span className="text-vscode-warning">{result.currentCheck.comparisonStatus}</span>;
  if (result.latestCheck) return <span className="text-vscode-warning">Stale</span>;
  return <span className="text-vscode-text-muted">Unchecked</span>;
}
