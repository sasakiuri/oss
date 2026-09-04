import { useCallback, useEffect, useRef, useState } from 'react';
import { Clipboard, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';

import { postCompetitionEquipmentControlService } from '@/renderer/services';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import type { PostCompetitionEquipmentCheckDto, RecordEquipmentControlTestPayload } from '@/shared/ipc/contracts';
import type { ParticipantDto } from '@/shared/ipc/contracts/championship.contract';

import { Button } from '../../shared/common/Button';

type SelectionBasis = PostCompetitionEquipmentCheckDto['selectionBasis'];
type Outcome = Extract<PostCompetitionEquipmentCheckDto['entries'][number], { type: 'TEST_RECORDED' }>['outcome'];
type ConfirmerRole = Extract<
  PostCompetitionEquipmentCheckDto['entries'][number],
  { type: 'FAILURE_CONFIRMED' }
>['confirmerRole'];

interface Props {
  championshipId: string;
  eventId: string;
  participants: ParticipantDto[];
}

const selectionOptions: ReadonlyArray<{ value: SelectionBasis; label: string; guidance: string }> = [
  { value: 'RANDOM_DRAW', label: 'General random draw', guidance: 'ISSF 6.7.9.1' },
  {
    value: 'TARGETED_CREDIBLE_EVIDENCE',
    label: 'Targeted — credible evidence',
    guidance: 'ISSF 6.7.9.4; document the credible evidence without sensitive detail',
  },
  {
    value: 'QUALIFICATION_FINALIST_TOP_10',
    label: 'Qualification — likely finalists/top 10',
    guidance: 'ISSF 6.7.9.5 and 8.7.7; officials verify the eligible set',
  },
  {
    value: 'PISTOL_TRIGGER_RANDOM_DRAW',
    label: 'Pistol trigger random draw',
    guidance: 'ISSF 8.4.2.3; record the number of attempts during the test',
  },
];

export function PostCompetitionEquipmentControlPanel({ championshipId, eventId, participants }: Props) {
  const [checks, setChecks] = useState<PostCompetitionEquipmentCheckDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setError(null);
    try {
      const response = await postCompetitionEquipmentControlService.list({ championshipId });
      if (version !== requestVersion.current) return;
      if (!response.success) throw new Error(response.error.message);
      setChecks(response.data.filter((check) => check.eventId === eventId));
    } catch (caught) {
      if (version === requestVersion.current) setError(errorMessage(caught));
    }
  }, [championshipId, eventId]);

  useEffect(() => {
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  const run = async (
    operation: () => Promise<PostCompetitionEquipmentCheckDto | PostCompetitionEquipmentCheckDto[]>,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const changed = await operation();
      const changedChecks = Array.isArray(changed) ? changed : [changed];
      setChecks((current) => mergeChecks(current, changedChecks).filter((check) => check.eventId === eventId));
      setNotice(`${changedChecks.length} equipment-control record(s) updated.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <ShieldCheck size={16} aria-hidden="true" /> Post-competition equipment control
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-vscode-text-muted">
            Append-only selection, written notice, test and confirmation evidence under ISSF 6.7.9. This workspace
            records the check; it never applies a DSQ automatically.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      {notice && <p className="border-l-2 border-vscode-success pl-3 text-xs text-vscode-success">{notice}</p>}

      <SelectionForm
        championshipId={championshipId}
        eventId={eventId}
        participants={participants}
        checks={checks}
        disabled={busy}
        run={run}
      />

      {checks.length === 0 ? (
        <p className="border-y border-vscode-border py-5 text-center text-xs text-vscode-text-muted">
          No post-competition equipment checks have been selected for this event.
        </p>
      ) : (
        <div className="space-y-3">
          {checks.map((check) => (
            <CheckCard key={check.id} check={check} disabled={busy} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function SelectionForm({
  championshipId,
  eventId,
  participants,
  checks,
  disabled,
  run,
}: Props & {
  checks: PostCompetitionEquipmentCheckDto[];
  disabled: boolean;
  run: (
    operation: () => Promise<PostCompetitionEquipmentCheckDto | PostCompetitionEquipmentCheckDto[]>,
  ) => Promise<void>;
}) {
  const [basis, setBasis] = useState<SelectionBasis>('RANDOM_DRAW');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [selectedBy, setSelectedBy] = useState('');
  const [statement, setStatement] = useState('Selection completed under Equipment Control Jury supervision');
  const selectedOption = selectionOptions.find((option) => option.value === basis)!;
  const activeParticipantIds = new Set(
    checks
      .filter((check) => check.selectionBasis === basis && check.status !== 'VOIDED')
      .map((check) => check.participantId),
  );

  const selectAthletes = async () => {
    await run(async () => {
      const response = await postCompetitionEquipmentControlService.select({
        championshipId,
        eventId,
        participantIds,
        selectionBasis: basis,
        selectionStatement: statement.trim(),
        selectedBy: selectedBy.trim(),
        selectedAt: new Date().toISOString(),
      });
      if (!response.success) throw new Error(response.error.message);
      setParticipantIds([]);
      return response.data;
    });
  };

  return (
    <details className={sectionClass} open={checks.length === 0}>
      <summary className="cursor-pointer text-[13px] font-semibold text-vscode-text">
        Select athletes for testing
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Selection basis">
          <select
            className={inputClass}
            value={basis}
            onChange={(event) => {
              setBasis(event.target.value as SelectionBasis);
              setParticipantIds([]);
            }}
          >
            {selectionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-vscode-dimmed">{selectedOption.guidance}</span>
        </Field>
        <Field label="Selecting official">
          <input className={inputClass} value={selectedBy} onChange={(event) => setSelectedBy(event.target.value)} />
        </Field>
        <Field label="Selection record" className="md:col-span-2">
          <textarea
            className={`${inputClass} min-h-16 resize-y`}
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
          />
        </Field>
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-vscode-text-muted">Athletes</legend>
        {participants.length === 0 ? (
          <p className="mt-2 text-xs text-vscode-dimmed">No participants are registered for this event.</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {participants.map((participant) => {
              const unavailable = activeParticipantIds.has(participant.id);
              return (
                <label
                  key={participant.id}
                  className={`flex items-start gap-2 rounded-[3px] border border-vscode-border p-2 text-xs ${
                    unavailable ? 'text-vscode-dimmed' : 'text-vscode-text'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={unavailable}
                    checked={participantIds.includes(participant.id)}
                    onChange={(event) =>
                      setParticipantIds((current) =>
                        event.target.checked
                          ? [...current, participant.id]
                          : current.filter((id) => id !== participant.id),
                      )
                    }
                  />
                  <span>
                    <span className="font-medium">{participant.playerName}</span>
                    <span className="block text-vscode-dimmed">
                      Start {participant.startNumber ?? 'not assigned'} · gender {participant.gender ?? 'unspecified'}
                      {unavailable ? ' · already selected on this basis' : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          disabled={disabled || participantIds.length === 0 || !selectedBy.trim() || !statement.trim()}
          onClick={() => void selectAthletes()}
        >
          Record selection ({participantIds.length})
        </Button>
      </div>
    </details>
  );
}

function CheckCard({
  check,
  disabled,
  run,
}: {
  check: PostCompetitionEquipmentCheckDto;
  disabled: boolean;
  run: (
    operation: () => Promise<PostCompetitionEquipmentCheckDto | PostCompetitionEquipmentCheckDto[]>,
  ) => Promise<void>;
}) {
  const canRecordTest = check.status === 'SELECTED' || check.status === 'NOTIFIED';
  const confirmationPending =
    check.status === 'FAILED_PENDING_CONFIRMATION' || check.status === 'DID_NOT_REPORT_PENDING_CONFIRMATION';
  const canVoid = !['FAILED_CONFIRMED', 'DID_NOT_REPORT_CONFIRMED', 'VOIDED'].includes(check.status);

  return (
    <article className={sectionClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-vscode-text">
            {check.athleteName}
            {check.startNumber ? ` · Start ${check.startNumber}` : ''}
          </h3>
          <p className="mt-0.5 text-xs text-vscode-text-muted">
            {selectionLabel(check.selectionBasis)} · {check.ruleReferences.join(', ')} · selected by {check.selectedBy}
          </p>
        </div>
        <StatusBadge status={check.status} />
      </div>

      {check.separateDisqualificationActionRequired && (
        <div className="mt-3 border-l-2 border-vscode-warning bg-vscode-warning/5 px-3 py-2 text-xs text-vscode-text">
          <p className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert size={14} aria-hidden="true" /> Separate disqualification action required
          </p>
          <p className="mt-1 text-vscode-text-muted">
            This confirmed equipment-control result does not change the athlete result. Use the authority reference in
            the independent sanctions workflow.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="select-all rounded-sm bg-vscode-input px-2 py-1">{check.sanctionAuthorityReference}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(check.sanctionAuthorityReference)}
            >
              <Clipboard size={13} aria-hidden="true" /> Copy reference
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {check.status === 'SELECTED' && <NoticeForm check={check} disabled={disabled} run={run} />}
        {canRecordTest && <TestForm check={check} disabled={disabled} run={run} />}
        {confirmationPending && <ConfirmationForm check={check} disabled={disabled} run={run} />}
      </div>

      <details className="mt-3 border-t border-vscode-border pt-2">
        <summary className="cursor-pointer text-xs text-vscode-text-muted">
          Audit history ({check.entries.length}) and selection statement
        </summary>
        <p className="mt-2 text-xs text-vscode-text">{check.selectionStatement}</p>
        {check.entries.length > 0 && (
          <ol className="mt-2 space-y-1 text-xs text-vscode-text-muted">
            {check.entries.map((entry) => (
              <li key={entry.id}>
                {new Date(entry.occurredAt).toLocaleString()} · {entryLabel(entry)} · {entry.statement}
              </li>
            ))}
          </ol>
        )}
        {canVoid && <VoidForm check={check} disabled={disabled} run={run} />}
      </details>
    </article>
  );
}

function NoticeForm({ check, disabled, run }: CheckActionProps) {
  const [deliveryMethod, setDeliveryMethod] = useState('Written notice handed to athlete');
  const [noticeReference, setNoticeReference] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('Athlete instructed to report immediately to Equipment Control');

  const submit = async () => {
    await run(async () => {
      const response = await postCompetitionEquipmentControlService.issueNotice({
        checkId: check.id,
        deliveryMethod: deliveryMethod.trim(),
        noticeReference: noticeReference.trim(),
        officialName: officialName.trim(),
        statement: statement.trim(),
        issuedAt: new Date().toISOString(),
      });
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    });
  };

  return (
    <ActionBox title="1. Written notice (required before recording non-report)">
      <Field label="Delivery method">
        <input
          className={inputClass}
          value={deliveryMethod}
          onChange={(event) => setDeliveryMethod(event.target.value)}
        />
      </Field>
      <Field label="Notice reference">
        <input
          className={inputClass}
          value={noticeReference}
          onChange={(event) => setNoticeReference(event.target.value)}
        />
      </Field>
      <Field label="Issuing official">
        <input className={inputClass} value={officialName} onChange={(event) => setOfficialName(event.target.value)} />
      </Field>
      <Field label="Notice statement">
        <input className={inputClass} value={statement} onChange={(event) => setStatement(event.target.value)} />
      </Field>
      <Button
        size="sm"
        disabled={
          disabled || !deliveryMethod.trim() || !noticeReference.trim() || !officialName.trim() || !statement.trim()
        }
        onClick={() => void submit()}
      >
        Record written notice
      </Button>
    </ActionBox>
  );
}

function TestForm({ check, disabled, run }: CheckActionProps) {
  const [outcome, setOutcome] = useState<Outcome>('PASSED');
  const [testedItems, setTestedItems] = useState('');
  const [clothingOrTaping, setClothingOrTaping] = useState(false);
  const [sameGenderJudge, setSameGenderJudge] = useState(false);
  const [attempts, setAttempts] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [statement, setStatement] = useState('Test performed using the approved Equipment Control procedure');
  const items = parseItems(testedItems);
  const nonReportAllowed = check.status === 'NOTIFIED';

  const submit = async () => {
    const payload: RecordEquipmentControlTestPayload = {
      checkId: check.id,
      outcome,
      testedItems: outcome === 'DID_NOT_REPORT' ? [] : items,
      clothingOrTapingCheck: clothingOrTaping,
      sameGenderJudgeAvailable: clothingOrTaping ? sameGenderJudge : null,
      attempts: attempts ? Number(attempts) : null,
      performedBy: performedBy.trim(),
      equipmentControlJurySupervisor: supervisor.trim(),
      statement: statement.trim(),
      testedAt: new Date().toISOString(),
    };
    await run(async () => {
      const response = await postCompetitionEquipmentControlService.recordTest(payload);
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    });
  };

  const valid =
    performedBy.trim() &&
    supervisor.trim() &&
    statement.trim() &&
    (outcome === 'DID_NOT_REPORT' ? nonReportAllowed : items.length > 0) &&
    (!clothingOrTaping || sameGenderJudge);

  return (
    <ActionBox title={check.status === 'NOTIFIED' ? '2. Record test or non-report' : 'Record test'}>
      <Field label="Outcome">
        <select className={inputClass} value={outcome} onChange={(event) => setOutcome(event.target.value as Outcome)}>
          <option value="PASSED">Passed</option>
          <option value="FAILED">Failed — confirmation required</option>
          <option value="DID_NOT_REPORT" disabled={!nonReportAllowed}>
            Did not report {!nonReportAllowed ? '— written notice required' : ''}
          </option>
        </select>
      </Field>
      {outcome !== 'DID_NOT_REPORT' && (
        <Field label="Tested items (comma or line separated)">
          <textarea
            className={`${inputClass} min-h-14 resize-y`}
            value={testedItems}
            onChange={(event) => setTestedItems(event.target.value)}
          />
        </Field>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Test operator">
          <input className={inputClass} value={performedBy} onChange={(event) => setPerformedBy(event.target.value)} />
        </Field>
        <Field label="Equipment Control Jury supervisor">
          <input className={inputClass} value={supervisor} onChange={(event) => setSupervisor(event.target.value)} />
        </Field>
        <Field label="Attempts (pistol trigger test, optional)">
          <select className={inputClass} value={attempts} onChange={(event) => setAttempts(event.target.value)}>
            <option value="">Not applicable</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 self-end py-2 text-xs text-vscode-text">
          <input
            type="checkbox"
            checked={clothingOrTaping}
            onChange={(event) => {
              setClothingOrTaping(event.target.checked);
              if (!event.target.checked) setSameGenderJudge(false);
            }}
          />
          Clothing or taping check
        </label>
      </div>
      {clothingOrTaping && (
        <label className="flex items-center gap-2 text-xs text-vscode-text">
          <input
            type="checkbox"
            checked={sameGenderJudge}
            onChange={(event) => setSameGenderJudge(event.target.checked)}
          />
          Same-gender judge was available (ISSF 6.7.9.1)
        </label>
      )}
      <Field label="Test statement">
        <input className={inputClass} value={statement} onChange={(event) => setStatement(event.target.value)} />
      </Field>
      <Button size="sm" disabled={disabled || !valid} onClick={() => void submit()}>
        Record test result
      </Button>
    </ActionBox>
  );
}

function ConfirmationForm({ check, disabled, run }: CheckActionProps) {
  const [calibrationReference, setCalibrationReference] = useState('');
  const [confirmedBy, setConfirmedBy] = useState('');
  const [role, setRole] = useState<ConfirmerRole>('EQUIPMENT_CONTROL_JURY_CHAIR');
  const [statement, setStatement] = useState('Test procedure and result reviewed and confirmed');

  const submit = async () => {
    await run(async () => {
      const response = await postCompetitionEquipmentControlService.confirmFailure({
        checkId: check.id,
        calibrationReference: calibrationReference.trim(),
        confirmedBy: confirmedBy.trim(),
        confirmerRole: role,
        statement: statement.trim(),
        confirmedAt: new Date().toISOString(),
      });
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    });
  };

  return (
    <ActionBox title="Confirm failed test / non-report">
      <p className="text-xs text-vscode-text-muted">
        ISSF 6.7.9.2 requires confirmation by an authorised Jury member and a reference to calibrated test equipment.
      </p>
      <Field label="Calibration reference">
        <input
          className={inputClass}
          value={calibrationReference}
          onChange={(event) => setCalibrationReference(event.target.value)}
        />
      </Field>
      <Field label="Confirming Jury member">
        <input className={inputClass} value={confirmedBy} onChange={(event) => setConfirmedBy(event.target.value)} />
      </Field>
      <Field label="Jury role">
        <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value as ConfirmerRole)}>
          <option value="EQUIPMENT_CONTROL_JURY_CHAIR">Equipment Control Jury Chair</option>
          <option value="EQUIPMENT_CONTROL_JURY_MEMBER">Equipment Control Jury member</option>
          <option value="COMPETITION_JURY_MEMBER">Competition Jury member</option>
        </select>
      </Field>
      <Field label="Confirmation statement">
        <input className={inputClass} value={statement} onChange={(event) => setStatement(event.target.value)} />
      </Field>
      <Button
        size="sm"
        disabled={disabled || !calibrationReference.trim() || !confirmedBy.trim() || !statement.trim()}
        onClick={() => void submit()}
      >
        Confirm test and procedure
      </Button>
    </ActionBox>
  );
}

function VoidForm({ check, disabled, run }: CheckActionProps) {
  const [officialName, setOfficialName] = useState('');
  const [reason, setReason] = useState('');

  const submit = async () => {
    const confirmed = await useConfirmDialogStore
      .getState()
      .openConfirm(`Void the equipment-control record for ${check.athleteName}? Its audit history will be retained.`);
    if (!confirmed) return;
    await run(async () => {
      const response = await postCompetitionEquipmentControlService.voidCheck({
        checkId: check.id,
        officialName: officialName.trim(),
        reason: reason.trim(),
        voidedAt: new Date().toISOString(),
      });
      if (!response.success) throw new Error(response.error.message);
      return response.data;
    });
  };

  return (
    <div className="mt-3 grid gap-2 border-t border-vscode-border pt-3 md:grid-cols-[1fr_2fr_auto]">
      <Field label="Voiding official">
        <input className={inputClass} value={officialName} onChange={(event) => setOfficialName(event.target.value)} />
      </Field>
      <Field label="Reason for voiding">
        <input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <div className="flex items-end">
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !officialName.trim() || !reason.trim()}
          onClick={() => void submit()}
        >
          Void check
        </Button>
      </div>
    </div>
  );
}

interface CheckActionProps {
  check: PostCompetitionEquipmentCheckDto;
  disabled: boolean;
  run: (
    operation: () => Promise<PostCompetitionEquipmentCheckDto | PostCompetitionEquipmentCheckDto[]>,
  ) => Promise<void>;
}

function ActionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-[3px] border border-vscode-border p-3">
      <h4 className="text-xs font-semibold text-vscode-text">{title}</h4>
      {children}
    </section>
  );
}

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-vscode-text-muted ${className}`}>
      {label}
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: PostCompetitionEquipmentCheckDto['status'] }) {
  const attention = status.includes('FAILED') || status.includes('DID_NOT_REPORT');
  return (
    <span
      className={`rounded-full border px-2 py-1 text-[11px] font-medium ${
        attention
          ? 'border-vscode-warning text-vscode-warning'
          : status === 'PASSED'
            ? 'border-vscode-success text-vscode-success'
            : 'border-vscode-border text-vscode-text-muted'
      }`}
    >
      {status.replaceAll('_', ' ')}
    </span>
  );
}

function selectionLabel(basis: SelectionBasis): string {
  return selectionOptions.find((option) => option.value === basis)?.label ?? basis;
}

function entryLabel(entry: PostCompetitionEquipmentCheckDto['entries'][number]): string {
  switch (entry.type) {
    case 'NOTICE_ISSUED':
      return `Written notice ${entry.noticeReference} issued by ${entry.officialName}`;
    case 'TEST_RECORDED':
      return `${entry.outcome.replaceAll('_', ' ')} recorded by ${entry.performedBy}`;
    case 'FAILURE_CONFIRMED':
      return `Failure confirmed by ${entry.confirmedBy} (${entry.confirmerRole.replaceAll('_', ' ')})`;
    case 'CHECK_VOIDED':
      return `Voided by ${entry.officialName}`;
  }
}

function mergeChecks(
  current: PostCompetitionEquipmentCheckDto[],
  changed: PostCompetitionEquipmentCheckDto[],
): PostCompetitionEquipmentCheckDto[] {
  const changedById = new Map(changed.map((check) => [check.id, check]));
  const unchanged = current.filter((check) => !changedById.has(check.id));
  return [...changed, ...unchanged].sort((left, right) => right.selectedAt.localeCompare(left.selectedAt));
}

function parseItems(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const sectionClass = 'rounded-[3px] border border-vscode-border p-3';
const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text';
