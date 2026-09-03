import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import type { QualificationRecoverySettlementDto, RangeInterruptionCaseDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

interface QualificationRecoverySettlementPanelProps {
  interruption: RangeInterruptionCaseDto;
  competitionId?: string;
  saving: boolean;
  onApply: (decisionId: string, appliedBy: string, statement: string) => Promise<boolean>;
}

/** Operates no-fire decision settlement without depending on firing or MQTT presentation details. */
export function QualificationRecoverySettlementPanel({
  interruption,
  competitionId,
  saving,
  onApply,
}: QualificationRecoverySettlementPanelProps) {
  const [editing, setEditing] = useState(false);
  const decision = interruption.qualificationTimedTargetRecoveryDecisions.at(-1);
  if (decision?.authorizedRecovery.seriesRecovery.treatment !== 'KEEP_RECORDED_SERIES') return null;

  const settlement =
    interruption.qualificationRecoverySettlements.find((candidate) => candidate.decisionId === decision.id) ?? null;
  const unsafeExecution = interruption.qualificationRecoveryExecutions.some(
    (execution) =>
      execution.decisionId === decision.id &&
      execution.status !== 'CANCELLED' &&
      !(execution.phase === 'EXTRA_SIGHTING' && execution.status === 'COMPLETED'),
  );
  const operationAvailable = Boolean(competitionId && interruption.status === 'ENDED');

  return (
    <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-[13px] font-semibold text-vscode-text">Retain recorded Qualification series</h4>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            No recovery shots are fired and no score rows are changed. Explicit application closes the paused Lane
            interruption and records immutable evidence for the full series.
          </p>
        </div>
        <span className={settlementStatusClass(settlement?.status)}>
          {settlement ? formatStatus(settlement.status) : 'Not applied'}
        </span>
      </div>

      <p className="mt-2 text-xs text-vscode-dimmed">
        {interruption.qualificationTimedTargetContext?.recordedShots ?? 0}/
        {interruption.qualificationTimedTargetContext?.seriesShotLimit ?? 0} recorded shot(s) · decision{' '}
        {decision.id.slice(0, 8)}
      </p>
      {latestError(settlement) && <p className="mt-2 text-xs text-vscode-warning">{latestError(settlement)}</p>}
      {unsafeExecution && (
        <p className="mt-2 text-xs leading-5 text-vscode-warning">
          Finish or cancel the isolated firing operation before applying this no-fire settlement.
        </p>
      )}
      {settlement?.status !== 'APPLIED' && (
        <div className="mt-2">
          <Button
            size="sm"
            disabled={saving || !operationAvailable || unsafeExecution}
            onClick={() => setEditing(true)}
          >
            <CheckCircle2 size={13} aria-hidden="true" />{' '}
            {settlement ? 'Retry retain-series application' : 'Review and retain recorded series'}
          </Button>
        </div>
      )}
      {!operationAvailable && (
        <p className="mt-2 text-xs leading-5 text-vscode-dimmed">
          {competitionId
            ? 'Settlement is available while the ended interruption remains open.'
            : 'Open this record from its competition workspace to operate the Lane.'}
        </p>
      )}

      {editing && (
        <SettlementForm
          decisionOfficialName={decision.officialName}
          prior={settlement}
          extraSightingAuthorized={decision.authorizedRecovery.extraSightingSeriesShots > 0}
          saving={saving}
          onCancel={() => setEditing(false)}
          onSubmit={async (appliedBy, statement) => {
            if (await onApply(decision.id, appliedBy, statement)) setEditing(false);
          }}
        />
      )}
    </section>
  );
}

function SettlementForm({
  decisionOfficialName,
  prior,
  extraSightingAuthorized,
  saving,
  onCancel,
  onSubmit,
}: {
  decisionOfficialName: string;
  prior: QualificationRecoverySettlementDto | null;
  extraSightingAuthorized: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (appliedBy: string, statement: string) => Promise<void>;
}) {
  const [appliedBy, setAppliedBy] = useState(prior?.appliedBy ?? decisionOfficialName);
  const [statement, setStatement] = useState(prior?.statement ?? 'The full recorded series is retained.');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      className="mt-3 space-y-3 border-t border-vscode-border pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(appliedBy, statement);
      }}
    >
      <h5 className="text-[13px] font-semibold text-vscode-text">
        {prior ? 'Retry immutable retain-series application' : 'Apply retain-series decision'}
      </h5>
      <p className="text-xs leading-5 text-vscode-warning">
        This operation does not rescore the series. It verifies and snapshots the full recorded series, marks its timed
        window complete, and clears the matching Lane interruption.
      </p>
      <label className="block text-xs font-medium text-vscode-text">
        <span className="mb-1 block">Applying official</span>
        <input
          required
          readOnly={prior !== null}
          value={appliedBy}
          onChange={(event) => setAppliedBy(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block text-xs font-medium text-vscode-text">
        <span className="mb-1 block">Settlement statement</span>
        <textarea
          required
          readOnly={prior !== null}
          rows={3}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex items-start gap-2 text-xs text-vscode-warning">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        I confirm the full recorded series and that{' '}
        {extraSightingAuthorized
          ? 'the authorized extra sighting series is complete or will not be used.'
          : 'no recovery firing remains to be performed.'}
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" size="sm" disabled={saving || !confirmed}>
          {prior ? 'Retry settlement' : 'Retain recorded series'}
        </Button>
      </div>
    </form>
  );
}

function latestError(settlement: QualificationRecoverySettlementDto | null): string | null {
  if (settlement?.status !== 'COMMAND_FAILED') return null;
  const event = settlement.events.at(-1);
  if (typeof event?.payload.error === 'string') return event.payload.error;
  return 'The Lane did not accept the retain-series application. Review its state and retry the immutable request.';
}

function settlementStatusClass(status: QualificationRecoverySettlementDto['status'] | undefined): string {
  if (status === 'APPLIED') return 'text-xs font-medium text-vscode-success';
  if (status === 'COMMAND_FAILED') return 'text-xs font-medium text-vscode-warning';
  return 'text-xs font-medium text-vscode-text-muted';
}

function formatStatus(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const inputClass =
  'w-full rounded-[2px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text outline-none focus:border-vscode-focus read-only:text-vscode-text-muted';
