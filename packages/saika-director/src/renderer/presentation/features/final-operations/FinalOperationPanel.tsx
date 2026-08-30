// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, ListChecks, RefreshCw } from 'lucide-react';

import { finalOperationsService, mqttService } from '@/renderer/services';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import type { CompetitionPhase } from '@/shared/mqtt';
import type {
  DirectorLaneSnapshotDto,
  FinalOperationRunDto,
  FinalOperationScriptStepDto,
} from '@/shared/ipc/contracts';

import { buildPhaseStartConfirmation } from '../competition-control/phaseStartRequirements';
import {
  asSupportedLaneCompetitionType,
  getLaneCompetitionTiming,
} from '../competition-control/supportedCompetitionTypes';
import { Button } from '../shared/common/Button';

interface FinalOperationPanelProps {
  competitionId: string;
  competitionTypeId: string;
  competitorUnit: 'INDIVIDUAL' | 'MIXED_TEAM';
  phase: CompetitionPhase;
  lanes: readonly DirectorLaneSnapshotDto[];
  eventId?: string;
  disabled?: boolean;
}

export function FinalOperationPanel({
  competitionId,
  competitionTypeId,
  competitorUnit,
  phase,
  lanes,
  eventId,
  disabled = false,
}: FinalOperationPanelProps) {
  const [run, setRun] = useState<FinalOperationRunDto | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [scheduledStart, setScheduledStart] = useState(() => toLocalDateTime(new Date(Date.now() + 10 * 60_000)));
  const [statement, setStatement] = useState('');
  const [selectedShootOffUnitIds, setSelectedShootOffUnitIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await finalOperationsService.getByCompetition({ competitionId });
      if (!response.success) throw new Error(response.error.message);
      setRun(response.data);
      if (response.data) setOfficialName((current) => current || response.data!.createdBy);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (run?.status !== 'ACTIVE' || run.currentBranch !== 'SHOOT_OFF') return;
    const timer = window.setInterval(() => void load(), 1_000);
    return () => window.clearInterval(timer);
  }, [load, run?.currentBranch, run?.status]);

  const completedCount = useMemo(
    () => run?.steps.filter((step) => step.status === 'COMPLETED' || step.status === 'SKIPPED').length ?? 0,
    [run],
  );

  const createRun = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await finalOperationsService.create({
        competitionId,
        competitionTypeId,
        ...(eventId ? { eventId } : {}),
        scheduledStartAt: new Date(scheduledStart).toISOString(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setRun(response.data);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const executeCurrentStep = async () => {
    if (!run?.currentStep || !officialName.trim()) return;
    setSaving(true);
    setError(null);
    let pendingRun = run;
    try {
      const acknowledgedRequirementIds = await confirmPhaseRequirements(competitionTypeId, phase, run.currentStep.step);
      if (acknowledgedRequirementIds === null) return;

      if (pendingRun.currentStep?.status === 'AWAITING_CONFIRMATION') {
        const confirmed = await finalOperationsService.confirmStep({
          runId: pendingRun.id,
          stepId: pendingRun.currentStep.step.id,
          ...(statement.trim() ? { statement: statement.trim() } : {}),
          officialName: officialName.trim(),
        });
        if (!confirmed.success) throw new Error(confirmed.error.message);
        pendingRun = confirmed.data;
        setRun(pendingRun);
      }

      const current = pendingRun.currentStep;
      if (!current || current.status !== 'AWAITING_EXECUTION' || !current.confirmationEntryId) {
        throw new Error('The confirmed Final step is not awaiting execution');
      }
      const execution = await mqttService.executeFinalScriptStep({
        competitionId,
        runId: pendingRun.id,
        confirmationEntryId: current.confirmationEntryId,
        branch: pendingRun.currentBranch,
        iteration: pendingRun.shootOff?.iteration ?? 0,
        step: current.step,
        ...(current.eligibleLaneIds.length > 0 ? { eligibleLaneIds: current.eligibleLaneIds } : {}),
        ...(acknowledgedRequirementIds.length > 0 ? { acknowledgedRequirementIds } : {}),
      });
      if (!execution.success) {
        const recorded = await finalOperationsService.recordExecution({
          runId: pendingRun.id,
          confirmationEntryId: current.confirmationEntryId,
          status: 'ERROR',
          statement: execution.error.message,
          officialName: officialName.trim(),
        });
        if (!recorded.success) throw new Error(recorded.error.message);
        setRun(recorded.data);
        throw new Error(execution.error.message);
      }

      const result = execution.data;
      const failedLanes = result.command?.lanes.filter((lane) => lane.status !== 'done') ?? [];
      const status = result.success
        ? 'DONE'
        : failedLanes.every((lane) => lane.status === 'timeout')
          ? 'TIMEOUT'
          : 'ERROR';
      const recorded = await finalOperationsService.recordExecution({
        runId: pendingRun.id,
        confirmationEntryId: current.confirmationEntryId,
        status,
        ...(result.command ? { commandId: result.command.commandId } : {}),
        statement: result.statement,
        officialName: officialName.trim(),
      });
      if (!recorded.success) throw new Error(recorded.error.message);
      setRun(recorded.data);
      setStatement('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const skipCurrentStep = async () => {
    if (!run?.currentStep || !statement.trim() || !officialName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await finalOperationsService.skipStep({
        runId: run.id,
        stepId: run.currentStep.step.id,
        reason: statement.trim(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setRun(response.data);
      setStatement('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const abortRun = async () => {
    if (!run || !statement.trim() || !officialName.trim()) return;
    const confirmed = await useConfirmDialogStore
      .getState()
      .openConfirm(
        'Abort this Final command run and clear its Lane cue? This does not issue STOP. Confirm the range is stopped or otherwise safe first; the audit log remains immutable.',
      );
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      const response = await finalOperationsService.abort({
        runId: run.id,
        reason: statement.trim(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setRun(response.data);
      setStatement('');
      const cleared = await mqttService.clearFinalCue({ competitionId });
      if (!cleared.success) {
        throw new Error(
          `Final run was aborted, but the retained Lane cue could not be cleared: ${cleared.error?.message ?? 'unknown error'}`,
        );
      }
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const clearRetainedCue = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await mqttService.clearFinalCue({ competitionId });
      if (!response.success) throw new Error(response.error?.message ?? 'Failed to clear the retained Lane cue');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const startShootOff = async () => {
    if (
      !run?.currentStep ||
      run.currentBranch !== 'MAIN' ||
      run.currentStep.step.effect.type !== 'CHECKPOINT' ||
      selectedShootOffUnits.length < 2 ||
      !statement.trim() ||
      !officialName.trim()
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await finalOperationsService.startShootOff({
        runId: run.id,
        checkpointStepId: run.currentStep.step.id,
        eligibleLaneIds: selectedShootOffUnits.flatMap((unit) => unit.laneIds),
        units: selectedShootOffUnits.map(({ issue: _issue, ...unit }) => unit),
        reason: statement.trim(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setRun(response.data);
      setStatement('');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const closeShootOffRound = async () => {
    if (!run?.shootOff || run.shootOff.status !== 'AWAITING_RESOLUTION' || !statement.trim() || !officialName.trim()) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await finalOperationsService.closeShootOffRound({
        runId: run.id,
        statement: statement.trim(),
        officialName: officialName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setRun(response.data);
      setStatement('');
      const outcome = readLatestShootOffOutcome(response.data);
      setSelectedShootOffUnitIds(new Set(outcome?.remainingTiedUnitIds ?? []));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const shootOffCandidates = useMemo(
    () => lanes.filter((lane) => lane.competitionState?.phase !== 'FINISHED'),
    [lanes],
  );
  const shootOffUnitOptions = useMemo(
    () => buildShootOffUnitOptions(shootOffCandidates, competitorUnit),
    [competitorUnit, shootOffCandidates],
  );
  const selectedShootOffUnits = useMemo(
    () => shootOffUnitOptions.filter((unit) => !unit.issue && selectedShootOffUnitIds.has(unit.unitId)),
    [selectedShootOffUnitIds, shootOffUnitOptions],
  );
  const atMainCheckpoint =
    run?.status === 'ACTIVE' &&
    run.currentBranch === 'MAIN' &&
    run.currentStep?.status === 'AWAITING_CONFIRMATION' &&
    run.currentStep.step.effect.type === 'CHECKPOINT';
  const latestShootOffOutcome = useMemo(() => (run ? readLatestShootOffOutcome(run) : null), [run]);

  const canSkip =
    run?.currentStep?.status === 'AWAITING_CONFIRMATION' &&
    run.currentStep.step.effect.type === 'NONE' &&
    (run.currentStep.step.kind === 'CHECK' || run.currentStep.step.kind === 'ANNOUNCEMENT');

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Final command runner</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Versioned Rule Pack cues, confirmations, and Lane execution results are recorded separately.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <div className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</div>}

      {!run && !loading && (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-vscode-text-muted">
            Published start
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-xs text-vscode-text-muted">
            Official name
            <input
              value={officialName}
              onChange={(event) => setOfficialName(event.target.value)}
              className={inputClass}
            />
          </label>
          <Button
            className="md:col-span-2 md:w-fit"
            disabled={disabled || saving || !scheduledStart || !officialName.trim()}
            onClick={() => void createRun()}
          >
            Create immutable run
          </Button>
        </div>
      )}

      {run && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vscode-text-muted">
            <span>{run.rulePackId}</span>
            <span>Script {run.scriptVersion}</span>
            <span>
              {completedCount}/{run.steps.length} steps
            </span>
            <span className="font-semibold text-vscode-text">{run.status}</span>
            {run.currentBranch === 'SHOOT_OFF' && run.shootOff && <span>Shoot-off round {run.shootOff.iteration}</span>}
          </div>

          {run.status === 'ABORTED' && (
            <div className="rounded-[3px] border border-vscode-warning p-3">
              <p className="text-xs leading-5 text-vscode-text-muted">
                Abort is already recorded. Retrying this cleanup only removes the presentation cue retained for Lane; it
                does not issue STOP or change the immutable run history.
              </p>
              <Button
                className="mt-2"
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => void clearRetainedCue()}
              >
                Clear retained Lane cue
              </Button>
            </div>
          )}

          {run.currentStep && (
            <div className="rounded-[3px] border border-vscode-border bg-vscode-bg-light p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-vscode-text-muted">
                    {run.currentStep.step.actor} · {run.currentStep.step.kind} ·{' '}
                    {run.currentStep.status.replaceAll('_', ' ')}
                  </p>
                  <p className="mt-2 text-xl font-bold text-vscode-text">{run.currentStep.step.text}</p>
                  <p className="mt-1 text-xs text-vscode-text-muted">ISSF {run.currentStep.step.ruleReference}</p>
                </div>
                {run.currentStep.scheduledFor && (
                  <div className="flex items-center gap-1 text-xs text-vscode-text-muted">
                    <Clock3 size={13} aria-hidden="true" /> {new Date(run.currentStep.scheduledFor).toLocaleString()}
                  </div>
                )}
              </div>

              {run.currentStep.executionAttempts.length > 0 && (
                <p className="mt-3 text-xs text-vscode-warning">
                  Previous attempt: {run.currentStep.executionAttempts.at(-1)?.status} · retry uses the same
                  confirmation.
                </p>
              )}

              {atMainCheckpoint && (
                <div className="mt-4 rounded-[3px] border border-vscode-border p-3">
                  <p className="text-xs font-semibold text-vscode-text">
                    Shoot-off branch (only when the low score is tied)
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-vscode-text-muted">
                    Select only the tied {competitorUnit === 'MIXED_TEAM' ? 'Teams' : 'Finalists'}. Each selected Lane's
                    one shot is kept outside the normal MATCH score and attached to this checkpoint.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {shootOffUnitOptions.map((unit) => (
                      <label key={unit.unitId} className="flex items-start gap-2 text-xs text-vscode-text">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          disabled={Boolean(unit.issue)}
                          checked={selectedShootOffUnitIds.has(unit.unitId)}
                          onChange={(event) =>
                            setSelectedShootOffUnitIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(unit.unitId);
                              else next.delete(unit.unitId);
                              return next;
                            })
                          }
                        />
                        <span>
                          {unit.label}
                          {unit.issue && <span className="block text-vscode-warning">{unit.issue}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                  {latestShootOffOutcome && (
                    <p className="mt-2 text-[11px] text-vscode-text-muted">
                      {latestShootOffOutcome.eliminatedUnitId
                        ? `Previous round resolved: ${shootOffOutcomeUnitLabel(latestShootOffOutcome, latestShootOffOutcome.eliminatedUnitId, lanes)} had the unique lowest aggregate.`
                        : `Tie remains between ${latestShootOffOutcome.remainingTiedUnitIds.map((unitId) => shootOffOutcomeUnitLabel(latestShootOffOutcome, unitId, lanes)).join(', ')}.`}
                    </p>
                  )}
                  <Button
                    className="mt-3"
                    variant="secondary"
                    disabled={
                      disabled ||
                      saving ||
                      selectedShootOffUnits.length < 2 ||
                      !officialName.trim() ||
                      !statement.trim()
                    }
                    onClick={() => void startShootOff()}
                  >
                    Start shoot-off branch ({selectedShootOffUnits.length}{' '}
                    {competitorUnit === 'MIXED_TEAM' ? 'Teams' : 'Finalists'})
                  </Button>
                </div>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs text-vscode-text-muted">
                  Official name
                  <input
                    value={officialName}
                    onChange={(event) => setOfficialName(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs text-vscode-text-muted">
                  Confirmation / exception note
                  <input
                    value={statement}
                    onChange={(event) => setStatement(event.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={disabled || saving || !officialName.trim()} onClick={() => void executeCurrentStep()}>
                  {run.currentStep.status === 'AWAITING_EXECUTION' ? 'Retry execution' : 'Confirm and execute'}
                </Button>
                {canSkip && (
                  <Button
                    variant="secondary"
                    disabled={saving || !officialName.trim() || !statement.trim()}
                    onClick={() => void skipCurrentStep()}
                  >
                    Skip with reason
                  </Button>
                )}
                <Button
                  variant="danger"
                  disabled={saving || !officialName.trim() || !statement.trim()}
                  onClick={() => void abortRun()}
                >
                  Abort run
                </Button>
              </div>
            </div>
          )}

          {run.shootOff?.status === 'AWAITING_RESOLUTION' && (
            <div className="rounded-[3px] border border-vscode-border bg-vscode-bg-light p-4">
              <p className="text-xs font-semibold text-vscode-text">Resolve shoot-off round {run.shootOff.iteration}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {run.shootOff.units.map((unit) => {
                  const shots = unit.laneIds.map((laneId) => ({
                    laneId,
                    shot: run.shootOff?.shots.find((candidate) => candidate.laneId === laneId),
                  }));
                  const complete = shots.every(({ shot }) => shot);
                  const totalX10 = shots.reduce((total, { shot }) => total + (shot?.scoreX10 ?? 0), 0);
                  return (
                    <div key={unit.unitId} className="rounded-[3px] border border-vscode-border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-vscode-text">{unit.label}</span>
                        <span className={complete ? 'font-semibold text-vscode-text' : 'text-vscode-warning'}>
                          {complete ? `${(totalX10 / 10).toFixed(1)} total` : 'Waiting for shot(s)'}
                        </span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-[11px] text-vscode-text-muted">
                        {shots.map(({ laneId, shot }) => (
                          <div key={laneId}>
                            {laneLabelById(lanes, laneId)} · {shot ? (shot.scoreX10 / 10).toFixed(1) : 'waiting'}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs text-vscode-text-muted">
                  Official name
                  <input
                    value={officialName}
                    onChange={(event) => setOfficialName(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs text-vscode-text-muted">
                  Resolution note
                  <input
                    value={statement}
                    onChange={(event) => setStatement(event.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={
                    disabled ||
                    saving ||
                    run.shootOff.shots.length !== run.shootOff.eligibleLaneIds.length ||
                    !statement.trim() ||
                    !officialName.trim()
                  }
                  onClick={() => void closeShootOffRound()}
                >
                  Calculate and return to checkpoint
                </Button>
                <Button
                  variant="danger"
                  disabled={saving || !officialName.trim() || !statement.trim()}
                  onClick={() => void abortRun()}
                >
                  Abort run
                </Button>
              </div>
            </div>
          )}

          {!run.currentStep && run.shootOff?.status !== 'AWAITING_RESOLUTION' && (
            <p className="border-l-2 border-vscode-accent pl-3 text-xs text-vscode-text">
              This run is {run.status.toLowerCase()}. Its command and execution audit remains read-only.
            </p>
          )}
        </>
      )}
    </div>
  );
}

async function confirmPhaseRequirements(
  competitionTypeId: string,
  phase: CompetitionPhase,
  step: FinalOperationScriptStepDto,
): Promise<string[] | null> {
  if (step.effect.type !== 'OPEN_FIRING') return [];
  const startPhase =
    step.effect.purpose === 'SIGHTING' && phase === 'NOT_STARTED'
      ? 'SIGHTING'
      : step.effect.purpose === 'MATCH' && phase === 'SIGHTING_COMPLETE'
        ? 'MATCH'
        : null;
  if (!startPhase) return [];
  const supported = asSupportedLaneCompetitionType(competitionTypeId);
  if (!supported) return [];
  const requirements = getLaneCompetitionTiming(supported).phaseStartRequirements?.[startPhase];
  const confirmation = buildPhaseStartConfirmation(startPhase, requirements);
  if (!confirmation) return [];
  const confirmed = await useConfirmDialogStore.getState().openConfirm(confirmation.message);
  return confirmed ? [...confirmation.acknowledgedRequirementIds] : null;
}

const inputClass =
  'mt-1 block min-h-8 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text';

function toLocalDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function laneLabel(lane: DirectorLaneSnapshotDto): string {
  const point = lane.firingPointNumber ? `FP ${lane.firingPointNumber}` : lane.laneAlias || lane.laneId.slice(0, 8);
  return lane.assignment?.athlete ? `${point} · ${lane.assignment.athlete.name}` : point;
}

function laneLabelById(lanes: readonly DirectorLaneSnapshotDto[], laneId: string): string {
  const lane = lanes.find((candidate) => candidate.laneId === laneId);
  return lane ? laneLabel(lane) : laneId.slice(0, 8);
}

interface ShootOffUnitOption {
  unitId: string;
  label: string;
  laneIds: string[];
  issue?: string;
}

function buildShootOffUnitOptions(
  lanes: readonly DirectorLaneSnapshotDto[],
  competitorUnit: 'INDIVIDUAL' | 'MIXED_TEAM',
): ShootOffUnitOption[] {
  if (competitorUnit === 'INDIVIDUAL') {
    return lanes.map((lane) => ({ unitId: lane.laneId, label: laneLabel(lane), laneIds: [lane.laneId] }));
  }

  const unitsByTeamId = new Map<string, ShootOffUnitOption>();
  const unassigned: ShootOffUnitOption[] = [];
  for (const lane of lanes) {
    const teamId = lane.assignment?.athlete?.teamId;
    if (!teamId) {
      unassigned.push({
        unitId: `UNASSIGNED:${lane.laneId}`,
        label: laneLabel(lane),
        laneIds: [lane.laneId],
        issue: 'Official Mixed Team ID is missing',
      });
      continue;
    }
    const existing = unitsByTeamId.get(teamId);
    if (existing) {
      existing.laneIds.push(lane.laneId);
      existing.label = lane.assignment?.athlete?.teamName ?? existing.label;
    } else {
      unitsByTeamId.set(teamId, {
        unitId: teamId,
        label: lane.assignment?.athlete?.teamName ?? teamId,
        laneIds: [lane.laneId],
      });
    }
  }

  return [
    ...[...unitsByTeamId.values()].map((unit) => ({
      ...unit,
      ...(unit.laneIds.length === 2
        ? {}
        : { issue: `Mixed Team must have exactly two active Lanes (${unit.laneIds.length} found)` }),
    })),
    ...unassigned,
  ];
}

interface ShootOffOutcome {
  eliminatedUnitId: string | null;
  eliminatedUnitLabel: string | null;
  eliminatedLaneIds: string[];
  remainingTiedUnitIds: string[];
  eliminatedLaneId: string | null;
  remainingTiedLaneIds: string[];
  unitScores: Array<{ unitId: string; label: string; laneIds: string[]; scoreX10: number }>;
}

function readLatestShootOffOutcome(run: FinalOperationRunDto): ShootOffOutcome | null {
  const metadata = [...run.entries].reverse().find((entry) => entry.entryType === 'SHOOT_OFF_ROUND_CLOSED')?.metadata;
  if (!metadata) return null;
  const eliminatedLaneId = typeof metadata.eliminatedLaneId === 'string' ? metadata.eliminatedLaneId : null;
  const eliminatedLaneIds = readStringArray(metadata.eliminatedLaneIds);
  const remainingTiedLaneIds = Array.isArray(metadata.remainingTiedLaneIds)
    ? metadata.remainingTiedLaneIds.filter((laneId): laneId is string => typeof laneId === 'string')
    : [];
  const eliminatedUnitId = typeof metadata.eliminatedUnitId === 'string' ? metadata.eliminatedUnitId : eliminatedLaneId;
  const eliminatedUnitLabel = typeof metadata.eliminatedUnitLabel === 'string' ? metadata.eliminatedUnitLabel : null;
  const remainingTiedUnitIds = readStringArray(metadata.remainingTiedUnitIds);
  const unitScores = readShootOffUnitScores(metadata.unitScores);
  return {
    eliminatedUnitId,
    eliminatedUnitLabel,
    eliminatedLaneIds: eliminatedLaneIds.length > 0 ? eliminatedLaneIds : eliminatedLaneId ? [eliminatedLaneId] : [],
    remainingTiedUnitIds: remainingTiedUnitIds.length > 0 ? remainingTiedUnitIds : remainingTiedLaneIds,
    eliminatedLaneId,
    remainingTiedLaneIds,
    unitScores,
  };
}

function shootOffOutcomeUnitLabel(
  outcome: ShootOffOutcome,
  unitId: string,
  lanes: readonly DirectorLaneSnapshotDto[],
): string {
  if (outcome.eliminatedUnitId === unitId && outcome.eliminatedUnitLabel) return outcome.eliminatedUnitLabel;
  const score = outcome.unitScores.find((candidate) => candidate.unitId === unitId);
  if (score) return score.label;
  return laneLabelById(lanes, unitId);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readShootOffUnitScores(value: unknown): ShootOffOutcome['unitScores'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const laneIds = readStringArray(candidate.laneIds);
    if (
      typeof candidate.unitId !== 'string' ||
      typeof candidate.label !== 'string' ||
      typeof candidate.scoreX10 !== 'number' ||
      laneIds.length === 0
    ) {
      return [];
    }
    return [{ unitId: candidate.unitId, label: candidate.label, laneIds, scoreX10: candidate.scoreX10 }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
