import { useState, type FormEvent } from 'react';

import type {
  CreateRangeIncidentReportPayload,
  IncidentReportOfficialRoleDto,
  ParticipantDto,
} from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';
import { toDateTimeLocalValue } from '../shared/common/dateUtils';
import { fullWidthInputClass } from '../shared/common/formClasses';
import { RoleOptions } from './IncidentReportRoleOptions';

interface IncidentReportCreateFormProps {
  eventId: string;
  participants: readonly ParticipantDto[];
  saving: boolean;
  onSubmit: (payload: CreateRangeIncidentReportPayload) => Promise<void>;
  onCancel: () => void;
}

export function IncidentReportCreateForm({
  eventId,
  participants,
  saving,
  onSubmit,
  onCancel,
}: IncidentReportCreateFormProps) {
  const [serialNumber, setSerialNumber] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => toDateTimeLocalValue(new Date(), 'minutes'));
  const [relayNumber, setRelayNumber] = useState('');
  const [firingPointNumber, setFiringPointNumber] = useState('');
  const [athleteName, setAthleteName] = useState('');
  const [bibNumber, setBibNumber] = useState('');
  const [nationality, setNationality] = useState('');
  const [stage, setStage] = useState('');
  const [series, setSeries] = useState('');
  const [details, setDetails] = useState('');
  const [ruleReferences, setRuleReferences] = useState('6.14.6');
  const [penalty, setPenalty] = useState('');
  const [scoreAmendmentReference, setScoreAmendmentReference] = useState('');
  const [initiatorRole, setInitiatorRole] = useState<IncidentReportOfficialRoleDto>('RANGE_OFFICER');
  const [initiatorName, setInitiatorName] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const relay = optionalPositiveInteger(relayNumber);
    const firingPoint = optionalPositiveInteger(firingPointNumber);
    await onSubmit({
      eventId,
      serialNumber,
      occurredAt: new Date(occurredAt).toISOString(),
      ...(relay !== undefined ? { relayNumber: relay } : {}),
      ...(firingPoint !== undefined ? { firingPointNumber: firingPoint } : {}),
      ...(athleteName.trim() ? { athleteName } : {}),
      ...(bibNumber.trim() ? { bibNumber } : {}),
      ...(nationality.trim() ? { nationality } : {}),
      ...(stage.trim() ? { stage } : {}),
      ...(series.trim() ? { series } : {}),
      details,
      ruleReferences,
      ...(penalty.trim() ? { penalty } : {}),
      ...(scoreAmendmentReference.trim() ? { scoreAmendmentReference } : {}),
      initiatorRole,
      initiatorName,
    });
  };

  return (
    <form
      aria-label="Create Range Incident Report"
      className="space-y-4 rounded-[3px] border border-vscode-border bg-vscode-bg p-4"
      onSubmit={submit}
    >
      <div>
        <h3 className="text-sm font-semibold text-vscode-text">Initiate Range Incident Report</h3>
        <p className="mt-1 text-xs text-vscode-text-muted">
          Saved facts cannot be edited. If they are wrong, void the report and create a new one.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-vscode-text-muted">
          IR serial number
          <input
            className={`${fullWidthInputClass} mt-1`}
            required
            value={serialNumber}
            onChange={(event) => setSerialNumber(event.target.value)}
          />
        </label>
        <label className="text-xs text-vscode-text-muted">
          Incident date and time
          <input
            className={`${fullWidthInputClass} mt-1`}
            type="datetime-local"
            required
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </label>
        <label className="text-xs text-vscode-text-muted">
          Relay
          <input
            className={`${fullWidthInputClass} mt-1`}
            type="number"
            min="1"
            value={relayNumber}
            onChange={(event) => setRelayNumber(event.target.value)}
          />
        </label>
        <label className="text-xs text-vscode-text-muted">
          Firing point
          <input
            className={`${fullWidthInputClass} mt-1`}
            type="number"
            min="1"
            value={firingPointNumber}
            onChange={(event) => setFiringPointNumber(event.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs text-vscode-text-muted sm:col-span-2">
          Athlete name
          <input
            className={`${fullWidthInputClass} mt-1`}
            list={`incident-athletes-${eventId}`}
            value={athleteName}
            onChange={(event) => setAthleteName(event.target.value)}
          />
          <datalist id={`incident-athletes-${eventId}`}>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.playerName}>
                {participant.affiliation}
              </option>
            ))}
          </datalist>
        </label>
        <label className="text-xs text-vscode-text-muted">
          Bib number
          <input
            className={`${fullWidthInputClass} mt-1`}
            value={bibNumber}
            onChange={(event) => setBibNumber(event.target.value)}
          />
        </label>
        <label className="text-xs text-vscode-text-muted">
          Nationality
          <input
            className={`${fullWidthInputClass} mt-1`}
            value={nationality}
            onChange={(event) => setNationality(event.target.value)}
          />
        </label>
        <label className="text-xs text-vscode-text-muted">
          Stage
          <input
            className={`${fullWidthInputClass} mt-1`}
            value={stage}
            onChange={(event) => setStage(event.target.value)}
          />
        </label>
      </div>

      <label className="block text-xs text-vscode-text-muted">
        Series
        <input
          className={`${fullWidthInputClass} mt-1`}
          value={series}
          onChange={(event) => setSeries(event.target.value)}
        />
      </label>
      <label className="block text-xs text-vscode-text-muted">
        Brief details of incident
        <textarea
          className={`${fullWidthInputClass} mt-1 min-h-24 resize-y`}
          required
          value={details}
          onChange={(event) => setDetails(event.target.value)}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-vscode-text-muted">
          Applicable ISSF rules
          <input
            className={`${fullWidthInputClass} mt-1`}
            required
            value={ruleReferences}
            onChange={(event) => setRuleReferences(event.target.value)}
          />
        </label>
        <label className="text-xs text-vscode-text-muted">
          Penalty / action imposed
          <input
            className={`${fullWidthInputClass} mt-1`}
            value={penalty}
            onChange={(event) => setPenalty(event.target.value)}
          />
        </label>
      </div>
      <label className="block text-xs text-vscode-text-muted">
        Score amendment reference
        <input
          className={`${fullWidthInputClass} mt-1`}
          value={scoreAmendmentReference}
          onChange={(event) => setScoreAmendmentReference(event.target.value)}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-vscode-text-muted">
          Initiating official role
          <select
            className={`${fullWidthInputClass} mt-1`}
            value={initiatorRole}
            onChange={(event) => setInitiatorRole(event.target.value as IncidentReportOfficialRoleDto)}
          >
            <RoleOptions />
          </select>
        </label>
        <label className="text-xs text-vscode-text-muted">
          Initiating official printed name
          <input
            className={`${fullWidthInputClass} mt-1`}
            required
            value={initiatorName}
            onChange={(event) => setInitiatorName(event.target.value)}
          />
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Create report'}
        </Button>
      </div>
    </form>
  );
}

function optionalPositiveInteger(value: string): number | undefined {
  return value.trim() ? Number.parseInt(value, 10) : undefined;
}
