import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, BookOpen, Download, RefreshCw, UserPlus } from 'lucide-react';

import { resultsBooksService } from '@/renderer/services';
import type {
  ChampionshipOfficialRoleDto,
  RecordCodeDto,
  RecordResultBasisDto,
  ResultsBookWorkspaceDto,
} from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';

type RecordClaim = ResultsBookWorkspaceDto['recordClaims'][number];
type RecordEntryType = RecordClaim['entries'][number]['type'];

const OFFICIAL_ROLES: readonly ChampionshipOfficialRoleDto[] = [
  'TECHNICAL_DELEGATE',
  'RTS_JURY_CHAIR',
  'COMPETITION_JURY_CHAIR',
  'EQUIPMENT_CONTROL_JURY_CHAIR',
  'RANGE_JURY_CHAIR',
  'RTS_OFFICER',
  'RANGE_OFFICER',
  'ORGANIZING_COMMITTEE',
  'OTHER',
];

const RECORD_CODES: readonly RecordCodeDto[] = [
  'WR',
  'QWR',
  'EWR',
  'EQWR',
  'WRJ',
  'QWRJ',
  'EWRJ',
  'EQWRJ',
  'OR',
  'EOR',
  'QOR',
  'EQOR',
];

const RECORD_RESULT_BASES: readonly { value: RecordResultBasisDto; label: string }[] = [
  { value: 'QUALIFICATION_OR_ELIMINATION', label: 'Qualification / Elimination total' },
  { value: 'FINAL', label: 'Final result' },
  { value: 'RECOGNIZED_NO_FINAL_TOTAL', label: 'Recognized non-Olympic event total (no Final)' },
];

