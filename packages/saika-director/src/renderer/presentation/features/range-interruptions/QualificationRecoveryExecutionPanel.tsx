import { useState } from 'react';
import { CheckCircle2, CircleStop, Play } from 'lucide-react';

import type {
  QualificationRecoveryExecutionDto,
  QualificationTimedTargetRecoveryDecisionDto,
  RangeInterruptionCaseDto,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

type RecoveryPhase = QualificationRecoveryExecutionDto['phase'];

type RecoveryAction =
  | { kind: 'START'; phase: RecoveryPhase }
  | { kind: 'CANCEL'; execution: QualificationRecoveryExecutionDto }
  | {
      kind: 'ADJUDICATE';
      execution: QualificationRecoveryExecutionDto;
      priorRequest: AdjudicationRequest | null;
    }
  | null;

interface AdjudicationRequest {
  appliedBy: string;
  statement: string;
}

interface QualificationRecoveryExecutionPanelProps {
  interruption: RangeInterruptionCaseDto;
  competitionId?: string;
  saving: boolean;
  onStart: (decisionId: string, phase: RecoveryPhase) => Promise<boolean>;
  onCancel: (runId: string, reason: string) => Promise<boolean>;
  onAdjudicate: (runId: string, appliedBy: string, statement: string) => Promise<boolean>;
}

/**
 * Presents the recovery lifecycle without knowing about MQTT. All mutations use
 * the interruption application boundary so firing and scoring stay independent.
 */
export function QualificationRecoveryExecutionPanel({
  interruption,
  competitionId,
  saving,
  onStart,
  onCancel,
  onAdjudicate,
}: QualificationRecoveryExecutionPanelProps) {
  const [action, setAction] = useState<RecoveryAction>(null);
  const decision = interruption.qualificationTimedTargetRecoveryDecisions.at(-1);
  if (!decision) return null;

  const currentExecutions = interruption.qualificationRecoveryExecutions.filter(
    (execution) => execution.decisionId === decision.id,
  );
  const sighting = currentExecutions.find((execution) => execution.phase === 'EXTRA_SIGHTING') ?? null;
  const series = currentExecutions.find((execution) => execution.phase === 'SERIES_RECOVERY') ?? null;
  const seriesRecovery = decision.authorizedRecovery.seriesRecovery;
  const hasFiringOperation =
    decision.authorizedRecovery.extraSightingSeriesShots > 0 ||
    (seriesRecovery.treatment !== 'KEEP_RECORDED_SERIES' && seriesRecovery.shotsToFire > 0);
  if (!hasFiringOperation) return null;
  const operationAvailable = Boolean(competitionId && interruption.status === 'ENDED');
  const sightingBlockedByOtherRun = currentExecutions.some(
    (execution) => execution.phase !== 'EXTRA_SIGHTING' && activeFiringStatus(execution.status),
  );
  const seriesBlockedByOtherRun = currentExecutions.some(
    (execution) => execution.phase !== 'SERIES_RECOVERY' && activeFiringStatus(execution.status),
  );

  return (
    <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-[13px] font-semibold text-vscode-text">Qualification recovery execution</h4>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Firing is isolated from MATCH scoring. A completed series changes the score only after a separate Jury
            adjudication.
          </p>
        </div>
        <span className="text-xs text-vscode-dimmed">Decision {decision.id.slice(0, 8)}</span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {decision.authorizedRecovery.extraSightingSeriesShots > 0 && (
          <RecoveryPhaseCard
            title="Extra sighting series"
            description={`${decision.authorizedRecovery.extraSightingSeriesShots} shots · never scored`}
            execution={sighting}
            saving={saving}
            startDisabled={!operationAvailable || sightingBlockedByOtherRun}
            startLabel={sighting ? 'Retry extra sighting start' : 'Start extra sighting'}
            onStart={
              !sighting || retryableStart(sighting.status)
                ? () => setAction({ kind: 'START', phase: 'EXTRA_SIGHTING' })
                : undefined
            }
            onCancel={cancellable(sighting) ? () => setAction({ kind: 'CANCEL', execution: sighting }) : undefined}
          />
        )}
        {seriesRecovery.treatment !== 'KEEP_RECORDED_SERIES' && seriesRecovery.shotsToFire > 0 && (
          <SeriesRecoveryCard
            decision={decision}
            execution={series}
            saving={saving}
            operationAvailable={operationAvailable}
            anotherRunActive={seriesBlockedByOtherRun}
            onStart={() => setAction({ kind: 'START', phase: 'SERIES_RECOVERY' })}
            onCancel={
              cancellable(series) && series ? () => setAction({ kind: 'CANCEL', execution: series }) : undefined
            }
            onAdjudicate={
              canAdjudicate(series) && series
                ? () =>
                    setAction({
                      kind: 'ADJUDICATE',
                      execution: series,
                      priorRequest: adjudicationRequest(series),
                    })
                : undefined
            }
          />
        )}
      </div>

      {!operationAvailable && (
        <p className="mt-3 text-xs leading-5 text-vscode-dimmed">
          {competitionId
            ? 'Recovery controls are available while the ended interruption remains open.'
            : 'Open this record from its competition workspace to operate the Lane.'}
        </p>
      )}

      {action?.kind === 'START' && (
        <StartRecoveryForm
          phase={action.phase}
          decision={decision}
          saving={saving}
          onCancel={() => setAction(null)}
          onSubmit={async () => {
            if (await onStart(decision.id, action.phase)) setAction(null);
          }}
        />
      )}
      {action?.kind === 'CANCEL' && (
        <CancelRecoveryForm
          execution={action.execution}
          saving={saving}
          onCancel={() => setAction(null)}
          onSubmit={async (reason) => {
            if (await onCancel(action.execution.runId, reason)) setAction(null);
          }}
        />
      )}
      {action?.kind === 'ADJUDICATE' && (
        <AdjudicateRecoveryForm
          execution={action.execution}
          decision={decision}
          priorRequest={action.priorRequest}
          saving={saving}
          onCancel={() => setAction(null)}
          onSubmit={async (appliedBy, statement) => {
            if (await onAdjudicate(action.execution.runId, appliedBy, statement)) setAction(null);
          }}
        />
      )}

      {interruption.qualificationRecoveryExecutions.length > 0 && (
        <details className="mt-3 border-t border-vscode-border pt-3 text-xs">
          <summary className="cursor-pointer font-medium text-vscode-text">
            Immutable execution history ({interruption.qualificationRecoveryExecutions.length})
          </summary>
          <ol className="mt-2 space-y-2">
            {interruption.qualificationRecoveryExecutions.map((execution) => (
              <li key={execution.runId} className="border-l-2 border-vscode-border pl-3 leading-5">
                <p className="font-medium text-vscode-text">
                  {phaseLabel(execution.phase)} · {formatStatus(execution.status)}
                </p>
                <p className="text-vscode-text-muted">
                  {execution.shots.length} observed shot(s) · Lane {laneStateLabel(execution)} · run{' '}
                  {execution.runId.slice(0, 8)}
                </p>
                {latestError(execution) && <p className="text-vscode-warning">{latestError(execution)}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function RecoveryPhaseCard({
  title,
  description,
  execution,
  saving,
  startDisabled,
  startLabel,
  onStart,
  onCancel,
}: {
  title: string;
  description: string;
  execution: QualificationRecoveryExecutionDto | null;
  saving: boolean;
  startDisabled: boolean;
  startLabel: string;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="rounded-[3px] border border-vscode-border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-vscode-text">{title}</p>
          <p className="mt-0.5 text-xs text-vscode-text-muted">{description}</p>
        </div>
        <span className={executionStatusClass(execution?.status)}>
          {execution ? formatStatus(execution.status) : 'Not started'}
        </span>
      </div>
      {execution && (
        <p className="mt-2 text-xs text-vscode-dimmed">
          {execution.shots.length}/{authorizedShots(execution)} shot(s) observed · run {execution.runId.slice(0, 8)}
        </p>
      )}
      {(onStart || onCancel) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {onStart && (
            <Button size="sm" disabled={saving || startDisabled} onClick={onStart}>
              <Play size={13} aria-hidden="true" /> {startLabel}
            </Button>
          )}
          {onCancel && (
            <Button size="sm" variant="danger" disabled={saving} onClick={onCancel}>
              <CircleStop size={13} aria-hidden="true" /> Cancel run
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SeriesRecoveryCard({
  decision,
  execution,
  saving,
  operationAvailable,
  anotherRunActive,
  onStart,
  onCancel,
  onAdjudicate,
}: {
  decision: QualificationTimedTargetRecoveryDecisionDto;
  execution: QualificationRecoveryExecutionDto | null;
  saving: boolean;
  operationAvailable: boolean;
  anotherRunActive: boolean;
  onStart: () => void;
  onCancel?: () => void;
  onAdjudicate?: () => void;
}) {
  const recovery = decision.authorizedRecovery.seriesRecovery;
  const startAllowed = !execution || retryableStart(execution.status);
  return (
    <div className="rounded-[3px] border border-vscode-border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-vscode-text">Competition series recovery</p>
          <p className="mt-0.5 text-xs text-vscode-text-muted">
            {formatStatus(recovery.treatment)} · {recovery.shotsToFire} authorized shot(s)
          </p>
        </div>
        <span className={executionStatusClass(execution?.status)}>
          {execution ? formatStatus(execution.status) : 'Not started'}
        </span>
      </div>
      {execution && (
        <p className="mt-2 text-xs text-vscode-dimmed">
          {execution.shots.length}/{authorizedShots(execution)} shot(s) observed · Lane {laneStateLabel(execution)} ·
          run {execution.runId.slice(0, 8)}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {startAllowed && (
          <Button size="sm" disabled={saving || !operationAvailable || anotherRunActive} onClick={onStart}>
            <Play size={13} aria-hidden="true" /> {execution ? 'Retry series recovery start' : 'Start series recovery'}
          </Button>
        )}
        {onCancel && (
          <Button size="sm" variant="danger" disabled={saving || !operationAvailable} onClick={onCancel}>
            <CircleStop size={13} aria-hidden="true" /> Cancel run
          </Button>
        )}
        {onAdjudicate && (
          <Button size="sm" disabled={saving || !operationAvailable} onClick={onAdjudicate}>
            <CheckCircle2 size={13} aria-hidden="true" />{' '}
            {execution?.status === 'COMPLETED' ? 'Review and apply score' : 'Retry score application'}
          </Button>
        )}
      </div>
      {execution?.status === 'CANCELLED' && (
        <p className="mt-2 text-xs leading-5 text-vscode-warning">
          This run remains unscored. Record a superseding decision before authorizing a replacement run.
        </p>
      )}
      {latestError(execution) && <p className="mt-2 text-xs text-vscode-warning">{latestError(execution)}</p>}
    </div>
  );
}

function StartRecoveryForm({
  phase,
  decision,
  saving,
  onCancel,
  onSubmit,
}: {
  phase: RecoveryPhase;
  decision: QualificationTimedTargetRecoveryDecisionDto;
  saving: boolean;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const shots =
    phase === 'EXTRA_SIGHTING'
      ? decision.authorizedRecovery.extraSightingSeriesShots
      : decision.authorizedRecovery.seriesRecovery.shotsToFire;
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <h5 className="text-[13px] font-semibold text-vscode-text">Start {phaseLabel(phase)}</h5>
      <p className="text-xs leading-5 text-vscode-warning">
        This starts {shots} authorized shot(s) on the affected Lane. Shot acquisition remains isolated from the MATCH
        score.
      </p>
      <label className="flex items-start gap-2 text-xs text-vscode-text">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        I confirm the Lane is paused, clear and ready for this recovery firing window.
      </label>
      <FormButtons
        saving={saving}
        submitDisabled={!confirmed}
        submitLabel={`Start ${phaseLabel(phase)}`}
        onCancel={onCancel}
      />
    </form>
  );
}

function CancelRecoveryForm({
  execution,
  saving,
  onCancel,
  onSubmit,
}: {
  execution: QualificationRecoveryExecutionDto;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(reason);
      }}
    >
      <h5 className="text-[13px] font-semibold text-vscode-text">Cancel {phaseLabel(execution.phase)}</h5>
      <p className="text-xs leading-5 text-vscode-warning">
        Captured shots remain as unscored evidence. A cancelled competition-series run cannot be applied to MATCH.
      </p>
      <Field label="Cancellation reason">
        <textarea
          required
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={inputClass}
        />
      </Field>
      <FormButtons saving={saving} submitLabel="Cancel recovery run" onCancel={onCancel} danger />
    </form>
  );
}

function AdjudicateRecoveryForm({
  execution,
  decision,
  priorRequest,
  saving,
  onCancel,
  onSubmit,
}: {
  execution: QualificationRecoveryExecutionDto;
  decision: QualificationTimedTargetRecoveryDecisionDto;
  priorRequest: AdjudicationRequest | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (appliedBy: string, statement: string) => Promise<void>;
}) {
  const [appliedBy, setAppliedBy] = useState(priorRequest?.appliedBy ?? decision.officialName);
  const [statement, setStatement] = useState(priorRequest?.statement ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const unfired = Math.max(0, authorizedShots(execution) - execution.shots.length);
  const treatment = decision.authorizedRecovery.seriesRecovery.treatment;
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(appliedBy, statement);
      }}
    >
      <h5 className="text-[13px] font-semibold text-vscode-text">
        {priorRequest ? 'Retry immutable score application' : 'Review and apply recovery score'}
      </h5>
      <p className="text-xs leading-5 text-vscode-warning">
        {treatment === 'ANNUL_AND_REPEAT'
          ? 'Applying this decision archives the interrupted original series and credits the repeated series.'
          : 'Applying this decision preserves the recorded original shots and credits the completion shots.'}{' '}
        {unfired > 0
          ? `${unfired} authorized but unfired shot(s) will be recorded as misses.`
          : 'No miss filler is needed.'}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Adjudicating official">
          <input
            required
            readOnly={priorRequest !== null}
            value={appliedBy}
            onChange={(event) => setAppliedBy(event.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="text-xs leading-5 text-vscode-text-muted">
          <p>{execution.shots.length} full shot payload(s) received by Director</p>
          <p>{execution.latestLaneState?.shots.length ?? 0} shot reference(s) in the completed Lane state</p>
        </div>
      </div>
      <Field label="Adjudication statement">
        <textarea
          required
          readOnly={priorRequest !== null}
          rows={3}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-start gap-2 text-xs text-vscode-warning">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        I confirm the completed Lane evidence and authorize this explicit MATCH score change.
      </label>
      <FormButtons
        saving={saving}
        submitDisabled={!confirmed}
        submitLabel={priorRequest ? 'Retry score application' : 'Apply recovery score'}
        onCancel={onCancel}
      />
    </form>
  );
}

function cancellable(
  execution: QualificationRecoveryExecutionDto | null,
): execution is QualificationRecoveryExecutionDto {
  return Boolean(execution && ['ACCEPTED', 'RUNNING', 'CANCELLING'].includes(execution.status));
}

function retryableStart(status: QualificationRecoveryExecutionDto['status']): boolean {
  return status === 'REQUESTED' || status === 'COMMAND_FAILED';
}

function canAdjudicate(execution: QualificationRecoveryExecutionDto | null): boolean {
  return Boolean(execution && ['COMPLETED', 'ADJUDICATING', 'ADJUDICATION_FAILED'].includes(execution.status));
}

function activeFiringStatus(status: QualificationRecoveryExecutionDto['status'] | undefined): boolean {
  return Boolean(status && ['REQUESTED', 'ACCEPTED', 'RUNNING', 'CANCELLING'].includes(status));
}

function adjudicationRequest(execution: QualificationRecoveryExecutionDto): AdjudicationRequest | null {
  const event = execution.events.find((candidate) => candidate.type === 'ADJUDICATION_REQUESTED');
  const value = event?.payload.adjudication;
  if (!value || typeof value !== 'object') return null;
  const appliedBy = Reflect.get(value, 'appliedBy');
  const statement = Reflect.get(value, 'statement');
  return typeof appliedBy === 'string' && typeof statement === 'string' ? { appliedBy, statement } : null;
}

function authorizedShots(execution: QualificationRecoveryExecutionDto): number {
  return execution.authorization.phase === 'EXTRA_SIGHTING'
    ? execution.authorization.shotsToFire
    : execution.authorization.seriesRecovery.shotsToFire;
}

function laneStateLabel(execution: QualificationRecoveryExecutionDto): string {
  return execution.latestLaneState ? formatStatus(execution.latestLaneState.status) : 'not observed';
}

function latestError(execution: QualificationRecoveryExecutionDto | null): string | null {
  if (!execution) return null;
  const event = [...execution.events]
    .reverse()
    .find((candidate) => ['START_ERROR', 'CANCEL_ERROR', 'ADJUDICATION_ERROR'].includes(candidate.type));
  return typeof event?.payload.error === 'string' ? event.payload.error : null;
}

function phaseLabel(phase: RecoveryPhase): string {
  return phase === 'EXTRA_SIGHTING' ? 'extra sighting series' : 'competition series recovery';
}

function formatStatus(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function executionStatusClass(status: QualificationRecoveryExecutionDto['status'] | undefined): string {
  if (status === 'ADJUDICATED' || status === 'COMPLETED') return 'text-xs font-medium text-vscode-success';
  if (status === 'COMMAND_FAILED' || status === 'ADJUDICATION_FAILED' || status === 'CANCELLED') {
    return 'text-xs font-medium text-vscode-warning';
  }
  return 'text-xs font-medium text-vscode-text-muted';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-vscode-text">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function FormButtons({
  saving,
  submitDisabled = false,
  submitLabel,
  onCancel,
  danger = false,
}: {
  saving: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
        Back
      </Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} size="sm" disabled={saving || submitDisabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

const inputClass =
  'w-full rounded-[2px] border border-vscode-border bg-vscode-input px-2 py-1.5 text-[13px] text-vscode-text outline-none focus:border-vscode-focus read-only:text-vscode-text-muted';
const formClass = 'mt-3 space-y-3 border-t border-vscode-border pt-3';
