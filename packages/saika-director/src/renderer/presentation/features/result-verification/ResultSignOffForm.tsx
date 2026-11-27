import { useCallback, useState } from 'react';
import { CheckCircle2, History, ShieldCheck } from 'lucide-react';

import type { OfficialSigningMethod, ResultScope, ResultVerificationStatusDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { fullWidthInputClass } from '../shared/common/formClasses';
import { officialSigningRequest } from '../shared/common/officialSigningRequest';

import type { ResultVerificationCommands } from './useResultVerification';

/** Approves the current result-list revision or revokes its approval, with the signature evidence. */
export function ResultSignOffForm({
  eventId,
  resultScope,
  status,
  saving,
  commands,
}: {
  eventId: string;
  resultScope: ResultScope;
  status: ResultVerificationStatusDto;
  saving: boolean;
  commands: Pick<ResultVerificationCommands, 'approve' | 'revokeApproval'>;
}) {
  const [approvalOfficialName, setApprovalOfficialName] = useState('');
  const [revocationOfficialName, setRevocationOfficialName] = useState('');
  const [approvalStatement, setApprovalStatement] = useState(
    `Official ${resultScope === 'FINAL' ? 'Final' : 'Qualification'} Results verified for accuracy in accordance with ISSF 6.14.5 and 6.14.8.`,
  );
  const [revocationReason, setRevocationReason] = useState('');
  const [showRevocation, setShowRevocation] = useState(false);
  const [signatureMethod, setSignatureMethod] = useState<OfficialSigningMethod>('SELF');
  const [signatureRecorder, setSignatureRecorder] = useState('');
  const [signatureReference, setSignatureReference] = useState('');
  const signatureIncomplete = signatureMethod === 'EXTERNAL' && !signatureReference.trim();

  const resetSignature = useCallback(() => {
    setSignatureMethod('SELF');
    setSignatureRecorder('');
    setSignatureReference('');
  }, []);

  const approve = () =>
    commands.approve(
      {
        eventId,
        resultScope,
        snapshotRevision: status.snapshotRevision,
        statement: approvalStatement,
        officialName: approvalOfficialName,
        ...officialSigningRequest(signatureMethod, signatureRecorder, signatureReference),
      },
      resetSignature,
    );

  const revoke = () => {
    if (!status.currentApproval) return;
    return commands.revokeApproval(
      {
        approvalId: status.currentApproval.id,
        reason: revocationReason,
        officialName: revocationOfficialName,
        ...officialSigningRequest(signatureMethod, signatureRecorder, signatureReference),
      },
      () => {
        resetSignature();
        setShowRevocation(false);
        setRevocationReason('');
        setRevocationOfficialName('');
      },
    );
  };

  return (
    <section className="space-y-3 border-t border-vscode-border pt-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} aria-hidden="true" />
        <h3 className="text-[13px] font-semibold text-vscode-text">Official Results sign-off</h3>
      </div>
      {(!status.currentApproval || showRevocation) && (
        <div className="space-y-2 text-xs text-vscode-text-muted">
          <p>
            Personal signatures use the signed-in operator and require the RTS Jury role. With access control disabled,
            the entered name is recorded as a manual confirmation.
          </p>
          <label className="block">
            Signature method
            <select
              className={`${fullWidthInputClass} mt-1`}
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
                  className={`${fullWidthInputClass} mt-1`}
                  value={signatureRecorder}
                  onChange={(event) => setSignatureRecorder(event.target.value)}
                />
              </label>
              <label>
                Signed form / signature evidence reference
                <input
                  className={`${fullWidthInputClass} mt-1`}
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
                  className={`${fullWidthInputClass} mt-1`}
                  required
                  value={revocationOfficialName}
                  onChange={(event) => setRevocationOfficialName(event.target.value)}
                />
              </label>
              <textarea
                aria-label="Approval revocation reason"
                className={`${fullWidthInputClass} min-h-14 resize-y`}
                required
                value={revocationReason}
                onChange={(event) => setRevocationReason(event.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={saving || signatureIncomplete || !revocationReason.trim() || !revocationOfficialName.trim()}
                  onClick={revoke}
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
              className={`${fullWidthInputClass} mt-1`}
              required
              value={approvalOfficialName}
              onChange={(event) => setApprovalOfficialName(event.target.value)}
            />
          </label>
          <label className="block text-xs text-vscode-text-muted">
            Accuracy statement
            <textarea
              className={`${fullWidthInputClass} mt-1 min-h-16 resize-y`}
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
  );
}