export function ResultsBookPanel({ championshipId }: { championshipId: string }) {
  const [workspace, setWorkspace] = useState<ResultsBookWorkspaceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<ChampionshipOfficialRoleDto>('TECHNICAL_DELEGATE');
  const [officialName, setOfficialName] = useState('');
  const [organization, setOrganization] = useState('');
  const [appointmentStatement, setAppointmentStatement] = useState('Appointment recorded for this championship');
  const [recordedBy, setRecordedBy] = useState('');

  const [resultKey, setResultKey] = useState('');
  const [recordCode, setRecordCode] = useState<RecordCodeDto>('WR');
  const [recordResultBasis, setRecordResultBasis] = useState<RecordResultBasisDto | ''>('');
  const [benchmarkScore, setBenchmarkScore] = useState('');
  const [olympicGamesConfirmed, setOlympicGamesConfirmed] = useState(false);
  const [claimedBy, setClaimedBy] = useState('');
  const [achievedAt, setAchievedAt] = useState(localDateTimeValue());

  const [claimActor, setClaimActor] = useState('');
  const [claimStatement, setClaimStatement] = useState('Evidence reviewed and action recorded');
  const [technicalReference, setTechnicalReference] = useState('');
  const [technicalDelegateId, setTechnicalDelegateId] = useState('');

  const [bookCreatedBy, setBookCreatedBy] = useState('');
  const [signatureStatement, setSignatureStatement] = useState('I certify this Results Book version');
  const [finalizedBy, setFinalizedBy] = useState('');
  const [finalizationStatement, setFinalizationStatement] = useState(
    'Required contents and certification signatures have been verified',
  );

  const load = useCallback(async () => {
    setError(null);
    const response = await resultsBooksService.getWorkspace({ championshipId });
    if (!response.success) setError(response.error.message);
    else setWorkspace(response.data);
  }, [championshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspace) return;
    if (!resultKey && workspace.eligibleRecordResults[0]) {
      setResultKey(recordResultKey(workspace.eligibleRecordResults[0]));
    }
    const delegates = workspace.officials.filter((official) => official.role === 'TECHNICAL_DELEGATE');
    if (!delegates.some((official) => official.appointmentId === technicalDelegateId)) {
      setTechnicalDelegateId(delegates[0]?.appointmentId ?? '');
    }
  }, [resultKey, technicalDelegateId, workspace]);

  const selectedResult = useMemo(
    () => workspace?.eligibleRecordResults.find((result) => recordResultKey(result) === resultKey),
    [resultKey, workspace],
  );

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const appoint = async () => {
    await run(async () => {
      const response = await resultsBooksService.appointOfficial({
        championshipId,
        role,
        officialName: officialName.trim(),
        ...(organization.trim() ? { organization: organization.trim() } : {}),
        statement: appointmentStatement.trim(),
        recordedBy: recordedBy.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setWorkspace(response.data);
      setOfficialName('');
      setOrganization('');
    });
  };

  const revoke = async (appointmentId: string) => {
    await run(async () => {
      const response = await resultsBooksService.revokeOfficial({
        championshipId,
        appointmentId,
        statement: appointmentStatement.trim(),
        recordedBy: recordedBy.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setWorkspace(response.data);
    });
  };

  const createClaim = async () => {
    if (!selectedResult || !recordResultBasis) return;
    await run(async () => {
      const response = await resultsBooksService.createRecordClaim({
        championshipId,
        resultId: selectedResult.resultId,
        resultScope: selectedResult.resultScope,
        code: recordCode,
        resultBasis: recordResultBasis,
        benchmarkScoreX10: scoreX10(benchmarkScore),
        olympicGamesConfirmed,
        claimedBy: claimedBy.trim(),
        achievedAt: new Date(achievedAt).toISOString(),
      });
      if (!response.success) throw new Error(response.error.message);
      setWorkspace(response.data);
      setRecordResultBasis('');
    });
  };

  const appendClaimEntry = async (claim: RecordClaim, type: RecordEntryType) => {
    const delegate = workspace?.officials.find((official) => official.appointmentId === technicalDelegateId);
    await run(async () => {
      const response = await resultsBooksService.appendRecordClaimEntry({
        championshipId,
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
      if (!response.success) throw new Error(response.error.message);
      setWorkspace(response.data);
    });
  };

  const generateBook = async () => {
    await run(async () => {
      const response = await resultsBooksService.generateBook({ championshipId, createdBy: bookCreatedBy.trim() });
      if (!response.success) throw new Error(response.error.message);
      setWorkspace(response.data);
    });
  };

  const signBook = async (bookId: string, appointmentId: string) => {
    await run(async () => {
      const response = await resultsBooksService.signBook({
        championshipId,
        bookId,
        appointmentId,
        statement: signatureStatement.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setWorkspace(response.data);
    });
  };

  const finalizeBook = async (bookId: string) => {
    await run(async () => {
      const response = await resultsBooksService.finalizeBook({
        championshipId,
        bookId,
        officialName: finalizedBy.trim(),
        statement: finalizationStatement.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setWorkspace(response.data);
    });
  };

  const exportBook = async (bookId: string) => {
    await run(async () => {
      const response = await resultsBooksService.exportBook({ bookId });
      if (!response.success) throw new Error(response.error.message);
    });
  };

  const canAppoint = Boolean(officialName.trim() && appointmentStatement.trim() && recordedBy.trim() && !busy);
  const canCreateClaim = Boolean(
    selectedResult &&
    recordResultBasis &&
    claimedBy.trim() &&
    achievedAt &&
    benchmarkScore.trim() &&
    Number.isFinite(Number(benchmarkScore)) &&
    !busy,
  );
  const delegates = workspace?.officials.filter((official) => official.role === 'TECHNICAL_DELEGATE') ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <BookOpen size={16} aria-hidden="true" /> Official Results Book and records
          </h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            ISSF 6.14.4–6.14.5, 6.14.9 and Annex R · append-only appointments, claims and certifications
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}

      <details className={sectionClass} open={(workspace?.officials.length ?? 0) === 0}>
        <summary className={summaryClass}>1. Championship official appointments</summary>
        <p className={helpClass}>
          Appointments authorize this workflow procedurally; they do not authenticate a person’s identity.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <label className={labelClass}>
            Role
            <select
              className={inputClass}
              value={role}
              onChange={(event) => setRole(event.target.value as ChampionshipOfficialRoleDto)}
            >
              {OFFICIAL_ROLES.map((item) => (
                <option key={item} value={item}>
                  {roleLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <Field label="Official name" value={officialName} onChange={setOfficialName} />
          <Field label="Organization (optional)" value={organization} onChange={setOrganization} />
          <Field label="Recorded by" value={recordedBy} onChange={setRecordedBy} />
          <Field
            label="Appointment / revocation statement"
            value={appointmentStatement}
            onChange={setAppointmentStatement}
          />
        </div>
        <Button className="mt-3" size="sm" disabled={!canAppoint} onClick={() => void appoint()}>
          <UserPlus size={13} aria-hidden="true" /> Record appointment
        </Button>
        <ul className="mt-3 divide-y divide-vscode-border border-y border-vscode-border">
          {workspace?.officials.map((official) => (
            <li key={official.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span className="text-vscode-text">
                {roleLabel(official.role)} · {official.officialName}
                {official.organization ? ` · ${official.organization}` : ''}
              </span>
              <Button
                size="sm"
                variant="danger"
                disabled={!recordedBy.trim() || !appointmentStatement.trim() || busy}
                onClick={() => void revoke(official.appointmentId)}
              >
                Revoke
              </Button>
            </li>
          ))}
          {workspace?.officials.length === 0 && (
            <li className="py-2 text-xs text-vscode-text-muted">No active appointments.</li>
          )}
        </ul>
      </details>

      <details className={sectionClass}>
        <summary className={summaryClass}>2. Record claims and verification</summary>
        <p className={helpClass}>
          RPO, MQS and OOC entries are ineligible. Only Technical Committee verified claims enter the certified book;
          unresolved claims block certification.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-8">
          <label className={`${labelClass} xl:col-span-2`}>
            Officially published result
            <select className={inputClass} value={resultKey} onChange={(event) => setResultKey(event.target.value)}>
              <option value="">Select result</option>
              {workspace?.eligibleRecordResults.map((result) => (
                <option key={recordResultKey(result)} value={recordResultKey(result)}>
                  {result.eventName} · {recordSubjectLabel(result.subjectKind)} · {result.subjectName} ·{' '}
                  {(result.scoreX10 / 10).toFixed(1)} · {result.entryStatus}
                </option>
              ))}
            </select>
          </label>
          <label className={`${labelClass} xl:col-span-2`}>
            ISSF record result basis (explicit confirmation)
            <select
              className={inputClass}
              value={recordResultBasis}
              onChange={(event) => setRecordResultBasis(event.target.value as RecordResultBasisDto | '')}
            >
              <option value="">Select record basis</option>
              {RECORD_RESULT_BASES.map((basis) => (
                <option key={basis.value} value={basis.value}>
                  {basis.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Record code
            <select
              className={inputClass}
              value={recordCode}
              onChange={(event) => setRecordCode(event.target.value as RecordCodeDto)}
            >
              {RECORD_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Reference record score"
            value={benchmarkScore}
            onChange={setBenchmarkScore}
            inputMode="decimal"
          />
          <Field label="Claimed by" value={claimedBy} onChange={setClaimedBy} />
          <label className={labelClass}>
            Achieved at
            <input
              className={inputClass}
              type="datetime-local"
              value={achievedAt}
              onChange={(event) => setAchievedAt(event.target.value)}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-vscode-text-muted">
          Q-record codes require a Qualification / Elimination basis. Select the no-Final total only after confirming
          the complete result belongs to a recognized non-Olympic event; the Technical Delegate remains responsible for
          event and medal eligibility.
        </p>
        <label className="mt-2 flex items-center gap-2 text-xs text-vscode-text-muted">
          <input
            type="checkbox"
            checked={olympicGamesConfirmed}
            onChange={(event) => setOlympicGamesConfirmed(event.target.checked)}
          />
          Confirm this competition is the Olympic Games (required for OR codes)
        </label>
        <Button className="mt-3" size="sm" disabled={!canCreateClaim} onClick={() => void createClaim()}>
          Create immutable claim
        </Button>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className={labelClass}>
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
          <Field label="Actor for other actions" value={claimActor} onChange={setClaimActor} />
          <Field label="Action statement" value={claimStatement} onChange={setClaimStatement} />
          <Field label="Technical Committee reference" value={technicalReference} onChange={setTechnicalReference} />
        </div>
        <ul className="mt-3 space-y-2">
          {workspace?.recordClaims.map((claim) => (
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
                <ClaimActions
                  claim={claim}
                  busy={busy}
                  hasActor={Boolean(claimActor.trim() && claimStatement.trim())}
                  hasDelegate={Boolean(technicalDelegateId && claimStatement.trim())}
                  hasTechnicalReference={Boolean(
                    claimActor.trim() && claimStatement.trim() && technicalReference.trim(),
                  )}
                  onAction={(type) => void appendClaimEntry(claim, type)}
                />
              </div>
            </li>
          ))}
          {workspace?.recordClaims.length === 0 && (
            <li className="text-xs text-vscode-text-muted">No record claims.</li>
          )}
        </ul>
      </details>

      <details className={sectionClass} open>
        <summary className={summaryClass}>3. Generate, certify and export Results Book</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Version prepared by" value={bookCreatedBy} onChange={setBookCreatedBy} />
          <Field label="Signer statement" value={signatureStatement} onChange={setSignatureStatement} />
          <Field label="Finalized by" value={finalizedBy} onChange={setFinalizedBy} />
          <Field label="Finalization statement" value={finalizationStatement} onChange={setFinalizationStatement} />
        </div>
        <Button className="mt-3" size="sm" disabled={!bookCreatedBy.trim() || busy} onClick={() => void generateBook()}>
          Generate immutable version
        </Button>
        <ul className="mt-3 space-y-3">
          {[...(workspace?.books ?? [])].reverse().map((book) => {
            const signedAppointments = new Set(book.signatures.map((signature) => signature.appointmentId));
            const allSigned = book.requiredSigners.every((signer) => signedAppointments.has(signer.appointmentId));
            return (
              <li key={book.id} className="rounded-[3px] border border-vscode-border p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 font-medium text-vscode-text">
                    {book.status === 'CERTIFIED' && <BadgeCheck size={14} className="text-vscode-success" />}
                    Version {book.versionNumber} · {book.status} · {book.sourceHash.slice(0, 12)}…
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {book.status === 'DRAFT' && (
                      <Button
                        size="sm"
                        disabled={
                          busy ||
                          book.findings.length > 0 ||
                          !allSigned ||
                          !finalizedBy.trim() ||
                          !finalizationStatement.trim()
                        }
                        onClick={() => void finalizeBook(book.id)}
                      >
                        Certify
                      </Button>
                    )}
                    {book.status === 'CERTIFIED' && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void exportBook(book.id)}>
                        <Download size={13} aria-hidden="true" /> Export official JSON
                      </Button>
                    )}
                  </div>
                </div>
                {book.findings.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-vscode-warning">
                    {book.findings.map((finding) => (
                      <li key={finding}>{finding}</li>
                    ))}
                  </ul>
                )}
                <ul className="mt-2 space-y-1">
                  {book.requiredSigners.map((signer) => {
                    const signed = signedAppointments.has(signer.appointmentId);
                    return (
                      <li
                        key={signer.appointmentId}
                        className="flex flex-wrap items-center justify-between gap-2 text-vscode-text-muted"
                      >
                        <span>
                          {roleLabel(signer.role)} · {signer.officialName} · {signed ? 'signed' : 'signature required'}
                        </span>
                        {!signed && book.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy || !signatureStatement.trim()}
                            onClick={() => void signBook(book.id, signer.appointmentId)}
                          >
                            Sign
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
          {workspace?.books.length === 0 && (
            <li className="text-xs text-vscode-text-muted">No Results Book versions.</li>
          )}
        </ul>
      </details>
    </div>
  );
}

function ClaimActions({
  claim,
  busy,
  hasActor,
  hasDelegate,
  hasTechnicalReference,
  onAction,
}: {
  claim: RecordClaim;
  busy: boolean;
  hasActor: boolean;
  hasDelegate: boolean;
  hasTechnicalReference: boolean;
  onAction: (type: RecordEntryType) => void;
}) {
  const action = (type: RecordEntryType, label: string, enabled: boolean, danger = false) => (
    <Button
      key={type}
      size="sm"
      variant={danger ? 'danger' : 'secondary'}
      disabled={busy || !enabled}
      onClick={() => onAction(type)}
    >
      {label}
    </Button>
  );
  const actions = [];
  if (claim.status === 'DRAFT') actions.push(action('TD_CONFIRMED', 'TD confirm', hasDelegate));
  if (claim.status === 'TD_CONFIRMED') actions.push(action('SUBMITTED', 'Record submission', hasActor));
  if (claim.status === 'SUBMITTED') {
    actions.push(action('TECHNICAL_COMMITTEE_VERIFIED', 'Verify', hasTechnicalReference));
    actions.push(action('REJECTED', 'Reject', hasActor, true));
  }
  if (claim.status === 'REJECTED') actions.push(action('REOPENED', 'Reopen', hasActor));
  if (claim.status !== 'VOID') {
    actions.push(action('VOID', 'Void', claim.status === 'VERIFIED' ? hasTechnicalReference : hasActor, true));
  }
  return <div className="flex flex-wrap gap-2">{actions}</div>;
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: 'decimal';
}) {
  return (
    <label className={labelClass}>
      {label}
      <input
        className={inputClass}
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function recordResultKey(result: ResultsBookWorkspaceDto['eligibleRecordResults'][number]): string {
  return `${result.resultScope}:${result.resultId}`;
}

function recordSubjectLabel(subjectKind: ResultsBookWorkspaceDto['eligibleRecordResults'][number]['subjectKind']) {
  if (subjectKind === 'MIXED_TEAM') return 'Mixed Team';
  if (subjectKind === 'TEAM') return 'Team';
  return 'Individual';
}

function scoreX10(value: string): number {
  return Math.round(Number(value) * 10);
}

function localDateTimeValue(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function roleLabel(role: ChampionshipOfficialRoleDto): string {
  return role
    .split('_')
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(' ');
}

function recordBasisLabel(basis: RecordResultBasisDto): string {
  return RECORD_RESULT_BASES.find((item) => item.value === basis)?.label ?? basis;
}

const sectionClass = 'rounded-[3px] border border-vscode-border p-3';
const summaryClass = 'cursor-pointer text-xs font-semibold text-vscode-text';
const helpClass = 'mt-2 text-xs text-vscode-text-muted';
const labelClass = 'flex flex-col gap-1 text-xs text-vscode-text-muted';
const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text';
