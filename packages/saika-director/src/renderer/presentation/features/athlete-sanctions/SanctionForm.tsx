import { useMemo, useState } from 'react';
import { Ban } from 'lucide-react';

import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import type { AthleteIdentityDto, AthleteSanctionWorkspaceDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { linkedEventIds, sanctionAuthority } from './athleteSanctionRules';
import type { AthleteSanctionCommands, ClassificationCode, DsqBasis } from './athleteSanctionTypes';
import { Field } from './Field';
import { sanctionInputClass, sanctionLabelClass, sanctionSectionClass } from './sanctionFormClasses';

interface SanctionFormProps {
  identity: AthleteIdentityDto | null;
  workspace: AthleteSanctionWorkspaceDto;
  defaultOfficialName: string;
  busy: boolean;
  onCancel: () => void;
  onRecorded: () => void;
  commands: Pick<AthleteSanctionCommands, 'imposeSanction'>;
}

/**
 * Records a sanction for one identity. The panel does not remount it when another identity is chosen, so the entries
 * carry over; the official name starts from the recording official when the form opens.
 */
export function SanctionForm({
  identity,
  workspace,
  defaultOfficialName,
  busy,
  onCancel,
  onRecorded,
  commands,
}: SanctionFormProps) {
  const [code, setCode] = useState<ClassificationCode>('DSQ');
  const [sourceEventId, setSourceEventId] = useState('');
  const [dsqBasis, setDsqBasis] = useState<DsqBasis>('JURY_MAJORITY');
  const [authorityReference, setAuthorityReference] = useState('');
  const [ruleReference, setRuleReference] = useState('ISSF 6.12.6');
  const [incidentReportNumber, setIncidentReportNumber] = useState('');
  const [publicRemark, setPublicRemark] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [officialName, setOfficialName] = useState(defaultOfficialName);

  const eventIds = useMemo(() => (identity ? linkedEventIds(workspace, identity.id) : []), [identity, workspace]);
  const selectedEventId = sourceEventId || eventIds[0] || '';
  if (!identity) return null;

  const { basis, role } = sanctionAuthority(code, dsqBasis);
  const submit = async () => {
    const confirmed = await useConfirmDialogStore
      .getState()
      .openConfirm(`Record ${code} for ${identity.displayName} and apply its official scope?`);
    if (!confirmed) return;
    const recorded = await commands.imposeSanction({
      athleteIdentityId: identity.id,
      sourceEventId: selectedEventId,
      classificationCode: code,
      scope: code === 'DSQ' ? 'EVENT' : 'CHAMPIONSHIP',
      authorityBasis: basis,
      authorityReference: authorityReference.trim(),
      officialName: officialName.trim(),
      officialRole: role,
      ruleReference: ruleReference.trim(),
      ...(incidentReportNumber.trim() ? { incidentReportNumber: incidentReportNumber.trim() } : {}),
      publicRemark: publicRemark.trim(),
      ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
      decidedAt: new Date().toISOString(),
    });
    if (recorded) onRecorded();
  };

  return (
    <section className={`${sanctionSectionClass} border-vscode-warning`}>
      <h3 className="text-[13px] font-semibold text-vscode-text">Record sanction · {identity.displayName}</h3>
      <p className="mt-1 text-xs text-vscode-warning">
        Enter the official's name and authority reference for this sanction. These details are recorded as entered.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Classification">
          <select
            className={sanctionInputClass}
            value={code}
            onChange={(event) => setCode(event.target.value as ClassificationCode)}
          >
            <option value="DSQ">DSQ — all phases of selected event</option>
            <option value="DQB">DQB — entire championship</option>
            <option value="AD_DSQ">AD-DSQ — entire championship</option>
          </select>
        </Field>
        <Field label="Source event">
          <select
            className={sanctionInputClass}
            value={selectedEventId}
            onChange={(event) => setSourceEventId(event.target.value)}
          >
            {eventIds.map((eventId) => (
              <option key={eventId} value={eventId}>
                {workspace.participantEntries.find((entry) => entry.eventId === eventId)?.eventName ?? eventId}
              </option>
            ))}
          </select>
        </Field>
        {code === 'DSQ' && (
          <Field label="Authority basis">
            <select
              className={sanctionInputClass}
              value={dsqBasis}
              onChange={(event) => setDsqBasis(event.target.value as DsqBasis)}
            >
              <option value="JURY_MAJORITY">Jury majority</option>
              <option value="POST_COMPETITION_CHECK">Post-competition equipment check</option>
            </select>
          </Field>
        )}
        <Field label="Official name">
          <input
            className={sanctionInputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </Field>
        <Field label="Authority reference">
          <input
            className={sanctionInputClass}
            value={authorityReference}
            onChange={(event) => setAuthorityReference(event.target.value)}
            placeholder="Jury minutes / decision ID"
          />
        </Field>
        <Field label="Rule reference">
          <input
            className={sanctionInputClass}
            value={ruleReference}
            onChange={(event) => setRuleReference(event.target.value)}
          />
        </Field>
        <Field label="Incident report (optional)">
          <input
            className={sanctionInputClass}
            value={incidentReportNumber}
            onChange={(event) => setIncidentReportNumber(event.target.value)}
          />
        </Field>
        <label className={`${sanctionLabelClass} md:col-span-2`}>
          Public result remark
          <input
            className={sanctionInputClass}
            value={publicRemark}
            onChange={(event) => setPublicRemark(event.target.value)}
          />
        </label>
        <label className={`${sanctionLabelClass} md:col-span-3`}>
          Internal note (optional)
          <textarea
            className={`${sanctionInputClass} min-h-16 resize-y`}
            value={internalNote}
            onChange={(event) => setInternalNote(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={
            busy ||
            !selectedEventId ||
            !officialName.trim() ||
            !authorityReference.trim() ||
            !ruleReference.trim() ||
            !publicRemark.trim()
          }
          onClick={() => void submit()}
        >
          <Ban size={13} aria-hidden="true" /> Record {code}
        </Button>
      </div>
    </section>
  );
}
