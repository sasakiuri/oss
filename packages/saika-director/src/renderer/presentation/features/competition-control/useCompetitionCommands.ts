// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react';

import {
  useCompetitionControlStore,
  type ChampionshipResultContext,
} from '@/renderer/presentation/stores/domain/competitionControl.store';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import { championshipService, mqttService } from '@/renderer/services';
import type { CompetitionStartPhase } from '@/shared/competitionTypes';
import type { ClockQualityAssessmentDto, MqttCommandExecutionResultDto } from '@/shared/ipc/contracts';
import type { Athlete } from '@/shared/mqtt';

import { applyFiringPointAssignmentPlan, type FiringPointAssignmentPlan } from './assignmentPlanning';
import { formatClockMetric } from './competitionFormatting';
import { buildPhaseStartConfirmation } from './phaseStartRequirements';
import type { CompetitionSelection } from './useCompetitionSelection';

function commandSummary(result: MqttCommandExecutionResultDto): string {
  const warnings = result.lanes
    .filter((lane) => lane.warning)
    .map((lane) => `${lane.laneId.slice(0, 8)}: ${lane.warning}`)
    .join(', ');
  const warningSuffix = warnings ? `; warnings: ${warnings}` : '';
  if (result.success) return `${result.action}: all Lanes complete${warningSuffix}`;
  const failures = result.lanes
    .filter((lane) => lane.status !== 'done')
    .map((lane) => `${lane.laneId.slice(0, 8)}: ${lane.status}`)
    .join(', ');
  return `${result.action}: ${failures}${warningSuffix}`;
}

