// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { finalOperationsService, mqttService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import type { CompetitionPhase } from '@sasakiuri/saika-protocol/CompetitionState';
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
import { toDateTimeLocalValue } from '../shared/common/dateUtils';
import { toggleSetMember } from '../shared/common/toggleSetMember';

import { readLatestShootOffOutcome } from './finalOperationOutcome';
import { buildShootOffUnitOptions, executionRecordStatus, isOfficialSelectedTimedTarget } from './finalOperationRules';

export interface FinalOperationRunOptions {
  readonly competitionId: string;
  readonly competitionTypeId: string;
  readonly competitorUnit: 'INDIVIDUAL' | 'MIXED_TEAM';
  readonly phase: CompetitionPhase;
  readonly lanes: readonly DirectorLaneSnapshotDto[];
  readonly eventId?: string;
}

export type FinalOperationRunState = ReturnType<typeof useFinalOperationRun>;

/**
 * Owns the Final command run of one competition: the run query, the official's entries and every command.
 *
 * During a shoot-off the run refreshes every second in the background. Command errors and refresh errors are
 * reported separately: a background refresh is skipped while a command runs, never clears the command error, and is
 * discarded when a later refresh or a command result superseded it.
 */
export function useFinalOperationRun({
  competitionId,
  competitionTypeId,
  competitorUnit,
  phase,
  lanes,
  eventId,
}: FinalOperationRunOptions) {
  const [run, setRun] = useState<FinalOperationRunDto | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [scheduledStart, setScheduledStart] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() + 10 * 60_000), 'minutes'),
  );
  const [statement, setStatement] = useState('');
  const [finalProtestsResolved, setFinalProtestsResolved] = useState(false);
  const [resultProcessConfirmed, setResultProcessConfirmed] = useState(false);
  const [selectedShootOffUnitIds, setSelectedShootOffUnitIds] = useState<Set<string>>(() => new Set());
  const [selectedExecutionLaneIds, setSelectedExecutionLaneIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const commandRunning = useRef(false);

  /** A background refresh keeps the command error and never replaces a newer command result. */
  const load = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      const generation = ++refreshGeneration.current;
      if (!background) {
        setLoading(true);
        setError(null);
        setRefreshError(null);
      }
      try {
        const response = await finalOperationsService.getByCompetition({ competitionId });
        if (generation !== refreshGeneration.current) return;
        const loaded = unwrap(response);
        setRun(loaded);
        setRefreshError(null);
        if (loaded) setOfficialName((current) => current || loaded.createdBy);
      } catch (caught) {
        if (generation === refreshGeneration.current) setRefreshError(errorMessage(caught));
      } finally {
        if (!background) setLoading(false);
      }
    },
    [competitionId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (run?.status !== 'ACTIVE' || run.currentBranch !== 'SHOOT_OFF') return;
    const timer = window.setInterval(() => {
      if (!commandRunning.current) void load({ background: true });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [load, run?.currentBranch, run?.status]);

  /** Runs one command: background refreshes pause, and a failure becomes the command error. */
  const runCommand = async (work: () => Promise<void>) => {
    commandRunning.current = true;
    setSaving(true);
    setError(null);
    setRefreshError(null);
    try {
      await work();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      commandRunning.current = false;
      setSaving(false);
    }
  };

  /** Applies a command result; refreshes that started before it can no longer overwrite it. */
  const applyCommandRun = (next: FinalOperationRunDto) => {
    refreshGeneration.current += 1;
    setRun(next);
  };

  const currentStepId = run?.currentStep?.step.id;
  const currentStepStatus = run?.currentStep?.status;
  // Each step that reaches confirmation starts without official-selected Lanes; runs when the step changes.
  useEffect(() => {
    if (currentStepStatus !== 'AWAITING_CONFIRMATION') return;
    setSelectedExecutionLaneIds(new Set());
  }, [currentStepId, currentStepStatus]);

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
  const latestShootOffOutcome = useMemo(() => (run ? readLatestShootOffOutcome(run) : null), [run]);

  const toggleExecutionLane = (laneId: string, selected: boolean) =>
    setSelectedExecutionLaneIds((current) => toggleSetMember(current, laneId, selected));
  const toggleShootOffUnit = (unitId: string, selected: boolean) =>
    setSelectedShootOffUnitIds((current) => toggleSetMember(current, unitId, selected));

  const createRun = async () => {
    await runCommand(async () => {
      const created = unwrap(
        await finalOperationsService.create({
          competitionId,
          competitionTypeId,
          ...(eventId ? { eventId } : {}),
          scheduledStartAt: new Date(scheduledStart).toISOString(),
          officialName: officialName.trim(),
        }),
      );
      applyCommandRun(created);
    });
  };

  /** Confirms the step when it awaits confirmation, executes it on Lane and records the execution outcome. */
  const executeCurrentStep = async () => {
    if (!run?.currentStep || !officialName.trim()) return;
    const { step } = run.currentStep;
    await runCommand(async () => {
      let pendingRun = run;
      const acknowledgedRequirementIds = await confirmPhaseRequirements(competitionTypeId, phase, step);
      if (acknowledgedRequirementIds === null) return;

      if (pendingRun.currentStep?.status === 'AWAITING_CONFIRMATION') {
        const confirmed = unwrap(
          await finalOperationsService.confirmStep({
            runId: pendingRun.id,
            stepId: pendingRun.currentStep.step.id,
            ...(isOfficialSelectedTimedTarget(pendingRun.currentStep.step)
              ? { eligibleLaneIds: [...selectedExecutionLaneIds] }
              : {}),
            ...(statement.trim() ? { statement: statement.trim() } : {}),
            officialName: officialName.trim(),
          }),
        );
        pendingRun = confirmed;
        applyCommandRun(pendingRun);
      }

      const current = pendingRun.currentStep;
      if (!current || current.status !== 'AWAITING_EXECUTION' || !current.confirmationEntryId) {
        throw new Error('The confirmed Final step is not awaiting execution');
      }
      if (
        current.step.effect.type === 'DECLARE_RESULTS' &&
        (!eventId || !finalProtestsResolved || !resultProcessConfirmed)
      ) {
        throw new Error('RESULTS ARE FINAL requires an event and both explicit confirmations');
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
        ...(current.step.effect.type === 'DECLARE_RESULTS'
          ? {
              declarationConfirmation: {
                finalProtestsResolved: true as const,
                resultProcessConfirmed: true as const,
              },
            }
          : {}),
      });
      if (!execution.success) {
        const recorded = unwrap(
          await finalOperationsService.recordExecution({
            runId: pendingRun.id,
            confirmationEntryId: current.confirmationEntryId,
            status: 'ERROR',
            statement: execution.error.message,
            officialName: officialName.trim(),
          }),
        );
        applyCommandRun(recorded);
        throw new Error(execution.error.message);
      }

      const result = execution.data;
      const recorded = unwrap(
        await finalOperationsService.recordExecution({
          runId: pendingRun.id,
          confirmationEntryId: current.confirmationEntryId,
          status: executionRecordStatus(result),
          ...(result.command ? { commandId: result.command.commandId } : {}),
          statement: result.statement,
          officialName: officialName.trim(),
        }),
      );
      applyCommandRun(recorded);
      setStatement('');
      if (current.step.effect.type === 'DECLARE_RESULTS') {
        setFinalProtestsResolved(false);
        setResultProcessConfirmed(false);
      }
    });
  };

  const skipCurrentStep = async () => {
    if (!run?.currentStep || !statement.trim() || !officialName.trim()) return;
    const stepId = run.currentStep.step.id;
    await runCommand(async () => {
      const skipped = unwrap(
        await finalOperationsService.skipStep({
          runId: run.id,
          stepId,
          reason: statement.trim(),
          officialName: officialName.trim(),
        }),
      );
      applyCommandRun(skipped);
      setStatement('');
    });
  };

  const abortRun = async () => {
    if (!run || !statement.trim() || !officialName.trim()) return;
    const confirmed = await useConfirmDialogStore
      .getState()
      .openConfirm(
        'Abort this Final command run and clear its Lane cue? This does not issue STOP. Confirm the range is stopped or otherwise safe first. The command history will be kept.',
      );
    if (!confirmed) return;
    await runCommand(async () => {
      const aborted = unwrap(
        await finalOperationsService.abort({
          runId: run.id,
          reason: statement.trim(),
          officialName: officialName.trim(),
        }),
      );
      applyCommandRun(aborted);
      setStatement('');
      const cleared = await mqttService.clearFinalCue({ competitionId });
      if (!cleared.success) {
        throw new Error(
          `Final run was aborted, but the retained Lane cue could not be cleared: ${cleared.error?.message ?? 'unknown error'}`,
        );
      }
    });
  };

  const clearRetainedCue = async () => {
    await runCommand(async () => {
      unwrap(await mqttService.clearFinalCue({ competitionId }), 'Failed to clear the retained Lane cue');
    });
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
    const checkpointStepId = run.currentStep.step.id;
    await runCommand(async () => {
      const started = unwrap(
        await finalOperationsService.startShootOff({
          runId: run.id,
          checkpointStepId,
          eligibleLaneIds: selectedShootOffUnits.flatMap((unit) => unit.laneIds),
          units: selectedShootOffUnits.map(({ issue: _issue, ...unit }) => unit),
          reason: statement.trim(),
          officialName: officialName.trim(),
        }),
      );
      applyCommandRun(started);
      setStatement('');
    });
  };

  /** Closes the round; the units that remain tied stay selected for the next round. */
  const closeShootOffRound = async () => {
    if (!run?.shootOff || run.shootOff.status !== 'AWAITING_RESOLUTION' || !statement.trim() || !officialName.trim()) {
      return;
    }
    await runCommand(async () => {
      const closed = unwrap(
        await finalOperationsService.closeShootOffRound({
          runId: run.id,
          statement: statement.trim(),
          officialName: officialName.trim(),
        }),
      );
      applyCommandRun(closed);
      setStatement('');
      const outcome = readLatestShootOffOutcome(closed);
      setSelectedShootOffUnitIds(new Set(outcome?.remainingTiedUnitIds ?? []));
    });
  };

  return {
    run,
    loading,
    saving,
    error,
    refreshError,
    officialName,
    setOfficialName,
    scheduledStart,
    setScheduledStart,
    statement,
    setStatement,
    finalProtestsResolved,
    setFinalProtestsResolved,
    resultProcessConfirmed,
    setResultProcessConfirmed,
    selectedExecutionLaneIds,
    toggleExecutionLane,
    selectedShootOffUnitIds,
    toggleShootOffUnit,
    shootOffCandidates,
    shootOffUnitOptions,
    selectedShootOffUnits,
    latestShootOffOutcome,
    load,
    createRun,
    executeCurrentStep,
    skipCurrentStep,
    abortRun,
    clearRetainedCue,
    startShootOff,
    closeShootOffRound,
  };
}

/**
 * Asks the official to acknowledge the Rule Pack requirements when the step starts Sighting or MATCH. Resolves the
 * acknowledged requirement ids, or null when the official cancels.
 */
async function confirmPhaseRequirements(
  competitionTypeId: string,
  phase: CompetitionPhase,
  step: FinalOperationScriptStepDto,
): Promise<string[] | null> {
  if (step.effect.type !== 'OPEN_FIRING' && step.effect.type !== 'RUN_TIMED_TARGET') return [];
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
