import { ClockAlert, Link, PauseCircle, Play, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { mqttService, rangeInterruptionsService } from '@/renderer/services';
import type {
  AppendRangeInterruptionEntryPayload,
  RangeInterruptionCaseDto,
  RangeInterruptionCauseDto,
  RangeInterruptionEntryTypeDto,
  RangeInterruptionPhaseDto,
  RangeInterruptionScopePayload,
  QualificationTimedTargetInterruptionRecommendationDto,
  QualificationTimedTargetRecoveryDecisionDto,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { QualificationRecoveryExecutionPanel } from './QualificationRecoveryExecutionPanel';
import { QualificationRecoverySettlementPanel } from './QualificationRecoverySettlementPanel';
import {
  applyLaneMatchResume,
  applyLanePause,
  applyLaneResume,
  type RangeInterruptionLaneWorkflowPorts,
} from './rangeInterruptionLaneWorkflow';
import {
  applyRangeMatchResume,
  applyRangePause,
  applyRangeResume,
  type RangeInterruptionRangeWorkflowPorts,
} from './rangeInterruptionRangeWorkflow';

export interface RangeInterruptionLaneOption {
  laneId: string;
  label: string;
  firingPointNumber: number | null;
  athleteName?: string;
  interruption?: {
    interruptionId: string;
    status: 'PAUSED' | 'RESUME_PENDING' | 'SIGHTING' | 'RUNNING_MATCH';
  };
  seriesSnapshot?: {
    stageIndex: number;
    seriesIndex: number;
    recordedShots: number;
    maxShots: number;
    seriesComplete: boolean;
    capturedAt: string;
  };
}

interface RangeInterruptionsPanelProps {
  primaryScope?: RangeInterruptionScopePayload;
  additionalScopes?: readonly RangeInterruptionScopePayload[];
  lanes?: readonly RangeInterruptionLaneOption[];
  competitionId?: string;
  defaultLaneId?: string;
  defaultPhase?: RangeInterruptionPhaseDto;
  defaultRemainingSeconds?: number;
  qualificationTimedTargetCompetitionTypeId?: string;
}

type DetailAction =
  'pause' | 'end' | 'recovery' | 'grant' | 'qualification-decision' | 'resume' | 'match' | 'entry' | null;

const CAUSE_OPTIONS: ReadonlyArray<{
  value: RangeInterruptionCauseDto;
  label: string;
  ruleReference: string;
}> = [
  { value: 'ATHLETE_NON_FAULT', label: 'Athlete interruption — no fault', ruleReference: 'ISSF 6.11.3' },
  { value: 'ALL_TARGET_FAILURE', label: 'All targets failed', ruleReference: 'ISSF 6.10.9.1' },
  { value: 'SINGLE_TARGET_FAILURE', label: 'Single target failed', ruleReference: 'ISSF 6.10.9.2' },
  { value: 'FIRING_POINT_MOVE', label: 'Moved to another firing point', ruleReference: 'ISSF 6.11.3.2' },
  { value: 'OTHER', label: 'Other / manual review', ruleReference: 'ISSF 6.11.3' },
];

function laneWorkflowPorts(): RangeInterruptionLaneWorkflowPorts {
  return { lane: mqttService, ledger: rangeInterruptionsService };
}

function rangeWorkflowPorts(): RangeInterruptionRangeWorkflowPorts {
  return { lane: mqttService, ledger: rangeInterruptionsService };
}

export function RangeInterruptionsPanel({
  primaryScope,
  additionalScopes = [],
  lanes = [],
  competitionId,
  defaultLaneId,
  defaultPhase = 'MATCH',
  defaultRemainingSeconds = 0,
  qualificationTimedTargetCompetitionTypeId,
}: RangeInterruptionsPanelProps) {
  const [cases, setCases] = useState<RangeInterruptionCaseDto[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailAction, setDetailAction] = useState<DetailAction>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeScopeKey = useRef('');
  const scopeKey = primaryScope ? `${primaryScope.scopeType}:${primaryScope.scopeId}` : 'ALL';
  activeScopeKey.current = scopeKey;

  const loadCases = useCallback(async () => {
    const requestedScopeKey = scopeKey;
    setLoading(true);
    setError(null);
    try {
      const response = primaryScope
        ? await rangeInterruptionsService.listByScope(primaryScope)
        : await rangeInterruptionsService.listAll();
      if (!response.success) throw new Error(response.error.message);
      if (activeScopeKey.current !== requestedScopeKey) return;
      setCases(response.data);
      setSelectedCaseId((current) => {
        if (current && response.data.some((interruption) => interruption.id === current)) return current;
        return (
          [...response.data]
            .reverse()
            .find((interruption) => interruption.status !== 'CLOSED' && interruption.status !== 'VOID')?.id ??
          response.data.at(-1)?.id ??
          null
        );
      });
    } catch (caught) {
      if (activeScopeKey.current === requestedScopeKey) {
        setError(errorMessage(caught, 'Failed to load range interruptions'));
      }
    } finally {
      if (activeScopeKey.current === requestedScopeKey) setLoading(false);
    }
  }, [primaryScope?.scopeId, primaryScope?.scopeType, scopeKey]);

  useEffect(() => {
    setSelectedCaseId(null);
    setShowCreate(false);
    setDetailAction(null);
    void loadCases();
  }, [loadCases]);

  const selectedCase = useMemo(
    () => cases.find((interruption) => interruption.id === selectedCaseId) ?? null,
    [cases, selectedCaseId],
  );
  const activeHolds = cases.filter((interruption) => interruption.dataHoldActive).length;
  const scopes = useMemo(
    () => uniqueScopes([...(primaryScope ? [primaryScope] : []), ...additionalScopes]),
    [additionalScopes, primaryScope],
  );

  const runMutation = useCallback(
    async (operation: () => Promise<RangeInterruptionCaseDto>): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const interruption = await operation();
        setSelectedCaseId(interruption.id);
        await loadCases();
        return true;
      } catch (caught) {
        const message = errorMessage(caught, 'Failed to update the interruption record');
        // A Lane command and a local ledger append cannot share a transaction.
        // Reload before offering a retry so an acknowledgement lost after a
        // successful append does not invite a duplicate operational entry.
        await loadCases();
        setError(message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [loadCases],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClockAlert size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Range Interruptions</h2>
            {activeHolds > 0 && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-vscode-warning/60 px-1.5 py-0.5 text-[11px] font-semibold text-vscode-warning">
                <ShieldAlert size={12} aria-hidden="true" /> {activeHolds} active
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            ISSF 6.10.9 / 6.11.3 audit ledger. Recommendations are advisory; an official must record every grant.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void loadCases()}>
            <RefreshCw size={13} aria-hidden="true" /> Refresh
          </Button>
          {primaryScope && (
            <Button size="sm" disabled={saving} onClick={() => setShowCreate(true)}>
              <Plus size={14} aria-hidden="true" /> Open record
            </Button>
          )}
        </div>
      </header>

      {error && <div className="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">{error}</div>}
      {loading && <p className="text-[13px] text-vscode-text-muted">Loading interruption records…</p>}

      {showCreate && primaryScope && (
        <CreateInterruptionForm
          scopes={scopes}
          lanes={lanes}
          defaultLaneId={defaultLaneId}
          defaultPhase={defaultPhase}
          defaultRemainingSeconds={defaultRemainingSeconds}
          qualificationTimedTargetCompetitionTypeId={qualificationTimedTargetCompetitionTypeId}
          saving={saving}
          onCancel={() => setShowCreate(false)}
          onCreate={async (input) => {
            const succeeded = await runMutation(async () => {
              const response = await rangeInterruptionsService.create(input);
              if (!response.success) throw new Error(response.error.message);
              return response.data;
            });
            if (succeeded) setShowCreate(false);
          }}
        />
      )}

      {!loading && cases.length === 0 && !showCreate && (
        <div className="border-y border-vscode-border py-5">
          <p className="text-[13px] font-medium text-vscode-text">No interruption records</p>
          <p className="mt-1 text-xs text-vscode-text-muted">
            {primaryScope
              ? 'Open a record when firing is interrupted. Creating the record alone does not send a Lane command.'
              : 'No interruption records have been retained in a competition or event workspace.'}
          </p>
        </div>
      )}

      {cases.length > 0 && (
        <div className="grid min-h-80 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-[3px] border border-vscode-border bg-vscode-bg">
            <div className="border-b border-vscode-border px-3 py-2 text-xs font-semibold text-vscode-text">
              Records ({cases.length})
            </div>
            <div className="max-h-[48rem] overflow-auto">
              {[...cases].reverse().map((interruption) => (
                <button
                  key={interruption.id}
                  type="button"
                  className={`block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 ${
                    interruption.id === selectedCaseId ? 'bg-vscode-highlight' : 'hover:bg-vscode-bg-hover'
                  }`}
                  onClick={() => {
                    setSelectedCaseId(interruption.id);
                    setDetailAction(null);
                  }}
                >
                  <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-vscode-text">
                    <span className="truncate">{interruption.summary}</span>
                    <span className={statusClass(interruption.status)}>{formatEnum(interruption.status)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
                    {interruption.firingPointNumber ? `Firing point ${interruption.firingPointNumber}` : 'Range-wide'} ·{' '}
                    {formatEnum(interruption.cause)}
                  </span>
                  <span className="block text-xs text-vscode-dimmed">
                    {new Date(interruption.startedAt).toLocaleString()} · {interruption.id.slice(0, 8)}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0">
            {selectedCase ? (
              <InterruptionDetail
                interruption={selectedCase}
                additionalScopes={additionalScopes}
                lanes={lanes}
                competitionId={competitionId}
                saving={saving}
                action={detailAction}
                onAction={setDetailAction}
                onMutate={runMutation}
              />
            ) : (
              <p className="text-xs text-vscode-text-muted">Select an interruption record.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function CreateInterruptionForm({
  scopes,
  lanes,
  defaultLaneId,
  defaultPhase,
  defaultRemainingSeconds,
  qualificationTimedTargetCompetitionTypeId,
  saving,
  onCreate,
  onCancel,
}: {
  scopes: RangeInterruptionScopePayload[];
  lanes: readonly RangeInterruptionLaneOption[];
  defaultLaneId?: string;
  defaultPhase: RangeInterruptionPhaseDto;
  defaultRemainingSeconds: number;
  qualificationTimedTargetCompetitionTypeId?: string;
  saving: boolean;
  onCreate: (input: Parameters<typeof rangeInterruptionsService.create>[0]) => Promise<void>;
  onCancel: () => void;
}) {
  const [cause, setCause] = useState<RangeInterruptionCauseDto>('ATHLETE_NON_FAULT');
  const [phase, setPhase] = useState(defaultPhase);
  const [startedAt, setStartedAt] = useState(toLocalInputValue(new Date()));
  const [remainingSeconds, setRemainingSeconds] = useState(String(Math.max(0, Math.round(defaultRemainingSeconds))));
  const [laneId, setLaneId] = useState(defaultLaneId ?? '');
  const [athleteName, setAthleteName] = useState('');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [openedBy, setOpenedBy] = useState('');
  const selectedLane = lanes.find((lane) => lane.laneId === laneId);
  const causeOption = CAUSE_OPTIONS.find((option) => option.value === cause)!;

  return (
    <form
      className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate({
          id: crypto.randomUUID(),
          scopes,
          cause,
          phase,
          startedAt: new Date(startedAt).toISOString(),
          remainingSecondsAtStart: Number(remainingSeconds),
          ...(laneId ? { laneId } : {}),
          ...(selectedLane?.firingPointNumber ? { firingPointNumber: selectedLane.firingPointNumber } : {}),
          ...(athleteName.trim() ? { athleteName: athleteName.trim() } : {}),
          summary,
          details,
          openedBy,
          ...(qualificationTimedTargetCompetitionTypeId &&
          ['ATHLETE_NON_FAULT', 'ALL_TARGET_FAILURE', 'SINGLE_TARGET_FAILURE'].includes(cause) &&
          phase === 'MATCH' &&
          selectedLane?.seriesSnapshot
            ? {
                qualificationTimedTargetContext: {
                  competitionTypeId: qualificationTimedTargetCompetitionTypeId,
                  stageIndex: selectedLane.seriesSnapshot.stageIndex,
                  seriesIndex: selectedLane.seriesSnapshot.seriesIndex,
                  recordedShots: selectedLane.seriesSnapshot.recordedShots,
                  seriesComplete: selectedLane.seriesSnapshot.seriesComplete,
                  laneSnapshotCapturedAt: selectedLane.seriesSnapshot.capturedAt,
                },
              }
            : {}),
        });
      }}
    >
      <h3 className="text-[13px] font-semibold text-vscode-text">Open interruption record</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Cause">
          <select
            value={cause}
            onChange={(event) => setCause(event.target.value as RangeInterruptionCauseDto)}
            className={inputClass}
          >
            {CAUSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Firing phase">
          <select
            value={phase}
            onChange={(event) => setPhase(event.target.value as RangeInterruptionPhaseDto)}
            className={inputClass}
          >
            <option value="SIGHTING">Sighting</option>
            <option value="MATCH">Match</option>
          </select>
        </Field>
        <Field label="Interruption started at">
          <input
            required
            type="datetime-local"
            step={1}
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Competition time remaining (seconds)">
          <input
            required
            type="number"
            min={0}
            step={1}
            value={remainingSeconds}
            onChange={(event) => setRemainingSeconds(event.target.value)}
            className={inputClass}
          />
          <span className="font-normal text-vscode-dimmed">{formatDuration(Number(remainingSeconds) || 0)}</span>
        </Field>
        <Field label="Affected Lane">
          <select
            value={laneId}
            onChange={(event) => {
              const nextLaneId = event.target.value;
              setLaneId(nextLaneId);
              const lane = lanes.find((candidate) => candidate.laneId === nextLaneId);
              setAthleteName(lane?.athleteName ?? '');
            }}
            className={inputClass}
          >
            <option value="">Range-wide / no Lane control</option>
            {lanes.map((lane) => (
              <option key={lane.laneId} value={lane.laneId}>
                {lane.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Athlete name">
          <input value={athleteName} onChange={(event) => setAthleteName(event.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Summary">
        <input required value={summary} onChange={(event) => setSummary(event.target.value)} className={inputClass} />
      </Field>
      <Field label="Observed facts">
        <textarea
          required
          rows={3}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Opened by">
        <input required value={openedBy} onChange={(event) => setOpenedBy(event.target.value)} className={inputClass} />
      </Field>
      <div className="rounded-[3px] border border-vscode-border px-3 py-2 text-xs leading-5 text-vscode-text-muted">
        <p>{causeOption.ruleReference}</p>
        {qualificationTimedTargetCompetitionTypeId &&
          ['ATHLETE_NON_FAULT', 'ALL_TARGET_FAILURE', 'SINGLE_TARGET_FAILURE'].includes(cause) &&
          phase === 'MATCH' && (
            <p>
              {selectedLane?.seriesSnapshot
                ? `ISSF 8.8.1 series facts will be snapshotted from stage ${selectedLane.seriesSnapshot.stageIndex}, series ${selectedLane.seriesSnapshot.seriesIndex} (${selectedLane.seriesSnapshot.recordedShots}/${selectedLane.seriesSnapshot.maxShots} shots).`
                : 'Select a Lane with a live series snapshot to enable the ISSF 8.8.1 recommendation.'}
            </p>
          )}
        <p className="text-vscode-warning">Opening this ledger activates a data hold but does not stop any Lane.</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          Open record
        </Button>
      </div>
    </form>
  );
}

function InterruptionDetail({
  interruption,
  additionalScopes,
  lanes,
  competitionId,
  saving,
  action,
  onAction,
  onMutate,
}: {
  interruption: RangeInterruptionCaseDto;
  additionalScopes: readonly RangeInterruptionScopePayload[];
  lanes: readonly RangeInterruptionLaneOption[];
  competitionId?: string;
  saving: boolean;
  action: DetailAction;
  onAction: (action: DetailAction) => void;
  onMutate: (operation: () => Promise<RangeInterruptionCaseDto>) => Promise<boolean>;
}) {
  const lane = lanes.find((candidate) => candidate.laneId === interruption.laneId);
  const pauseRecorded = interruption.entries.some((entry) => entry.type === 'PAUSE_APPLIED');
  const matchResumeRecorded = interruption.entries.some((entry) => entry.type === 'MATCH_RESUMED');
  const latestGrant = [...interruption.entries].reverse().find((entry) => entry.type === 'TIME_GRANTED') ?? null;
  const latestQualificationDecision = interruption.qualificationTimedTargetRecoveryDecisions.at(-1) ?? null;
  const targetRecoveryAssessments = interruption.targetRecoveryAssessments ?? [];
  const laneControlAvailable = Boolean(competitionId && interruption.laneId);
  const rangeControlAvailable = Boolean(competitionId && !interruption.laneId && lanes.length > 0);
  const targetRangeLaneIds = rangeTargetLaneIds(interruption, lanes);
  const matchingLaneInterruption = lane?.interruption?.interruptionId === interruption.id ? lane.interruption : null;
  const laneRecoveryComplete = matchingLaneInterruption === null || matchingLaneInterruption.status === 'RUNNING_MATCH';
  const operationalRecoveryComplete = laneControlAvailable
    ? laneRecoveryComplete
    : rangeBatchRecoveryComplete(interruption);
  const qualificationDecisionRecorded =
    !interruption.qualificationTimedTargetContext || latestQualificationDecision !== null;
  const qualificationRecoveryComplete = qualificationSeriesRecoveryComplete(interruption, latestQualificationDecision);
  const qualificationDecisionLocked = latestQualificationDecision
    ? interruption.qualificationRecoveryExecutions
        .filter((execution) => execution.decisionId === latestQualificationDecision.id)
        .some(blocksQualificationDecisionSupersession) ||
      interruption.qualificationRecoverySettlements.some(
        (settlement) => settlement.decisionId === latestQualificationDecision.id,
      )
    : false;
  const missingScopes = additionalScopes.filter(
    (candidate) =>
      !interruption.scopes.some(
        (scope) => scope.scopeType === candidate.scopeType && scope.scopeId === candidate.scopeId,
      ),
  );

  return (
    <div className="space-y-3">
      <div className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-vscode-text">{interruption.summary}</h3>
            <p className="mt-1 text-xs text-vscode-text-muted">
              {formatEnum(interruption.cause)} · {new Date(interruption.startedAt).toLocaleString()} · Record{' '}
              {interruption.id.slice(0, 8)}
            </p>
          </div>
          <span className={`text-xs font-semibold ${statusClass(interruption.status)}`}>
            {formatEnum(interruption.status)}
          </span>
        </div>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <Detail
            label="Affected point"
            value={interruption.firingPointNumber ? `Firing point ${interruption.firingPointNumber}` : 'Range-wide'}
          />
          <Detail label="Athlete" value={interruption.athleteName ?? 'Not recorded'} />
          <Detail label="Phase" value={interruption.phase} />
          <Detail label="Time at interruption" value={formatDuration(interruption.remainingSecondsAtStart)} />
          <Detail label="Opened by" value={interruption.openedBy} />
          {interruption.qualificationTimedTargetContext && (
            <Detail
              label="25m series snapshot"
              value={`${interruption.qualificationTimedTargetContext.stageId} · series ${interruption.qualificationTimedTargetContext.seriesIndex} · ${interruption.qualificationTimedTargetContext.recordedShots}/${interruption.qualificationTimedTargetContext.seriesShotLimit} shots`}
            />
          )}
          <Detail
            label="Lane state"
            value={
              lane?.interruption
                ? `${formatEnum(lane.interruption.status)} · ${lane.interruption.interruptionId.slice(0, 8)}`
                : laneControlAvailable
                  ? 'No retained interruption state'
                  : 'Not connected'
            }
          />
        </dl>
        <p className="mt-3 whitespace-pre-wrap border-t border-vscode-border pt-3 text-[13px] leading-5 text-vscode-text">
          {interruption.details}
        </p>
        {interruption.status !== 'VOID' && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-vscode-border pt-3">
            {interruption.status === 'OPEN' && (laneControlAvailable || rangeControlAvailable) && !pauseRecorded && (
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => onAction('pause')}>
                <PauseCircle size={13} aria-hidden="true" />{' '}
                {laneControlAvailable ? 'Apply Lane STOP' : 'Apply range STOP'}
              </Button>
            )}
            {interruption.status === 'OPEN' && (
              <Button size="sm" disabled={saving} onClick={() => onAction('end')}>
                End interruption
              </Button>
            )}
            {(interruption.status === 'ENDED' || interruption.status === 'GRANTED') &&
              interruption.recommendation?.type !== 'QUALIFICATION_TIMED_TARGET' && (
                <Button size="sm" disabled={saving} onClick={() => onAction('grant')}>
                  Record official grant
                </Button>
              )}
            {interruption.status === 'ENDED' && interruption.recommendation?.type === 'QUALIFICATION_TIMED_TARGET' && (
              <Button
                size="sm"
                disabled={saving || qualificationDecisionLocked}
                onClick={() => onAction('qualification-decision')}
              >
                {latestQualificationDecision ? 'Supersede recovery decision' : 'Record official recovery decision'}
              </Button>
            )}
            {interruption.cause === 'SINGLE_TARGET_FAILURE' && interruption.status === 'ENDED' && (
              <Button size="sm" variant="secondary" disabled={saving} onClick={() => onAction('recovery')}>
                Record target recovery
              </Button>
            )}
            {interruption.status === 'GRANTED' && (laneControlAvailable || rangeControlAvailable) && latestGrant && (
              <Button
                size="sm"
                disabled={saving || (latestGrant.authorizedRemainingSeconds ?? 0) <= 0}
                onClick={() => onAction('resume')}
              >
                <Play size={13} aria-hidden="true" />{' '}
                {laneControlAvailable ? 'Apply Lane resume' : 'Apply range resume'}
              </Button>
            )}
            {interruption.status === 'RESUMED' &&
              latestGrant?.unlimitedSightingShots &&
              !matchResumeRecorded &&
              (laneControlAvailable || rangeControlAvailable) && (
                <Button size="sm" disabled={saving} onClick={() => onAction('match')}>
                  Resume MATCH fire
                </Button>
              )}
            <Button size="sm" variant="secondary" disabled={saving} onClick={() => onAction('entry')}>
              Record action
            </Button>
          </div>
        )}
        {!operationalRecoveryComplete && (
          <p className="mt-3 text-xs leading-5 text-vscode-warning">
            Complete the Lane resume sequence before closing or voiding this record.
          </p>
        )}
        {!qualificationDecisionRecorded && (
          <p className="mt-3 text-xs leading-5 text-vscode-warning">
            Record an official 25m recovery decision before closing this record.
          </p>
        )}
        {qualificationDecisionRecorded && !qualificationRecoveryComplete && (
          <p className="mt-3 text-xs leading-5 text-vscode-warning">
            Apply the authorized competition-series recovery or retain-series settlement before closing this record.
          </p>
        )}
        {qualificationDecisionLocked && (
          <p className="mt-3 text-xs leading-5 text-vscode-dimmed">
            The latest recovery decision is locked after an operation is requested, while firing is active, or while
            adjudication is pending.
          </p>
        )}
      </div>

      {interruption.recommendation && <RecommendationPanel interruption={interruption} />}

      {interruption.qualificationTimedTargetRecoveryDecisions.length > 0 && (
        <QualificationRecoveryDecisionHistory decisions={interruption.qualificationTimedTargetRecoveryDecisions} />
      )}

      {latestQualificationDecision && (
        <>
          <QualificationRecoveryExecutionPanel
            interruption={interruption}
            competitionId={competitionId}
            saving={saving}
            onStart={async (decisionId, phase) => {
              if (!competitionId) return false;
              return onMutate(async () => {
                const response = await rangeInterruptionsService.startQualificationRecoveryExecution({
                  caseId: interruption.id,
                  decisionId,
                  competitionId,
                  phase,
                });
                if (!response.success) throw new Error(response.error.message);
                return response.data;
              });
            }}
            onCancel={(runId, reason) =>
              onMutate(async () => {
                const response = await rangeInterruptionsService.cancelQualificationRecoveryExecution({
                  caseId: interruption.id,
                  runId,
                  reason,
                });
                if (!response.success) throw new Error(response.error.message);
                return response.data;
              })
            }
            onAdjudicate={(runId, appliedBy, statement) =>
              onMutate(async () => {
                const response = await rangeInterruptionsService.adjudicateQualificationRecoveryExecution({
                  caseId: interruption.id,
                  runId,
                  appliedBy,
                  statement,
                });
                if (!response.success) throw new Error(response.error.message);
                return response.data;
              })
            }
          />
          <QualificationRecoverySettlementPanel
            interruption={interruption}
            competitionId={competitionId}
            saving={saving}
            onApply={async (decisionId, appliedBy, statement) => {
              if (!competitionId) return false;
              return onMutate(async () => {
                const response = await rangeInterruptionsService.applyQualificationRecoverySettlement({
                  caseId: interruption.id,
                  decisionId,
                  competitionId,
                  appliedBy,
                  statement,
                });
                if (!response.success) throw new Error(response.error.message);
                return response.data;
              });
            }}
          />
        </>
      )}

      {missingScopes.map((scope) => (
        <LinkScopeForm
          key={`${scope.scopeType}:${scope.scopeId}`}
          interruption={interruption}
          scope={scope}
          saving={saving}
          onMutate={onMutate}
        />
      ))}

      {action === 'pause' && competitionId && interruption.laneId && (
        <LaneOperationForm
          title="Apply Lane STOP"
          description="The Lane freezes and persists its exact timer. Its acknowledgement is then appended to this ledger."
          submitLabel="Send STOP"
          defaultOfficial={interruption.openedBy}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmit={async (officialName) => {
            const succeeded = await onMutate(() =>
              applyLanePause(
                { competitionId, laneId: interruption.laneId!, interruptionId: interruption.id, officialName },
                laneWorkflowPorts(),
              ),
            );
            if (succeeded) onAction(null);
          }}
        />
      )}
      {action === 'pause' && competitionId && rangeControlAvailable && (
        <LaneOperationForm
          title="Apply range STOP"
          description={`Send independent STOP commands to ${pendingRangeLaneIds(interruption, 'PAUSE', targetRangeLaneIds).length} Lane(s). Every acknowledgement and failure is retained; retries target only incomplete Lanes.`}
          submitLabel="Send range STOP"
          defaultOfficial={interruption.openedBy}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmit={async (officialName) => {
            const succeeded = await onMutate(() =>
              applyRangePause(
                {
                  competitionId,
                  targetLaneIds: targetRangeLaneIds,
                  commandLaneIds: pendingRangeLaneIds(interruption, 'PAUSE', targetRangeLaneIds),
                  interruptionId: interruption.id,
                  officialName,
                },
                rangeWorkflowPorts(),
              ),
            );
            if (succeeded) onAction(null);
          }}
        />
      )}
      {action === 'end' && (
        <EndInterruptionForm
          interruption={interruption}
          saving={saving}
          onCancel={() => onAction(null)}
          onMutate={onMutate}
        />
      )}
      {action === 'grant' && (
        <GrantForm interruption={interruption} saving={saving} onCancel={() => onAction(null)} onMutate={onMutate} />
      )}
      {action === 'qualification-decision' && (
        <QualificationRecoveryDecisionForm
          interruption={interruption}
          saving={saving}
          onCancel={() => onAction(null)}
          onMutate={onMutate}
        />
      )}
      {action === 'recovery' && (
        <TargetRecoveryForm
          interruption={interruption}
          saving={saving}
          onCancel={() => onAction(null)}
          onMutate={onMutate}
        />
      )}
      {action === 'resume' &&
        competitionId &&
        interruption.laneId &&
        latestGrant?.authorizedRemainingSeconds !== null &&
        latestGrant && (
          <LaneOperationForm
            title="Apply authorized Lane resume"
            description={`Resume with ${formatDuration(latestGrant.authorizedRemainingSeconds!)}${latestGrant.unlimitedSightingShots ? ' in SIGHTING mode' : ' in MATCH mode'}. The recorded grant is not recalculated.`}
            submitLabel="Resume Lane timer"
            defaultOfficial={latestGrant.officialName}
            saving={saving}
            onCancel={() => onAction(null)}
            onSubmit={async (officialName) => {
              const succeeded = await onMutate(() =>
                applyLaneResume(
                  {
                    competitionId,
                    laneId: interruption.laneId!,
                    interruptionId: interruption.id,
                    officialName,
                    authorizedRemainingSeconds: latestGrant.authorizedRemainingSeconds!,
                    unlimitedSightingShots: latestGrant.unlimitedSightingShots === true,
                  },
                  laneWorkflowPorts(),
                ),
              );
              if (succeeded) onAction(null);
            }}
          />
        )}
      {action === 'resume' &&
        competitionId &&
        rangeControlAvailable &&
        latestGrant?.authorizedRemainingSeconds !== null &&
        latestGrant && (
          <LaneOperationForm
            title="Apply authorized range resume"
            description={`Use one shared start timestamp for the incomplete Lanes, with ${formatDuration(latestGrant.authorizedRemainingSeconds!)} authorized.`}
            submitLabel="Resume range timers"
            defaultOfficial={latestGrant.officialName}
            saving={saving}
            onCancel={() => onAction(null)}
            onSubmit={async (officialName) => {
              const succeeded = await onMutate(() =>
                applyRangeResume(
                  {
                    competitionId,
                    targetLaneIds: targetRangeLaneIds,
                    commandLaneIds: pendingRangeLaneIds(interruption, 'RESUME', targetRangeLaneIds),
                    interruptionId: interruption.id,
                    officialName,
                    authorizedRemainingSeconds: latestGrant.authorizedRemainingSeconds!,
                    unlimitedSightingShots: latestGrant.unlimitedSightingShots === true,
                  },
                  rangeWorkflowPorts(),
                ),
              );
              if (succeeded) onAction(null);
            }}
          />
        )}
      {action === 'match' && competitionId && interruption.laneId && (
        <LaneOperationForm
          title="Resume MATCH fire"
          description="Use this only after the athlete has completed the authorized unlimited sighting shots."
          submitLabel="Resume MATCH"
          defaultOfficial={latestGrant?.officialName ?? interruption.openedBy}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmit={async (officialName) => {
            const succeeded = await onMutate(() =>
              applyLaneMatchResume(
                { competitionId, laneId: interruption.laneId!, interruptionId: interruption.id, officialName },
                laneWorkflowPorts(),
              ),
            );
            if (succeeded) onAction(null);
          }}
        />
      )}
      {action === 'match' && competitionId && rangeControlAvailable && (
        <LaneOperationForm
          title="Resume range MATCH fire"
          description="Use after the authorized range sighting period. Partial outcomes remain retryable by Lane."
          submitLabel="Resume range MATCH"
          defaultOfficial={latestGrant?.officialName ?? interruption.openedBy}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmit={async (officialName) => {
            const succeeded = await onMutate(() =>
              applyRangeMatchResume(
                {
                  competitionId,
                  targetLaneIds: targetRangeLaneIds,
                  commandLaneIds: pendingRangeLaneIds(interruption, 'MATCH_RESUME', targetRangeLaneIds),
                  interruptionId: interruption.id,
                  officialName,
                },
                rangeWorkflowPorts(),
              ),
            );
            if (succeeded) onAction(null);
          }}
        />
      )}
      {action === 'entry' && (
        <GenericEntryForm
          interruption={interruption}
          allowFinalization={
            operationalRecoveryComplete && qualificationDecisionRecorded && qualificationRecoveryComplete
          }
          saving={saving}
          onCancel={() => onAction(null)}
          onMutate={onMutate}
        />
      )}

      {targetRecoveryAssessments.length > 0 && (
        <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
          <h4 className="text-[13px] font-semibold text-vscode-text">Target recovery evidence</h4>
          <div className="mt-2 space-y-2">
            {targetRecoveryAssessments.map((assessment) => (
              <div key={assessment.id} className="border-l-2 border-vscode-border pl-3 text-xs leading-5">
                <p className="font-medium text-vscode-text">{assessment.statement}</p>
                <p className="text-vscode-text-muted">
                  Repair completed:{' '}
                  {assessment.repairCompletedAt
                    ? new Date(assessment.repairCompletedAt).toLocaleString()
                    : 'not within the recorded recovery'}{' '}
                  · Reserve move:{' '}
                  {assessment.movedToReserveFiringPoint
                    ? `yes, firing point ${assessment.reserveFiringPointNumber}`
                    : 'no'}
                </p>
                <p className="text-vscode-dimmed">
                  {assessment.officialName} · {new Date(assessment.assessedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(interruption.commandBatches?.length ?? 0) > 0 && (
        <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
          <h4 className="text-[13px] font-semibold text-vscode-text">Range command attempts</h4>
          <div className="mt-2 space-y-2">
            {interruption.commandBatches!.map((batch) => (
              <div key={batch.id} className="border-l-2 border-vscode-border pl-3 text-xs leading-5">
                <p className={batch.success ? 'font-medium text-vscode-text' : 'font-medium text-vscode-warning'}>
                  {formatEnum(batch.operation)} · {batch.outcomes.filter((outcome) => outcome.status === 'done').length}
                  /{batch.outcomes.length} acknowledged in this attempt
                </p>
                <p className="text-vscode-text-muted">
                  {batch.outcomes.map((outcome) => `${shortLane(outcome.laneId)}: ${outcome.status}`).join(' · ')}
                </p>
                <p className="text-vscode-dimmed">
                  {batch.officialName} · {new Date(batch.occurredAt).toLocaleString()} · {batch.id.slice(0, 8)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <AuditHistory entries={interruption.entries} />
    </div>
  );
}

function TargetRecoveryForm({ interruption, saving, onCancel, onMutate }: FormProps) {
  const [repairCompleted, setRepairCompleted] = useState(false);
  const [repairCompletedAt, setRepairCompletedAt] = useState(toLocalInputValue(new Date()));
  const [movedToReserve, setMovedToReserve] = useState(false);
  const [reserveFiringPointNumber, setReserveFiringPointNumber] = useState('');
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState(interruption.openedBy);
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await rangeInterruptionsService.recordTargetRecovery({
            caseId: interruption.id,
            ...(repairCompleted ? { repairCompletedAt: new Date(repairCompletedAt).toISOString() } : {}),
            movedToReserveFiringPoint: movedToReserve,
            ...(movedToReserve ? { reserveFiringPointNumber: Number(reserveFiringPointNumber) } : {}),
            statement,
            officialName,
            assessedAt: new Date().toISOString(),
          });
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Record single-target recovery facts</h4>
      <p className="text-xs leading-5 text-vscode-text-muted">
        ISSF 6.10.9.2 applies only when repair exceeds five minutes and the athlete moves to a reserve firing point.
        This record does not grant time.
      </p>
      <label className="flex items-start gap-2 text-xs text-vscode-text">
        <input
          type="checkbox"
          checked={repairCompleted}
          onChange={(event) => setRepairCompleted(event.target.checked)}
        />
        The target was repaired
      </label>
      {repairCompleted && (
        <Field label="Repair completed at">
          <input
            required
            type="datetime-local"
            step={1}
            value={repairCompletedAt}
            onChange={(event) => setRepairCompletedAt(event.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      <label className="flex items-start gap-2 text-xs text-vscode-text">
        <input type="checkbox" checked={movedToReserve} onChange={(event) => setMovedToReserve(event.target.checked)} />
        Athlete moved to a reserve firing point
      </label>
      {movedToReserve && (
        <Field label="Reserve firing point number">
          <input
            required
            type="number"
            min={1}
            step={1}
            value={reserveFiringPointNumber}
            onChange={(event) => setReserveFiringPointNumber(event.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      <Field label="Observed recovery facts">
        <textarea
          required
          rows={2}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Official name">
        <input
          required
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
          className={inputClass}
        />
      </Field>
      <FormButtons saving={saving} submitLabel="Record recovery facts" onCancel={onCancel} />
    </form>
  );
}

function RecommendationPanel({ interruption }: { interruption: RangeInterruptionCaseDto }) {
  const recommendation = interruption.recommendation!;
  if (recommendation.type === 'QUALIFICATION_TIMED_TARGET') {
    const recovery = recommendation.seriesRecovery;
    const execution =
      recovery.execution?.mode === 'SECONDS_PER_SHOT'
        ? `${recovery.execution.secondsPerShot}s per shot · ${recovery.execution.totalSeconds}s total`
        : recovery.execution?.mode === 'FIRST_EXPOSURE_OF_NEXT_SERIES'
          ? 'Start on the first exposure of the next competition series'
          : recovery.execution?.mode === 'SAME_TIMED_TARGET_PROGRAM'
            ? 'Repeat with the same timed-target program'
            : 'No recovery firing';
    return (
      <section className="rounded-[3px] border border-vscode-warning/60 bg-vscode-bg p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-vscode-warning">
          <ClockAlert size={14} aria-hidden="true" /> ISSF 25m Qualification recommendation — not an authorization
        </div>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <Detail label="Recorded interruption" value={formatDuration(recommendation.interruptionSeconds)} />
          <Detail label="Stage" value={recommendation.stageId} />
          <Detail
            label="Extra sighting series"
            value={
              recommendation.extraSighting.required ? `${recommendation.extraSighting.shots} shots` : 'Not required'
            }
          />
          <Detail label="Series treatment" value={formatEnum(recovery.treatment)} />
          <Detail label="Recovery shots" value={String(recovery.shotsToFire)} />
          {recommendation.minimumPauseAfterSightingSeconds !== undefined && (
            <Detail
              label="Pause after sighting"
              value={formatDuration(recommendation.minimumPauseAfterSightingSeconds)}
            />
          )}
          <Detail label="Execution" value={execution} />
          <Detail label="Rules" value={recommendation.ruleReferences.join('; ')} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-vscode-text-muted">{recommendation.explanation}</p>
        <p className="mt-2 text-xs leading-5 text-vscode-warning">
          Record the Jury decision separately. This recommendation does not annul shots or start a Lane program.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-[3px] border border-vscode-warning/60 bg-vscode-bg p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-vscode-warning">
        <ClockAlert size={14} aria-hidden="true" /> ISSF recommendation — not yet an authorization
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        <Detail label="Recorded time lost" value={formatDuration(recommendation.lostTimeSeconds)} />
        <Detail label="Preserved remaining time" value={formatDuration(recommendation.baseRemainingSeconds)} />
        <Detail
          label="Suggested addition beyond preserved time"
          value={formatDuration(recommendation.suggestedAdditionalSeconds)}
        />
        <Detail
          label="Suggested resume time"
          value={formatDuration(recommendation.suggestedAuthorizedRemainingSeconds)}
        />
        <Detail
          label="Unlimited sighting shots"
          value={recommendation.unlimitedSightingShots ? 'Suggested' : 'Not suggested'}
        />
        <Detail label="Rules" value={recommendation.ruleReferences} />
      </dl>
      <p className="mt-3 text-xs leading-5 text-vscode-text-muted">{recommendation.explanation}</p>
    </section>
  );
}

function QualificationRecoveryDecisionHistory({
  decisions,
}: {
  decisions: readonly QualificationTimedTargetRecoveryDecisionDto[];
}) {
  return (
    <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <h4 className="text-[13px] font-semibold text-vscode-text">Official 25m recovery decisions</h4>
      <div className="mt-2 space-y-2">
        {decisions.map((decision, index) => (
          <div key={decision.id} className="border-l-2 border-vscode-border pl-3 text-xs leading-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-vscode-text">
                Decision {index + 1} · {decision.officialName}
              </span>
              <span className={decision.followsRecommendation ? 'text-vscode-success' : 'text-vscode-warning'}>
                {decision.followsRecommendation ? 'Matches recommendation' : 'Official variance'}
              </span>
            </div>
            <p className="text-vscode-text-muted">
              {decision.authorizedRecovery.extraSightingSeriesShots} extra sighting shots ·{' '}
              {decision.authorizedRecovery.minimumPauseAfterSightingSeconds ?? 0}s pause ·{' '}
              {formatEnum(decision.authorizedRecovery.seriesRecovery.treatment)} ·{' '}
              {decision.authorizedRecovery.seriesRecovery.shotsToFire} recovery shots
            </p>
            <p className="whitespace-pre-wrap text-vscode-text">{decision.statement}</p>
            <p className="text-vscode-dimmed">
              {decision.ruleReference} · {decision.incidentReportReference} ·{' '}
              {new Date(decision.decidedAt).toLocaleString()} · {decision.id.slice(0, 8)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function QualificationRecoveryDecisionForm({ interruption, saving, onCancel, onMutate }: FormProps) {
  const recommendation = interruption.recommendation;
  if (recommendation?.type !== 'QUALIFICATION_TIMED_TARGET') {
    throw new Error('Qualification timed-target recommendation is unavailable');
  }
  const latest = interruption.qualificationTimedTargetRecoveryDecisions.at(-1) ?? null;
  const suggested = latest?.authorizedRecovery ?? authorizedRecoveryFrom(recommendation);
  const [sightingPauseSeconds, setSightingPauseSeconds] = useState(
    String(suggested.minimumPauseAfterSightingSeconds ?? 0),
  );
  const [extraSightingShots, setExtraSightingShots] = useState(String(suggested.extraSightingSeriesShots));
  const [treatment, setTreatment] = useState(suggested.seriesRecovery.treatment);
  const [shotsToFire, setShotsToFire] = useState(String(suggested.seriesRecovery.shotsToFire));
  const [completionMode, setCompletionMode] = useState<'SECONDS_PER_SHOT' | 'FIRST_EXPOSURE_OF_NEXT_SERIES'>(
    suggested.seriesRecovery.execution?.mode === 'SECONDS_PER_SHOT'
      ? 'SECONDS_PER_SHOT'
      : 'FIRST_EXPOSURE_OF_NEXT_SERIES',
  );
  const [secondsPerShot, setSecondsPerShot] = useState(
    String(
      suggested.seriesRecovery.execution?.mode === 'SECONDS_PER_SHOT'
        ? suggested.seriesRecovery.execution.secondsPerShot
        : 48,
    ),
  );
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [incidentReportReference, setIncidentReportReference] = useState('');
  const [ruleReference, setRuleReference] = useState(recommendation.ruleReferences.join('; '));
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const recoveryShots = Number(shotsToFire);
          const seriesRecovery =
            treatment === 'KEEP_RECORDED_SERIES'
              ? ({ treatment, shotsToFire: 0, execution: null } as const)
              : treatment === 'ANNUL_AND_REPEAT'
                ? ({
                    treatment,
                    shotsToFire: recoveryShots,
                    execution: { mode: 'SAME_TIMED_TARGET_PROGRAM' },
                  } as const)
                : completionMode === 'SECONDS_PER_SHOT'
                  ? ({
                      treatment,
                      shotsToFire: recoveryShots,
                      execution: {
                        mode: completionMode,
                        secondsPerShot: Number(secondsPerShot),
                        totalSeconds: Number(secondsPerShot) * recoveryShots,
                      },
                    } as const)
                  : ({
                      treatment,
                      shotsToFire: recoveryShots,
                      execution: { mode: completionMode },
                    } as const);
          const response = await rangeInterruptionsService.recordQualificationTimedTargetRecoveryDecision({
            id: crypto.randomUUID(),
            caseId: interruption.id,
            ...(latest ? { supersedesDecisionId: latest.id } : {}),
            authorizedRecovery: {
              extraSightingSeriesShots: Number(extraSightingShots),
              ...(suggested.minimumPauseAfterSightingSeconds !== undefined || Number(sightingPauseSeconds) > 0
                ? { minimumPauseAfterSightingSeconds: Number(sightingPauseSeconds) }
                : {}),
              seriesRecovery,
            },
            statement,
            officialName,
            incidentReportReference,
            ruleReference,
            decidedAt: new Date().toISOString(),
          });
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">
        {latest ? 'Supersede official 25m recovery decision' : 'Record official 25m recovery decision'}
      </h4>
      <p className="text-xs leading-5 text-vscode-warning">
        Suggested values are prefilled. Editing them records an explicit official variance; it still does not operate a
        Lane or change a score.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Extra sighting series shots">
          <input
            required
            type="number"
            min={0}
            step={1}
            value={extraSightingShots}
            onChange={(event) => setExtraSightingShots(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Pause after sighting (seconds)">
          <input
            type="number"
            min="0"
            step="1"
            value={sightingPauseSeconds}
            onChange={(event) => setSightingPauseSeconds(event.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Series treatment">
          <select
            value={treatment}
            onChange={(event) =>
              setTreatment(
                event.target.value as 'KEEP_RECORDED_SERIES' | 'ANNUL_AND_REPEAT' | 'COMPLETE_REMAINING_SHOTS',
              )
            }
            className={inputClass}
          >
            <option value="KEEP_RECORDED_SERIES">Keep recorded series</option>
            <option value="ANNUL_AND_REPEAT">Annul and repeat</option>
            <option value="COMPLETE_REMAINING_SHOTS">Complete remaining shots</option>
          </select>
        </Field>
        {treatment !== 'KEEP_RECORDED_SERIES' && (
          <Field label="Authorized recovery shots">
            <input
              required
              type="number"
              min={treatment === 'ANNUL_AND_REPEAT' ? 1 : 0}
              step={1}
              value={shotsToFire}
              onChange={(event) => setShotsToFire(event.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        {treatment === 'COMPLETE_REMAINING_SHOTS' && (
          <Field label="Completion timing">
            <select
              value={completionMode}
              onChange={(event) =>
                setCompletionMode(event.target.value as 'SECONDS_PER_SHOT' | 'FIRST_EXPOSURE_OF_NEXT_SERIES')
              }
              className={inputClass}
            >
              <option value="SECONDS_PER_SHOT">Seconds per shot</option>
              <option value="FIRST_EXPOSURE_OF_NEXT_SERIES">First exposure of next series</option>
            </select>
          </Field>
        )}
        {treatment === 'COMPLETE_REMAINING_SHOTS' && completionMode === 'SECONDS_PER_SHOT' && (
          <Field label="Seconds per shot">
            <input
              required
              type="number"
              min={1}
              step={1}
              value={secondsPerShot}
              onChange={(event) => setSecondsPerShot(event.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Range Incident Report reference">
          <input
            required
            value={incidentReportReference}
            onChange={(event) => setIncidentReportReference(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Official name">
          <input
            required
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Rule reference">
        <input
          required
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Decision statement">
        <textarea
          required
          rows={3}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-start gap-2 text-xs text-vscode-warning">
        <input
          required
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5"
        />
        I confirm this is an official recovery decision, not an automatic Rule Pack action.
      </label>
      <FormButtons
        saving={saving}
        submitDisabled={!confirmed}
        submitLabel={latest ? 'Supersede decision' : 'Record recovery decision'}
        onCancel={onCancel}
      />
    </form>
  );
}

function authorizedRecoveryFrom(recommendation: QualificationTimedTargetInterruptionRecommendationDto) {
  return {
    extraSightingSeriesShots: recommendation.extraSighting.shots,
    ...(recommendation.minimumPauseAfterSightingSeconds !== undefined
      ? { minimumPauseAfterSightingSeconds: recommendation.minimumPauseAfterSightingSeconds }
      : {}),
    seriesRecovery: recommendation.seriesRecovery,
  };
}

function EndInterruptionForm({ interruption, saving, onCancel, onMutate }: FormProps) {
  const [occurredAt, setOccurredAt] = useState(toLocalInputValue(new Date()));
  const [statement, setStatement] = useState('The interruption ended and the athlete is ready for the Jury decision.');
  const [officialName, setOfficialName] = useState(interruption.openedBy);
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await rangeInterruptionsService.appendEntry({
            caseId: interruption.id,
            type: 'ENDED',
            occurredAt: new Date(occurredAt).toISOString(),
            statement,
            officialName,
          });
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">End interruption and calculate lost time</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Ended at">
          <input
            required
            type="datetime-local"
            step={1}
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Official name">
          <input
            required
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Statement">
        <textarea
          required
          rows={2}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <FormButtons saving={saving} submitLabel="End interruption" onCancel={onCancel} />
    </form>
  );
}

function GrantForm({ interruption, saving, onCancel, onMutate }: FormProps) {
  const recommendation = interruption.recommendation?.type === 'MATCH_TIME' ? interruption.recommendation : undefined;
  const [extensionSeconds, setExtensionSeconds] = useState(String(recommendation?.suggestedAdditionalSeconds ?? 0));
  const [authorizedRemainingSeconds, setAuthorizedRemainingSeconds] = useState(
    String(recommendation?.suggestedAuthorizedRemainingSeconds ?? interruption.remainingSecondsAtStart),
  );
  const [unlimitedSightingShots, setUnlimitedSightingShots] = useState(recommendation?.unlimitedSightingShots ?? false);
  const [incidentReportReference, setIncidentReportReference] = useState('');
  const [ruleReference, setRuleReference] = useState(recommendation?.ruleReferences ?? 'ISSF 6.11.3');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await rangeInterruptionsService.appendEntry({
            caseId: interruption.id,
            type: 'TIME_GRANTED',
            occurredAt: new Date().toISOString(),
            statement,
            officialName,
            extensionSeconds: Number(extensionSeconds),
            authorizedRemainingSeconds: Number(authorizedRemainingSeconds),
            unlimitedSightingShots,
            incidentReportReference,
            ruleReference,
          });
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Record official time grant</h4>
      <p className="text-xs leading-5 text-vscode-warning">
        Values are prefilled from the recommendation, but this submit records an independent Jury / Range Officer
        decision.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Addition beyond preserved timer (seconds)">
          <input
            required
            type="number"
            min={0}
            step={1}
            value={extensionSeconds}
            onChange={(event) => setExtensionSeconds(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Authorized resume time (seconds)">
          <input
            required
            type="number"
            min={0}
            step={1}
            value={authorizedRemainingSeconds}
            onChange={(event) => setAuthorizedRemainingSeconds(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Range Incident Report reference">
          <input
            required
            value={incidentReportReference}
            onChange={(event) => setIncidentReportReference(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Official name">
          <input
            required
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Rule reference">
        <input
          required
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Decision statement">
        <textarea
          required
          rows={2}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-start gap-2 text-xs text-vscode-text">
        <input
          type="checkbox"
          checked={unlimitedSightingShots}
          onChange={(event) => setUnlimitedSightingShots(event.target.checked)}
        />
        Authorize unlimited sighting shots before MATCH shots resume
      </label>
      <label className="flex items-start gap-2 text-xs text-vscode-warning">
        <input required type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I
        confirm this is an official grant, not an automatic policy result.
      </label>
      <FormButtons
        saving={saving}
        submitDisabled={!confirmed}
        submitLabel="Record official grant"
        onCancel={onCancel}
      />
    </form>
  );
}

function LaneOperationForm({
  title,
  description,
  submitLabel,
  defaultOfficial,
  saving,
  onCancel,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  defaultOfficial: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (officialName: string) => Promise<void>;
}) {
  const [officialName, setOfficialName] = useState(defaultOfficial);
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(officialName);
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">{title}</h4>
      <p className="text-xs leading-5 text-vscode-text-muted">{description}</p>
      <Field label="Official name">
        <input
          required
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
          className={inputClass}
        />
      </Field>
      <FormButtons saving={saving} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}

interface FormProps {
  interruption: RangeInterruptionCaseDto;
  saving: boolean;
  onCancel: () => void;
  onMutate: (operation: () => Promise<RangeInterruptionCaseDto>) => Promise<boolean>;
}

function GenericEntryForm({
  interruption,
  allowFinalization,
  saving,
  onCancel,
  onMutate,
}: FormProps & { allowFinalization: boolean }) {
  const options = entryOptions(interruption.status, allowFinalization);
  const [type, setType] = useState<RangeInterruptionEntryTypeDto>(options[0]!.value);
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [ruleReference, setRuleReference] = useState('');
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const payload = {
            caseId: interruption.id,
            type,
            occurredAt: new Date().toISOString(),
            statement,
            officialName,
            ...(ruleReference.trim() ? { ruleReference: ruleReference.trim() } : {}),
          } as AppendRangeInterruptionEntryPayload;
          const response = await rangeInterruptionsService.appendEntry(payload);
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Record audit action</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Action">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as RangeInterruptionEntryTypeDto)}
            className={inputClass}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Official name">
          <input
            required
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Statement">
        <textarea
          required
          rows={2}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Rule reference">
        <input
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
          className={inputClass}
        />
      </Field>
      <FormButtons saving={saving} submitLabel="Append action" onCancel={onCancel} />
    </form>
  );
}

function LinkScopeForm({
  interruption,
  scope,
  saving,
  onMutate,
}: {
  interruption: RangeInterruptionCaseDto;
  scope: RangeInterruptionScopePayload;
  saving: boolean;
  onMutate: FormProps['onMutate'];
}) {
  const [linkedBy, setLinkedBy] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await rangeInterruptionsService.linkScope({
            caseId: interruption.id,
            scope,
            linkedBy,
            note: `Linked from the current ${scope.scopeType.toLowerCase()} workspace`,
          });
          if (!response.success) throw new Error(response.error.message);
          return response.data;
        });
      }}
    >
      <div className="min-w-52 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-vscode-text">
          <Link size={13} aria-hidden="true" /> Link current {scope.scopeType.toLowerCase()}
        </p>
        <input
          required
          aria-label="Linked by"
          placeholder="Official name"
          value={linkedBy}
          onChange={(event) => setLinkedBy(event.target.value)}
          className={`${inputClass} mt-2`}
        />
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={saving}>
        Link scope
      </Button>
    </form>
  );
}

function AuditHistory({ entries }: { entries: RangeInterruptionCaseDto['entries'] }) {
  return (
    <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
      <h4 className="text-xs font-semibold text-vscode-text">Append-only audit history ({entries.length})</h4>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-vscode-text-muted">No operational action has been recorded yet.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-t border-vscode-border pt-2 text-xs leading-5 first:border-t-0 first:pt-0"
            >
              <p className="font-semibold text-vscode-text">
                {formatEnum(entry.type)} · {entry.officialName}
              </p>
              <p className="text-vscode-text-muted">{entry.statement}</p>
              <p className="text-vscode-dimmed">
                {new Date(entry.occurredAt).toLocaleString()}
                {entry.lostTimeSeconds !== null ? ` · lost ${formatDuration(entry.lostTimeSeconds)}` : ''}
                {entry.authorizedRemainingSeconds !== null
                  ? ` · authorized ${formatDuration(entry.authorizedRemainingSeconds)}`
                  : ''}
                {entry.incidentReportReference ? ` · RIR ${entry.incidentReportReference}` : ''}
                {entry.ruleReference ? ` · ${entry.ruleReference}` : ''}
                {entry.commandId ? ` · command ${entry.commandId.slice(0, 8)}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FormButtons({
  saving,
  submitDisabled = false,
  submitLabel,
  onCancel,
}: {
  saving: boolean;
  submitDisabled?: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" size="sm" disabled={saving || submitDisabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

function entryOptions(
  status: RangeInterruptionCaseDto['status'],
  allowFinalization: boolean,
): Array<{ value: RangeInterruptionEntryTypeDto; label: string }> {
  if (status === 'CLOSED')
    return [
      { value: 'REOPENED', label: 'Reopen record and reinstate hold' },
      { value: 'VOID', label: 'Void record' },
    ];
  const options: Array<{ value: RangeInterruptionEntryTypeDto; label: string }> = [{ value: 'NOTE', label: 'Note' }];
  if (allowFinalization) {
    if (status !== 'OPEN') options.push({ value: 'CLOSED', label: 'Close record and release hold' });
    options.push({ value: 'VOID', label: 'Void record' });
  }
  return options;
}

function uniqueScopes(scopes: readonly RangeInterruptionScopePayload[]): RangeInterruptionScopePayload[] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
      {label}
      {children}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-vscode-dimmed">{label}</dt>
      <dd className="mt-0.5 text-vscode-text">{value}</dd>
    </div>
  );
}

function statusClass(status: RangeInterruptionCaseDto['status']): string {
  if (status === 'VOID') return 'text-vscode-error';
  if (status === 'CLOSED') return 'text-vscode-success';
  return 'text-vscode-warning';
}

function formatEnum(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

function qualificationSeriesRecoveryComplete(
  interruption: RangeInterruptionCaseDto,
  decision: QualificationTimedTargetRecoveryDecisionDto | null,
): boolean {
  if (!interruption.qualificationTimedTargetContext) return true;
  if (!decision) return false;
  const recovery = decision.authorizedRecovery.seriesRecovery;
  if (recovery.treatment === 'KEEP_RECORDED_SERIES') {
    return interruption.qualificationRecoverySettlements.some(
      (settlement) => settlement.decisionId === decision.id && settlement.status === 'APPLIED',
    );
  }
  return interruption.qualificationRecoveryExecutions.some(
    (execution) =>
      execution.decisionId === decision.id &&
      execution.phase === 'SERIES_RECOVERY' &&
      execution.status === 'ADJUDICATED',
  );
}

function blocksQualificationDecisionSupersession(
  execution: RangeInterruptionCaseDto['qualificationRecoveryExecutions'][number],
): boolean {
  if (execution.status === 'CANCELLED') return false;
  return execution.phase !== 'EXTRA_SIGHTING' || execution.status !== 'COMPLETED';
}

function rangeTargetLaneIds(
  interruption: RangeInterruptionCaseDto,
  lanes: readonly RangeInterruptionLaneOption[],
): string[] {
  return interruption.commandBatches?.at(0)?.targetLaneIds ?? lanes.map((lane) => lane.laneId);
}

function pendingRangeLaneIds(
  interruption: RangeInterruptionCaseDto,
  operation: 'PAUSE' | 'RESUME' | 'MATCH_RESUME',
  targetLaneIds: readonly string[],
): string[] {
  const latest = new Map<string, 'done' | 'error' | 'timeout'>();
  for (const batch of interruption.commandBatches ?? []) {
    if (batch.operation !== operation || !sameLaneSet(batch.targetLaneIds, targetLaneIds)) continue;
    for (const outcome of batch.outcomes) latest.set(outcome.laneId, outcome.status);
  }
  return targetLaneIds.filter((laneId) => latest.get(laneId) !== 'done');
}

function rangeBatchRecoveryComplete(interruption: RangeInterruptionCaseDto): boolean {
  const batches = interruption.commandBatches ?? [];
  return batches.every((batch) => pendingRangeLaneIds(interruption, batch.operation, batch.targetLaneIds).length === 0);
}

function sameLaneSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((laneId) => b.includes(laneId));
}

function shortLane(laneId: string): string {
  return laneId.length > 12 ? laneId.slice(0, 8) : laneId;
}

function toLocalInputValue(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const inputClass =
  'min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';
const formClass = 'space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3';
