import { useState } from 'react';

import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import type {
  ParticipantDto,
  PostCompetitionEquipmentCheckDto,
  RecordEquipmentControlTestPayload,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { Field } from '../shared/common/Field';
import { inputClass, sectionClass } from '../shared/common/formClasses';
import { parseListItems } from '../shared/common/parseListItems';

import { selectionOptions, type ConfirmerRole, type Outcome, type SelectionBasis } from './equipmentControlRules';
import type { EquipmentControlCommands } from './usePostCompetitionEquipmentChecks';

interface CheckActionProps<K extends keyof EquipmentControlCommands> {
  check: PostCompetitionEquipmentCheckDto;
  disabled: boolean;
  onSubmit: EquipmentControlCommands[K];
}

/** Records the athletes selected for testing on one basis. */
export function SelectionForm({
  championshipId,
  eventId,
  participants,
  checks,
  disabled,
  onSelect,
}: {
  championshipId: string;
  eventId: string;
  participants: ParticipantDto[];
  checks: PostCompetitionEquipmentCheckDto[];
  disabled: boolean;
  onSelect: EquipmentControlCommands['select'];
}) {
  const [basis, setBasis] = useState<SelectionBasis>('RANDOM_DRAW');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [selectedBy, setSelectedBy] = useState('');
  const [statement, setStatement] = useState('Selection completed under Equipment Control Jury supervision');
  const selectedOption = selectionOptions.find((option) => option.value === basis);
  const activeParticipantIds = new Set(
    checks
      .filter((check) => check.selectionBasis === basis && check.status !== 'VOIDED')
      .map((check) => check.participantId),
  );

  const selectAthletes = async () => {
    await onSelect(
      {
        championshipId,
        eventId,
        participantIds,
        selectionBasis: basis,
        selectionStatement: statement.trim(),
        selectedBy: selectedBy.trim(),
        selectedAt: new Date().toISOString(),
      },
      () => setParticipantIds([]),
    );
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
          <span className="text-[11px] text-vscode-dimmed">{selectedOption?.guidance}</span>
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

export function NoticeForm({ check, disabled, onSubmit }: CheckActionProps<'issueNotice'>) {
  const [deliveryMethod, setDeliveryMethod] = useState('Written notice handed to athlete');
  const [noticeReference, setNoticeReference] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('Athlete instructed to report immediately to Equipment Control');

  const submit = async () => {
    await onSubmit({
      checkId: check.id,
      deliveryMethod: deliveryMethod.trim(),
      noticeReference: noticeReference.trim(),
      officialName: officialName.trim(),
      statement: statement.trim(),
      issuedAt: new Date().toISOString(),
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

export function TestForm({ check, disabled, onSubmit }: CheckActionProps<'recordTest'>) {
  const [outcome, setOutcome] = useState<Outcome>('PASSED');
  const [testedItems, setTestedItems] = useState('');
  const [clothingOrTaping, setClothingOrTaping] = useState(false);
  const [sameGenderJudge, setSameGenderJudge] = useState(false);
  const [attempts, setAttempts] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [statement, setStatement] = useState('Test performed using the approved Equipment Control procedure');
  const items = parseListItems(testedItems);
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
    await onSubmit(payload);
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

export function ConfirmationForm({ check, disabled, onSubmit }: CheckActionProps<'confirmFailure'>) {
  const [calibrationReference, setCalibrationReference] = useState('');
  const [confirmedBy, setConfirmedBy] = useState('');
  const [role, setRole] = useState<ConfirmerRole>('EQUIPMENT_CONTROL_JURY_CHAIR');
  const [statement, setStatement] = useState('Test procedure and result reviewed and confirmed');

  const submit = async () => {
    await onSubmit({
      checkId: check.id,
      calibrationReference: calibrationReference.trim(),
      confirmedBy: confirmedBy.trim(),
      confirmerRole: role,
      statement: statement.trim(),
      confirmedAt: new Date().toISOString(),
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

export function VoidForm({ check, disabled, onSubmit }: CheckActionProps<'voidCheck'>) {
  const [officialName, setOfficialName] = useState('');
  const [reason, setReason] = useState('');

  const submit = async () => {
    const confirmed = await useConfirmDialogStore
      .getState()
      .openConfirm(`Void the equipment-control record for ${check.athleteName}? Its audit history will be retained.`);
    if (!confirmed) return;
    await onSubmit({
      checkId: check.id,
      officialName: officialName.trim(),
      reason: reason.trim(),
      voidedAt: new Date().toISOString(),
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

function ActionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-[3px] border border-vscode-border p-3">
      <h4 className="text-xs font-semibold text-vscode-text">{title}</h4>
      {children}
    </section>
  );
}
