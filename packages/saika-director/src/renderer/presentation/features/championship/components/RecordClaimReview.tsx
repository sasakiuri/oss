import { useEffect, useState } from 'react';

import type { ResultsBookWorkspaceDto } from '@/shared/ipc/contracts';

import { inputClass, stackedLabelClass } from '../../shared/common/formClasses';

import { RecordClaimActions } from './RecordClaimActions';
import { ResultsBookField } from './ResultsBookField';
import {
  type RecordClaim,
  type RecordEntryType,
  recordBasisLabel,
  recordSubjectLabel,
} from './resultsBookPresentation';
import type { ResultsBookCommands } from './useResultsBookWorkspace';

interface RecordClaimReviewProps {
  officials: ResultsBookWorkspaceDto['officials'] | undefined;
  recordClaims: RecordClaim[] | undefined;
  busy: boolean;
  appendRecordClaimEntry: ResultsBookCommands['appendRecordClaimEntry'];
}

/** Lists the record claims and appends Technical Delegate, submission and verification entries. */
export function RecordClaimReview({ officials, recordClaims, busy, appendRecordClaimEntry }: RecordClaimReviewProps) {
  const [claimActor, setClaimActor] = useState('');
  const [claimStatement, setClaimStatement] = useState('Evidence reviewed and action recorded');
  const [technicalReference, setTechnicalReference] = useState('');
  const [technicalDelegateId, setTechnicalDelegateId] = useState('');

  // Keep an active Technical Delegate selected.
  useEffect(() => {
    if (!officials) return;
    const delegates = officials.filter((official) => official.role === 'TECHNICAL_DELEGATE');
    if (!delegates.some((official) => official.appointmentId === technicalDelegateId)) {
      setTechnicalDelegateId(delegates[0]?.appointmentId ?? '');
    }
  }, [officials, technicalDelegateId]);

  const appendClaimEntry = async (claim: RecordClaim, type: RecordEntryType) => {
    const delegate = officials?.find((official) => official.appointmentId === technicalDelegateId);
    await appendRecordClaimEntry({
      claimId: claim.id,
      type,
      statement: claimStatement.trim(),
      officialName: type === 'TD_CONFIRMED' ? (delegate?.officialName ?? '') : claimActor.trim(),
      ...(type === 'TD_CONFIRMED' && delegate ? { appointmentId: delegate.appointmentId } : {}),
      ...((type === 'TECHNICAL_COMMITTEE_VERIFIED' || (type === 'VOID' && claim.status === 'VERIFIED')) &&
      technicalReference.trim()
        ? { reference: technicalReference.trim() }
        : {}),
    });
  };

  const delegates = officials?.filter((official) => official.role === 'TECHNICAL_DELEGATE') ?? [];

  return (
    <>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className={stackedLabelClass}>
          Technical Delegate for confirmation
          <select
            className={inputClass}
            value={technicalDelegateId}
            onChange={(event) => setTechnicalDelegateId(event.target.value)}
          >
            <option value="">Select active TD</option>
            {delegates.map((official) => (
              <option key={official.appointmentId} value={official.appointmentId}>
                {official.officialName}
              </option>
            ))}
          </select>
        </label>
        <ResultsBookField label="Actor for other actions" value={claimActor} onChange={setClaimActor} />
        <ResultsBookField label="Action statement" value={claimStatement} onChange={setClaimStatement} />
        <ResultsBookField
          label="Technical Committee reference"
          value={technicalReference}
          onChange={setTechnicalReference}
        />
      </div>
      <ul className="mt-3 space-y-2">
        {recordClaims?.map((claim) => (
          <li key={claim.id} className="rounded-[3px] border border-vscode-border p-3 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-vscode-text">
                  {claim.code} · {claim.source.eventName} · {recordSubjectLabel(claim.source.subjectKind)} ·{' '}
                  {claim.source.subjectName} · {(claim.source.scoreX10 / 10).toFixed(1)}
                </p>
                <p className="mt-1 text-vscode-text-muted">
                  {claim.status} · {recordBasisLabel(claim.resultBasis)} · {claim.ruleReference}
                </p>
                {claim.source.members?.length ? (
                  <p className="mt-1 text-vscode-text-muted">
                    Members:{' '}
                    {claim.source.members
                      .map((member) => `${member.playerName} ${(member.scoreX10 / 10).toFixed(1)}`)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
              <RecordClaimActions
                claim={claim}
                busy={busy}
                hasActor={Boolean(claimActor.trim() && claimStatement.trim())}
                hasDelegate={Boolean(technicalDelegateId && claimStatement.trim())}
                hasTechnicalReference={Boolean(claimActor.trim() && claimStatement.trim() && technicalReference.trim())}
                onAction={(type) => void appendClaimEntry(claim, type)}
              />
            </div>
          </li>
        ))}
        {recordClaims?.length === 0 && <li className="text-xs text-vscode-text-muted">No record claims.</li>}
      </ul>
    </>
  );
}