interface CompetitionCommandOptions {
  selection: Pick<
    CompetitionSelection,
    | 'activeCompetition'
    | 'activeCompetitionTiming'
    | 'selectedAvailableLaneIds'
    | 'competitionTypeId'
    | 'setSelectedCompetitionId'
    | 'setSelectedLaneIds'
    | 'assignmentLaneId'
    | 'competitionLanes'
    | 'pendingSightingLaneIds'
    | 'canPublishResults'
    | 'advanceSeriesSource'
  >;
  refresh: () => Promise<void>;
}
export function useCompetitionCommands({ selection, refresh }: CompetitionCommandOptions) {
  const {
    activeCompetition,
    activeCompetitionTiming,
    selectedAvailableLaneIds,
    competitionTypeId,
    setSelectedCompetitionId,
    setSelectedLaneIds,
    assignmentLaneId,
    competitionLanes,
    pendingSightingLaneIds,
    canPublishResults,
    advanceSeriesSource,
  } = selection;
  const addNotification = useNotificationStore((state) => state.addNotification);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [clockQuality, setClockQuality] = useState<Record<string, ClockQualityAssessmentDto>>({});
  const [athleteStartNumber, setAthleteStartNumber] = useState('1');
  const [athleteName, setAthleteName] = useState('');
  const resultContexts = useCompetitionControlStore((state) => state.resultContexts);
  const setResultContext = useCompetitionControlStore((state) => state.setResultContext);
  const clearResultContext = useCompetitionControlStore((state) => state.clearResultContext);
  const resultContext = activeCompetition ? (resultContexts[activeCompetition.competitionId] ?? null) : null;
  const probeLaneClock = useCallback(
    async (laneId: string) => {
      setBusyAction(`probe-clock-${laneId}`);
      try {
        const response = await mqttService.probeLaneClock({ laneId });
        if (!response.success) {
          addNotification('error', response.error.message);
          return;
        }
        setClockQuality((current) => ({ ...current, [laneId]: response.data.assessment }));
        const assessment = response.data.assessment;
        addNotification(
          assessment.status === 'GOOD' || assessment.status === 'DISABLED' ? 'success' : 'warning',
          `Lane clock ${assessment.status.toLowerCase()}: offset ${formatClockMetric(assessment.offsetMilliseconds)}, uncertainty ${formatClockMetric(assessment.uncertaintyMilliseconds)}`,
        );
      } finally {
        setBusyAction(null);
      }
    },
    [addNotification],
  );

  const reportCommand = useCallback(
    (result: MqttCommandExecutionResultDto) => {
      const hasWarnings = result.lanes.some((lane) => lane.warning);
      addNotification(result.success ? (hasWarnings ? 'warning' : 'success') : 'error', commandSummary(result));
      if (result.resultPublication) {
        addNotification(
          result.resultPublication.errors.length === 0 ? 'success' : 'error',
          result.resultPublication.errors.length === 0
            ? `Saved ${result.resultPublication.savedCount} result(s)`
            : `Result save: ${result.resultPublication.savedCount} succeeded / ${result.resultPublication.errors.join('; ')}`,
        );
      }
    },
    [addNotification],
  );

  const runAction = useCallback(
    async (name: string, action: () => Promise<void>) => {
      setBusyAction(name);
      try {
        await action();
      } catch (error) {
        addNotification('error', error instanceof Error ? error.message : String(error));
      } finally {
        setBusyAction(null);
        await refresh();
      }
    },
    [addNotification, refresh],
  );

  const createAndJoinCompetition = useCallback(() => {
    const laneIds = selectedAvailableLaneIds;
    return runAction('create', async () => {
      const created = await mqttService.createCompetition({ competitionTypeId, laneIds });
      if (!created.success) {
        addNotification('error', created.error.message);
        return;
      }
      setSelectedCompetitionId(created.data.competitionId);
      const joined = await mqttService.joinCompetition({
        competitionId: created.data.competitionId,
        laneIds,
      });
      if (!joined.success) {
        addNotification('error', joined.error.message);
        return;
      }
      const failed = joined.data.commands.filter((command) => !command.success);
      setSelectedLaneIds(new Set(failed.flatMap((command) => command.lanes.map((lane) => lane.laneId))));
      addNotification(
        failed.length === 0 ? 'success' : 'error',
        failed.length === 0
          ? `Joined ${laneIds.length} Lane(s) to the competition`
          : `Failed to join ${failed.length} Lane(s)`,
      );
    });
  }, [addNotification, competitionTypeId, runAction, selectedAvailableLaneIds]);

  const invokeCompetitionCommand = useCallback(
    (
      name: string,
      invoke: (
        competitionId: string,
      ) => Promise<
        { success: true; data: MqttCommandExecutionResultDto } | { success: false; error: { message: string } }
      >,
    ) => {
      if (!activeCompetition) return Promise.resolve();
      return runAction(name, async () => {
        const response = await invoke(activeCompetition.competitionId);
        if (!response.success) {
          addNotification('error', response.error.message);
          return;
        }
        reportCommand(response.data);
      });
    },
    [activeCompetition, addNotification, reportCommand, runAction],
  );

  const invokeLaneCommand = useCallback(
    (
      name: string,
      invoke: (
        competitionId: string,
        laneId: string,
      ) => Promise<
        { success: true; data: MqttCommandExecutionResultDto } | { success: false; error: { message: string } }
      >,
    ) => {
      if (!activeCompetition || !assignmentLaneId) return Promise.resolve();
      return runAction(name, async () => {
        const response = await invoke(activeCompetition.competitionId, assignmentLaneId);
        if (!response.success) {
          addNotification('error', response.error.message);
          return;
        }
        reportCommand(response.data);
      });
    },
    [activeCompetition, addNotification, assignmentLaneId, reportCommand, runAction],
  );

  const changeMembership = useCallback(
    (action: 'join' | 'leave', laneIds: string[]) => {
      if (!activeCompetition || laneIds.length === 0) return Promise.resolve();
      return runAction(action, async () => {
        const response =
          action === 'join'
            ? await mqttService.joinCompetition({ competitionId: activeCompetition.competitionId, laneIds })
            : await mqttService.leaveCompetition({ competitionId: activeCompetition.competitionId, laneIds });
        if (!response.success) {
          addNotification('error', response.error.message);
          return;
        }
        const succeeded = response.data.commands.filter((command) => command.success).length;
        addNotification(
          response.data.success ? 'success' : 'error',
          `${action === 'join' ? 'Join' : 'Leave'}: ${succeeded}/${laneIds.length} Lanes complete`,
        );
      });
    },
    [activeCompetition, addNotification, runAction],
  );

  const assignAthlete = useCallback(() => {
    const startNumber = Number(athleteStartNumber);
    const name = athleteName.trim();
    if (!Number.isInteger(startNumber) || startNumber <= 0 || !name) {
      addNotification('error', 'Enter a start number and athlete name');
      return Promise.resolve();
    }
    return invokeLaneCommand('assign-athlete', async (competitionId, laneId) => {
      let athlete: Athlete = {
        startNumber,
        id: `manual-${competitionId}-${startNumber}`,
        name,
      };

      if (resultContext) {
        const response = await championshipService.getParticipants({ eventId: resultContext.eventId });
        if (!response.success) throw new Error(response.error.message);

        const matchingParticipants = response.data.participants.filter(
          (participant) => participant.sortOrder + 1 === startNumber && participant.playerName.trim() === name,
        );
        if (matchingParticipants.length !== 1) {
          throw new Error(
            `Could not uniquely match championship participant with start number ${startNumber} and name "${name}"`,
          );
        }

        const participant = matchingParticipants[0]!;
        athlete = {
          startNumber,
          id: participant.id,
          name: participant.playerName,
          ...(participant.teamId ? { teamId: participant.teamId } : {}),
          ...(participant.teamName ? { teamName: participant.teamName } : {}),
          ...(participant.gender ? { gender: participant.gender } : {}),
          ...(participant.nationCode ? { nationCode: participant.nationCode } : {}),
          ...(participant.issfId ? { issfCode: participant.issfId } : {}),
        };
      }

      return mqttService.assignAthlete({ competitionId, laneId, athlete });
    });
  }, [addNotification, athleteName, athleteStartNumber, invokeLaneCommand, resultContext]);

  const resetLaneSession = useCallback(async () => {
    if (!activeCompetition || activeCompetition.phase !== 'NOT_STARTED' || !assignmentLaneId) return;

    const lane = competitionLanes.find((candidate) => candidate.laneId === assignmentLaneId);
    const laneLabel =
      lane?.laneAlias || (lane?.firingPointNumber ? `Firing point ${lane.firingPointNumber}` : assignmentLaneId);
    const confirmed = await useConfirmDialogStore
      .getState()
      .openConfirm(`Erase all shot records for ${laneLabel}? This action cannot be undone.`);
    if (!confirmed) return;

    await invokeLaneCommand('reset-session', (competitionId, laneId) =>
      mqttService.resetSession({ competitionId, laneId, reason: 'Director pre-competition reset' }),
    );
  }, [activeCompetition, assignmentLaneId, competitionLanes, invokeLaneCommand]);

  const applyChampionshipAssignments = useCallback(
    (plan: FiringPointAssignmentPlan, nextResultContext: ChampionshipResultContext) => {
      if (!activeCompetition) return Promise.resolve();
      return runAction('apply-championship-assignments', async () => {
        const result = await applyFiringPointAssignmentPlan({
          competitionId: activeCompetition.competitionId,
          plan,
          assignAthlete: (input) => mqttService.assignAthlete(input),
        });
        const details = [
          result.failedFiringPointNumbers.length > 0
            ? `Failed: ${result.failedFiringPointNumbers.map((number) => `firing point ${number}`).join(', ')}`
            : null,
          result.skipped > 0 ? `Skipped: ${result.skipped}` : null,
        ].filter((detail): detail is string => detail !== null);
        addNotification(
          result.failedFiringPointNumbers.length > 0 || result.skipped > 0 ? 'warning' : 'success',
          `Applied ${result.succeeded}/${plan.totalAssignments} firing-point assignments${details.length > 0 ? ` (${details.join(' / ')})` : ''}`,
        );
        setResultContext(activeCompetition.competitionId, nextResultContext);
      });
    },
    [activeCompetition, addNotification, runAction],
  );

  const confirmPhaseStart = useCallback(
    async (phase: CompetitionStartPhase): Promise<string[] | null> => {
      const confirmation = buildPhaseStartConfirmation(phase, activeCompetitionTiming?.phaseStartRequirements?.[phase]);
      if (!confirmation) return [];
      const confirmed = await useConfirmDialogStore.getState().openConfirm(confirmation.message);
      return confirmed ? [...confirmation.acknowledgedRequirementIds] : null;
    },
    [activeCompetitionTiming],
  );

  const startSighting = useCallback(async () => {
    if (!activeCompetition || !activeCompetitionTiming) return;
    const acknowledgedRequirementIds =
      activeCompetition.phase === 'NOT_STARTED' ? await confirmPhaseStart('SIGHTING') : [];
    if (acknowledgedRequirementIds === null) return;

    await invokeCompetitionCommand('sighting', (competitionId) =>
      mqttService.startSighting({
        competitionId,
        durationSeconds: activeCompetitionTiming.preparationAndSightingSeconds,
        ...(activeCompetition.phase === 'SIGHTING' ? { targetLaneIds: pendingSightingLaneIds } : {}),
        ...(acknowledgedRequirementIds.length > 0 ? { acknowledgedRequirementIds } : {}),
      }),
    );
  }, [activeCompetition, activeCompetitionTiming, confirmPhaseStart, invokeCompetitionCommand, pendingSightingLaneIds]);

  const startMatch = useCallback(async () => {
    if (!activeCompetition || !activeCompetitionTiming) return;
    const acknowledgedRequirementIds = await confirmPhaseStart('MATCH');
    if (acknowledgedRequirementIds === null) return;

    await invokeCompetitionCommand('match', (competitionId) =>
      mqttService.startMatch({
        competitionId,
        ...(activeCompetitionTiming.matchSeconds === null
          ? {}
          : { durationSeconds: activeCompetitionTiming.matchSeconds }),
        ...(acknowledgedRequirementIds.length > 0 ? { acknowledgedRequirementIds } : {}),
      }),
    );
  }, [activeCompetition, activeCompetitionTiming, confirmPhaseStart, invokeCompetitionCommand]);

  const startTimedTarget = useCallback(
    (input: { programId: string; purpose: 'SIGHTING' | 'MATCH'; stageIndex: number; seriesIndex: number }) =>
      invokeCompetitionCommand(`timed-${input.purpose.toLowerCase()}`, (competitionId) =>
        mqttService.startTimedTarget({ competitionId, ...input }),
      ),
    [invokeCompetitionCommand],
  );

  const recordTimedTargetUnload = useCallback(
    async (sequenceId: string, targetLaneIds: string[], officialName: string, observedAt: string) => {
      await invokeCompetitionCommand('record-timed-target-unload', (competitionId) =>
        mqttService.recordTimedTargetUnload({
          competitionId,
          sequenceId,
          targetLaneIds,
          officialName,
          observedAt,
        }),
      );
    },
    [invokeCompetitionCommand],
  );

  const cancelTimedTarget = useCallback(
    async (sequenceId: string, targetLaneIds: string[]) => {
      const confirmed = await useConfirmDialogStore
        .getState()
        .openConfirm('Cancel this timed-target sequence and return all selected targets to RED?');
      if (!confirmed) return;
      await invokeCompetitionCommand('cancel-timed-target', (competitionId) =>
        mqttService.cancelTimedTarget({
          competitionId,
          sequenceId,
          reason: 'Director cancellation',
          targetLaneIds,
        }),
      );
    },
    [invokeCompetitionCommand],
  );

  const finishCompetition = useCallback(async () => {
    if (!activeCompetition) return;

    const publishResultContext = canPublishResults ? resultContext : null;
    const discardingLinkedResults = resultContext !== null && publishResultContext === null;
    const confirmationMessage = activeCompetition.cleanupPreparedAt
      ? 'Retry incomplete Lane departure and retained-data cleanup?'
      : publishResultContext
        ? `Save relay ${publishResultContext.relayNumber} results and finish the competition? Lane assignments and scores will be cleared.`
        : resultContext
          ? 'The match has not started, so linked championship results will not be saved. Abandon the competition and clear Lane assignments and scores? This action cannot be undone.'
          : 'Results will not be saved to championship management. Finish the competition and clear Lane assignments and scores? This action cannot be undone.';
    const confirmed = await useConfirmDialogStore.getState().openConfirm(confirmationMessage);
    if (!confirmed) return;

    // Preserve the explicit abandonment choice even when the MQTT command only
    // partly succeeds or the app exits before cleanup can be retried.
    if (discardingLinkedResults) clearResultContext(activeCompetition.competitionId);

    await runAction('finish', async () => {
      const response = await mqttService.finishCompetition({
        competitionId: activeCompetition.competitionId,
        ...(publishResultContext ? { resultContext: publishResultContext } : {}),
      });
      if (!response.success) {
        addNotification('error', response.error.message);
        return;
      }
      reportCommand(response.data);
      if (response.data.success && (response.data.resultPublication?.errors.length ?? 0) === 0) {
        clearResultContext(activeCompetition.competitionId);
      }
    });
  }, [
    activeCompetition,
    addNotification,
    canPublishResults,
    clearResultContext,
    reportCommand,
    resultContext,
    runAction,
  ]);

  const unassignAthlete = () =>
    invokeLaneCommand('unassign-athlete', (competitionId, laneId) =>
      mqttService.assignAthlete({ competitionId, laneId, athlete: null }),
    );
  const endSighting = () =>
    invokeCompetitionCommand('end-sighting', (competitionId) => mqttService.endSighting({ competitionId }));
  const advanceSeries = () =>
    invokeCompetitionCommand('advance', (competitionId) => {
      if (!advanceSeriesSource) throw new Error('No completed series is available to advance');
      return mqttService.advanceSeries({ competitionId, ...advanceSeriesSource });
    });
  return {
    busyAction,
    clockQuality,
    athleteStartNumber,
    setAthleteStartNumber,
    athleteName,
    setAthleteName,
    resultContext,
    probeLaneClock,
    createAndJoinCompetition,
    changeMembership,
    assignAthlete,
    resetLaneSession,
    applyChampionshipAssignments,
    startSighting,
    startMatch,
    startTimedTarget,
    recordTimedTargetUnload,
    cancelTimedTarget,
    finishCompetition,
    unassignAthlete,
    endSighting,
    advanceSeries,
  };
}

export type CompetitionCommands = ReturnType<typeof useCompetitionCommands>;
