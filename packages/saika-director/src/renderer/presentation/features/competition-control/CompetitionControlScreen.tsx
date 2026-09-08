// SPDX-License-Identifier: MIT
import { AlertTriangle, BellRing, Check, Gauge, LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useEvent } from '@/renderer/presentation/hooks/useEvent';
import { useCompetitionControlStore } from '@/renderer/presentation/stores/domain/competitionControl.store';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { useNavigationStore } from '@/renderer/presentation/stores/ui/navigation.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import { championshipService, mqttService } from '@/renderer/services';
import type { CompetitionStartPhase } from '@/shared/competitionTypes';
import type {
  ClockQualityAssessmentDto,
  FiringWindowViolationDto,
  MqttCommandExecutionResultDto,
  MqttControlSnapshotDto,
  ShotObservationEvidenceDto,
} from '@/shared/ipc/contracts';
import type { Athlete, EstComplaintIssue } from '@/shared/mqtt';

import { EstInspectionStartPanel } from '../est-championship-inspections/EstInspectionStartPanel';
import { EstComplaintInbox } from '../est-complaints';
import { FinalControlPanel } from '../final-control';
import { FinalOperationPanel } from '../final-operations';
import { FinalRecoveryPanel } from '../final-recoveries';
import { IrregularShotCasesPanel } from '../irregular-shot-cases';
import { MixedTeamFinalControlPanel } from '../mixed-team-final-control';
import { MixedTeamTimeoutPanel } from '../mixed-team-timeouts';
import { OperationalProfilePanel } from '../operational-profiles/OperationalProfilePanel';
import { ProductionOperationsPanel } from '../production-operations';
import { QualificationMalfunctionPanel } from '../qualification-malfunctions';
import { RangeInterruptionsPanel } from '../range-interruptions';
import { ReserveLaneTransferPanel } from '../range-interruptions/ReserveLaneTransferPanel';
import { SafetyStopPanel } from '../range-safety';
import { RelayAthleteLifecyclePanel, RelayReadinessPanel } from '../relay-readiness';
import { Button } from '../shared/common/Button';
import { Card } from '../shared/common/Card';
import { PageHeader } from '../shared/layout/PageHeader';
import { TargetExaminationsPanel } from '../target-examinations';

import { applyFiringPointAssignmentPlan, type FiringPointAssignmentPlan } from './assignmentPlanning';
import { CompetitionStartReadinessPanel } from './CompetitionStartReadinessPanel';
import { ChampionshipAssignmentPanel, type ChampionshipResultContext } from './components/ChampionshipAssignmentPanel';
import { buildPhaseStartConfirmation } from './phaseStartRequirements';
import { findAdvanceSeriesSource } from './progressPlanning';
import {
  asSupportedLaneCompetitionType,
  getLaneCompetitionDefinition,
  getLaneCompetitionTiming,
  LANE_COMPETITION_TYPES,
  type SupportedLaneCompetitionType,
} from './supportedCompetitionTypes';
import { TimedTargetControlPanel } from './TimedTargetControlPanel';

const EMPTY_SNAPSHOT: MqttControlSnapshotDto = {
  connected: false,
  brokerUrl: null,
  activeCompetitionId: null,
  lanes: [],
  competitions: [],
  lastCommand: null,
};

const COMPETITION_PHASE_STEPS = [
  { label: 'Setup', phases: ['NOT_STARTED'] },
  { label: 'Sighting', phases: ['SIGHTING', 'SIGHTING_COMPLETE'] },
  { label: 'Match', phases: ['MATCH'] },
  { label: 'Complete', phases: ['MATCH_COMPLETE'] },
] as const;

function phaseStepIndex(phase: string | undefined): number {
  return COMPETITION_PHASE_STEPS.findIndex((step) => (step.phases as readonly string[]).includes(phase ?? ''));
}

function formatActionName(action: string): string {
  return action.replaceAll('-', ' ');
}

function formatEstComplaintIssue(issue: EstComplaintIssue | null): string {
  switch (issue) {
    case 'SHOT_VALUE':
      return 'Displayed shot value';
    case 'SHOT_NOT_REGISTERED':
      return 'Shot not registered or displayed';
    case 'TARGET_FAILURE':
      return 'Target failure';
    case 'TARGET_MEDIA_ADVANCE':
      return 'Paper or rubber strip advance';
    case 'OTHER':
      return 'Other EST issue';
    default:
      return 'EST issue';
  }
}

function formatTimerDuration(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} sec`;
}

function formatClockMetric(value: number | null): string {
  return value === null ? 'n/a' : `${value >= 0 ? '+' : ''}${value.toFixed(1)} ms`;
}

function estimateRemainingSeconds(timer: { timerStartAt: string; timerDurationSeconds: number } | undefined): number {
  if (!timer) return 0;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(timer.timerStartAt)) / 1000));
  return Math.max(0, timer.timerDurationSeconds - elapsedSeconds);
}

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

export function CompetitionControlScreen() {
  const addNotification = useNotificationStore((state) => state.addNotification);
  const setActiveScreen = useNavigationStore((state) => state.setActiveScreen);
  const [operationalSettingsRevision, setOperationalSettingsRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<MqttControlSnapshotDto>(EMPTY_SNAPSHOT);
  const [selectedLaneIds, setSelectedLaneIds] = useState<Set<string>>(new Set());
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
  const [competitionTypeId, setCompetitionTypeId] = useState<SupportedLaneCompetitionType>('BR60S');
  const [assignmentLaneId, setAssignmentLaneId] = useState('');
  const [athleteStartNumber, setAthleteStartNumber] = useState('1');
  const [athleteName, setAthleteName] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [firingWindowViolations, setFiringWindowViolations] = useState<FiringWindowViolationDto[]>([]);
  const [shotObservationEvidence, setShotObservationEvidence] = useState<ShotObservationEvidenceDto[]>([]);
  const [clockQuality, setClockQuality] = useState<Record<string, ClockQualityAssessmentDto>>({});
  const [targetExaminationVersion, setTargetExaminationVersion] = useState(0);
  const resultContexts = useCompetitionControlStore((state) => state.resultContexts);
  const setResultContext = useCompetitionControlStore((state) => state.setResultContext);
  const clearResultContext = useCompetitionControlStore((state) => state.clearResultContext);
  const liveSnapshotVersionRef = useRef(0);
  const refreshRequestIdRef = useRef(0);
  const violationRequestIdRef = useRef(0);
  const liveViolationVersionRef = useRef(0);
  const observationRequestIdRef = useRef(0);
  const liveObservationVersionRef = useRef(0);
  const selectAllLanesRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestIdRef.current;
    const liveSnapshotVersion = liveSnapshotVersionRef.current;
    const response = await mqttService.getControlState();
    if (
      response.success &&
      requestId === refreshRequestIdRef.current &&
      liveSnapshotVersion === liveSnapshotVersionRef.current
    ) {
      setSnapshot(response.data);
    }
  }, []);

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEvent('mqttControlStateChanged', (nextSnapshot) => {
    liveSnapshotVersionRef.current += 1;
    setSnapshot(nextSnapshot);
  });

  useEvent('firingWindowViolationDetected', (violation) => {
    if (violation.competitionId !== selectedCompetitionId) return;
    liveViolationVersionRef.current += 1;
    setFiringWindowViolations((current) =>
      current.some((entry) => entry.id === violation.id) ? current : [...current, violation],
    );
  });

  useEvent('shotObservationEvidenceObserved', (evidence) => {
    if (evidence.competition?.competitionId !== selectedCompetitionId) return;
    liveObservationVersionRef.current += 1;
    setShotObservationEvidence((current) =>
      current.some((entry) => entry.evidenceId === evidence.evidenceId) ? current : [...current, evidence],
    );
  });

  useEffect(() => {
    const requestId = ++violationRequestIdRef.current;
    const liveVersion = liveViolationVersionRef.current;
    if (!selectedCompetitionId) {
      setFiringWindowViolations([]);
      return;
    }
    setFiringWindowViolations((current) => (current.length === 0 ? current : []));

    void mqttService.getFiringWindowViolations({ competitionId: selectedCompetitionId }).then(
      (response) => {
        if (
          response.success &&
          requestId === violationRequestIdRef.current &&
          liveVersion === liveViolationVersionRef.current
        ) {
          if (response.data.length === 0) return;
          setFiringWindowViolations((current) => {
            const unchanged =
              current.length === response.data.length &&
              current.every((entry, index) => entry.id === response.data[index]?.id);
            return unchanged ? current : response.data;
          });
        }
      },
      () => undefined,
    );
  }, [selectedCompetitionId]);

  useEffect(() => {
    const requestId = ++observationRequestIdRef.current;
    const liveVersion = liveObservationVersionRef.current;
    if (!selectedCompetitionId) {
      setShotObservationEvidence([]);
      return;
    }
    setShotObservationEvidence([]);
    void mqttService.getShotObservationEvidence({ competitionId: selectedCompetitionId }).then(
      (response) => {
        if (
          response.success &&
          requestId === observationRequestIdRef.current &&
          liveVersion === liveObservationVersionRef.current
        ) {
          setShotObservationEvidence(response.data);
        }
      },
      () => undefined,
    );
  }, [selectedCompetitionId]);

  useEffect(() => {
    setSelectedLaneIds((current) => {
      const available = new Set(snapshot.lanes.map((lane) => lane.laneId));
      return new Set([...current].filter((laneId) => available.has(laneId)));
    });
  }, [snapshot.lanes]);

  useEffect(() => {
    setSelectedCompetitionId((current) => {
      if (current && snapshot.competitions.some((competition) => competition.competitionId === current)) {
        return current;
      }
      if (
        snapshot.activeCompetitionId &&
        snapshot.competitions.some((competition) => competition.competitionId === snapshot.activeCompetitionId)
      ) {
        return snapshot.activeCompetitionId;
      }
      return snapshot.competitions[0]?.competitionId ?? null;
    });
  }, [snapshot.activeCompetitionId, snapshot.competitions]);

  const activeCompetition = useMemo(
    () => snapshot.competitions.find((competition) => competition.competitionId === selectedCompetitionId) ?? null,
    [selectedCompetitionId, snapshot.competitions],
  );
  const selectedCompetitionTiming = getLaneCompetitionTiming(competitionTypeId);
  const activeCompetitionType = asSupportedLaneCompetitionType(activeCompetition?.competitionTypeId);
  const activeCompetitionTiming = activeCompetitionType ? getLaneCompetitionTiming(activeCompetitionType) : null;
  const activeCompetitionDefinition = activeCompetitionType
    ? getLaneCompetitionDefinition(activeCompetitionType)
    : null;
  const displayedCompetitionTiming = activeCompetitionTiming ?? selectedCompetitionTiming;
  const competitionByLaneId = useMemo(() => {
    const byLaneId = new Map<string, (typeof snapshot.competitions)[number]>();
    const mostRecentFirst = [...snapshot.competitions].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.competitionId.localeCompare(b.competitionId),
    );
    for (const competition of mostRecentFirst) {
      for (const laneId of competition.laneIds) {
        if (!byLaneId.has(laneId)) byLaneId.set(laneId, competition);
      }
    }
    return byLaneId;
  }, [snapshot.competitions]);
  const pendingJoinLaneIds = activeCompetition?.pendingJoinLaneIds ?? [];
  const pendingSightingLaneIds = activeCompetition?.pendingSightingLaneIds ?? [];
  const resultContext = activeCompetition ? (resultContexts[activeCompetition.competitionId] ?? null) : null;
  const canPublishResults = activeCompetition?.phase === 'MATCH' || activeCompetition?.phase === 'MATCH_COMPLETE';
  const assignmentEditingAllowed =
    activeCompetition?.phase === 'NOT_STARTED' ||
    (activeCompetition?.phase === 'MATCH_COMPLETE' && !activeCompetition.cleanupPreparedAt);
  const competitionLanes = useMemo(
    () => snapshot.lanes.filter((lane) => activeCompetition?.laneIds.includes(lane.laneId)),
    [activeCompetition, snapshot.lanes],
  );
  const selectedJoinedLaneIds = useMemo(
    () => [...selectedLaneIds].filter((laneId) => activeCompetition?.laneIds.includes(laneId)),
    [activeCompetition, selectedLaneIds],
  );
  const selectedAvailableLaneIds = useMemo(
    () => [...selectedLaneIds].filter((laneId) => !competitionByLaneId.has(laneId)),
    [competitionByLaneId, selectedLaneIds],
  );
  const selectedJoinLaneIds = useMemo(() => {
    const pendingLaneIds = new Set(pendingJoinLaneIds);
    return [...selectedLaneIds].filter((laneId) => !competitionByLaneId.has(laneId) || pendingLaneIds.has(laneId));
  }, [competitionByLaneId, pendingJoinLaneIds, selectedLaneIds]);
  const selectedLeaveLaneIds = useMemo(() => {
    if (activeCompetition?.phase === 'NOT_STARTED') return selectedJoinedLaneIds;
    if (activeCompetition?.phase !== 'SIGHTING') return [];
    const pendingLaneIds = new Set(activeCompetition.pendingSightingLaneIds ?? []);
    return selectedJoinedLaneIds.filter((laneId) => pendingLaneIds.has(laneId));
  }, [activeCompetition, selectedJoinedLaneIds]);
  const advanceSeriesSource = useMemo(
    () => (activeCompetition ? findAdvanceSeriesSource(snapshot.lanes, activeCompetition.competitionId) : null),
    [activeCompetition, snapshot.lanes],
  );
  const allLanesSelected =
    snapshot.lanes.length > 0 && snapshot.lanes.every((lane) => selectedLaneIds.has(lane.laneId));

  useEffect(() => {
    if (selectAllLanesRef.current) {
      selectAllLanesRef.current.indeterminate = selectedLaneIds.size > 0 && !allLanesSelected;
    }
  }, [allLanesSelected, selectedLaneIds]);

  useEffect(() => {
    if (!competitionLanes.some((lane) => lane.laneId === assignmentLaneId)) {
      setAssignmentLaneId(competitionLanes[0]?.laneId ?? '');
    }
  }, [assignmentLaneId, competitionLanes]);

  const toggleLane = useCallback((laneId: string) => {
    setSelectedLaneIds((current) => {
      const next = new Set(current);
      if (next.has(laneId)) next.delete(laneId);
      else next.add(laneId);
      return next;
    });
  }, []);

  const toggleAllLanes = useCallback(() => {
    setSelectedLaneIds((current) => {
      const everyLaneSelected = snapshot.lanes.length > 0 && snapshot.lanes.every((lane) => current.has(lane.laneId));
      return everyLaneSelected ? new Set() : new Set(snapshot.lanes.map((lane) => lane.laneId));
    });
  }, [snapshot.lanes]);

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

  const baseControlsDisabled =
    busyAction !== null || !snapshot.connected || !activeCompetition || activeCompetitionTiming === null;
  const competitionLocked = activeCompetition?.phase === 'MATCH_COMPLETE';
  const controlsDisabled = baseControlsDisabled || competitionLocked;
  const finishDisabled = baseControlsDisabled;
  const canStartOrRetrySighting =
    (activeCompetition?.laneIds.length ?? 0) > 0 &&
    pendingJoinLaneIds.length === 0 &&
    (activeCompetition?.phase === 'NOT_STARTED' ||
      (activeCompetition?.phase === 'SIGHTING' && pendingSightingLaneIds.length > 0));
  const currentPhaseIndex = phaseStepIndex(activeCompetition?.phase);
  const unscoredObservations = shotObservationEvidence.filter((evidence) => evidence.outcome !== 'RECORDED');
  const activeRangeOfficerRequests = snapshot.lanes.filter((lane) => lane.rangeOfficerRequest?.status === 'ACTIVE');
  const activeQualificationMalfunctionSignals = snapshot.lanes.filter(
    (lane) => lane.qualificationMalfunctionSignal?.status === 'ACTIVE',
  );
  const activeEstComplaintSignals = snapshot.lanes.filter((lane) => lane.estComplaintSignal?.status === 'ACTIVE');
  const competitionEstComplaintSignalIds = snapshot.lanes.flatMap((lane) => {
    const signal = lane.estComplaintSignal;
    return signal?.signalId && signal.context?.competitionId === activeCompetition?.competitionId
      ? [signal.signalId]
      : [];
  });

  return (
    <div className="min-h-full">
      <PageHeader
        title="Competition Control"
        description="Lane membership, athlete assignment and course-of-fire control."
        icon={<Gauge size={24} aria-hidden="true" />}
        actions={
          <>
            <span
              role="status"
              className={`inline-flex items-center gap-1.5 text-[13px] ${
                snapshot.connected ? 'text-vscode-success' : 'text-vscode-error'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${snapshot.connected ? 'bg-vscode-success' : 'bg-vscode-error'}`}
              />
              {snapshot.connected ? 'Connected' : 'Disconnected'}
            </span>
            {busyAction && (
              <span className="inline-flex items-center gap-1.5 text-xs text-vscode-text-muted">
                <LoaderCircle size={13} aria-hidden="true" className="animate-spin" />
                <span className="capitalize">{formatActionName(busyAction)}…</span>
              </span>
            )}
            <Button variant="secondary" size="sm" disabled={busyAction !== null} onClick={() => void refresh()}>
              <RefreshCw size={14} aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />

      <div className="p-5">
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            {activeEstComplaintSignals.length > 0 && (
              <section
                className="border-2 border-cyan-500 bg-cyan-500/10 p-4"
                aria-label="Active electronic target complaints"
                aria-live="assertive"
              >
                <div className="flex items-center gap-2 text-cyan-300">
                  <AlertTriangle size={19} aria-hidden="true" />
                  <h2 className="text-sm font-bold">Electronic target complaint raised</h2>
                </div>
                <ul className="mt-2 space-y-2">
                  {activeEstComplaintSignals.map((lane) => {
                    const signal = lane.estComplaintSignal!;
                    const context = signal.context!;
                    return (
                      <li key={signal.signalId ?? lane.laneId} className="text-sm text-vscode-text">
                        <span className="font-semibold">
                          {lane.firingPointNumber
                            ? `Firing point ${lane.firingPointNumber}`
                            : lane.laneAlias || lane.laneId}
                        </span>
                        {' · '}
                        {context.startNumber ? `#${context.startNumber} ` : ''}
                        {context.participantName}
                        {' · '}
                        {formatEstComplaintIssue(signal.issue)}
                        {' · '}
                        {context.phase}, stage {context.stageIndex + 1}, series {context.seriesIndex + 1}, shot{' '}
                        {context.recordedShots}
                        {context.exposureIndex === null ? '' : `, exposure ${context.exposureIndex + 1}`}
                        {signal.message ? ` · ${signal.message}` : ''}
                        {signal.signalledAt ? ` · ${new Date(signal.signalledAt).toLocaleTimeString()}` : ''}
                        {lane.hardware?.connection.status !== 'connected' ? ' · Lane offline' : ''}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-vscode-text-muted">
                  This is a Lane observation, not a ruling on timeliness, validity, or score. Preserve the target and
                  use Target examinations to open the official evidence record.
                </p>
              </section>
            )}
            {activeQualificationMalfunctionSignals.length > 0 && (
              <section
                className="border-2 border-vscode-error bg-vscode-error/10 p-4"
                aria-label="Active qualification malfunction declarations"
                aria-live="assertive"
              >
                <div className="flex items-center gap-2 text-vscode-error">
                  <AlertTriangle size={19} aria-hidden="true" />
                  <h2 className="text-sm font-bold">Possible qualification malfunction declared</h2>
                </div>
                <ul className="mt-2 space-y-2">
                  {activeQualificationMalfunctionSignals.map((lane) => {
                    const signal = lane.qualificationMalfunctionSignal!;
                    const context = signal.context!;
                    return (
                      <li key={signal.signalId ?? lane.laneId} className="text-sm text-vscode-text">
                        <span className="font-semibold">
                          {lane.firingPointNumber
                            ? `Firing point ${lane.firingPointNumber}`
                            : lane.laneAlias || lane.laneId}
                        </span>
                        {' · '}
                        {context.startNumber ? `#${context.startNumber} ` : ''}
                        {context.participantName}
                        {' · '}
                        {context.phase}, stage {context.stageIndex + 1}, series {context.seriesIndex + 1}, shot{' '}
                        {context.recordedShots}
                        {signal.message ? ` · ${signal.message}` : ''}
                        {signal.signalledAt ? ` · ${new Date(signal.signalledAt).toLocaleTimeString()}` : ''}
                        {lane.hardware?.connection.status !== 'connected' ? ' · Lane offline' : ''}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-vscode-text-muted">
                  This is an athlete/Lane declaration, not an official classification or claim decision. Use it in
                  Qualification malfunction cases to open the official record; classify it separately after inspection.
                </p>
              </section>
            )}
            {activeRangeOfficerRequests.length > 0 && (
              <section
                className="border-2 border-vscode-warning bg-vscode-warning/10 p-4"
                aria-label="Active Range Officer requests"
                aria-live="assertive"
              >
                <div className="flex items-center gap-2 text-vscode-warning">
                  <BellRing size={19} aria-hidden="true" />
                  <h2 className="text-sm font-bold">Range Officer requested</h2>
                </div>
                <ul className="mt-2 space-y-2">
                  {activeRangeOfficerRequests.map((lane) => {
                    const request = lane.rangeOfficerRequest!;
                    return (
                      <li key={request.requestId ?? lane.laneId} className="text-sm text-vscode-text">
                        <span className="font-semibold">
                          {lane.firingPointNumber
                            ? `Firing point ${lane.firingPointNumber}`
                            : lane.laneAlias || lane.laneId}
                        </span>
                        {' · '}
                        {request.category?.replaceAll('_', ' ') ?? 'ASSISTANCE'}
                        {request.message ? ` · ${request.message}` : ''}
                        {request.requestedAt ? ` · ${new Date(request.requestedAt).toLocaleTimeString()}` : ''}
                        {lane.hardware?.connection.status !== 'connected' ? ' · Lane offline' : ''}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-vscode-text-muted">
                  The Lane owns and clears this assistance signal. It does not change firing or safety state.
                </p>
              </section>
            )}
            <SafetyStopPanel
              connected={snapshot.connected}
              lanes={snapshot.lanes}
              targetLaneIds={snapshot.lanes.map((lane) => lane.laneId)}
            />
            <Card>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-vscode-text">Lanes</h3>
                  <p className="mt-0.5 text-xs text-vscode-text-muted" aria-live="polite">
                    {snapshot.lanes.length} discovered · {selectedLaneIds.size} selected
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
                    Competition type
                    <select
                      value={competitionTypeId}
                      onChange={(event) => setCompetitionTypeId(event.target.value as SupportedLaneCompetitionType)}
                      className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text"
                    >
                      {LANE_COMPETITION_TYPES.map((competitionType) => (
                        <option key={competitionType} value={competitionType}>
                          {competitionType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={!snapshot.connected || selectedAvailableLaneIds.length === 0 || busyAction !== null}
                    onClick={() => void createAndJoinCompetition()}
                  >
                    Create competition
                  </Button>
                </div>
              </div>

              {snapshot.lanes.length > 0 && (
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <p className="text-vscode-text-muted" aria-live="polite">
                    <span className="font-semibold text-vscode-text">{selectedLaneIds.size}</span> of{' '}
                    {snapshot.lanes.length} Lanes selected
                  </p>
                  {selectedLaneIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedLaneIds(new Set())}
                      className="rounded px-2 py-1 font-medium text-vscode-accent transition-colors hover:bg-vscode-primary/15 hover:text-vscode-text"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
              )}

              <div className="max-h-80 overflow-auto border border-vscode-border bg-vscode-bg/30">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-vscode-sidebar text-vscode-text shadow-[0_1px_0_0_#3E3E42]">
                    <tr>
                      <th scope="col" className="w-12 px-3 py-2.5">
                        <input
                          ref={selectAllLanesRef}
                          type="checkbox"
                          aria-label="Select all discovered Lanes"
                          checked={allLanesSelected}
                          disabled={snapshot.lanes.length === 0}
                          onChange={toggleAllLanes}
                          className="h-4 w-4 accent-vscode-primary"
                        />
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-vscode-text-muted">
                        Firing point
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                        Lane name
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                        Lane ID
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                        Hardware
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                        Safety
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                        Clock
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                        Competition
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                        Phase
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-vscode-text-muted">
                        Athlete
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-vscode-text-muted">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.lanes.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-5 text-left">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <p className="text-[13px] font-medium text-vscode-text">No Lanes discovered</p>
                              <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
                                Waiting for Saika Lane devices on this broker.
                              </p>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => setActiveScreen('settings')}>
                              Configure network
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      snapshot.lanes.map((lane) => {
                        const laneCompetition = competitionByLaneId.get(lane.laneId);
                        const joinPending = laneCompetition?.pendingJoinLaneIds?.includes(lane.laneId) ?? false;
                        return (
                          <tr
                            key={lane.laneId}
                            className={`border-t border-vscode-border/80 transition-colors hover:bg-white/[0.025] ${
                              selectedLaneIds.has(lane.laneId)
                                ? 'bg-vscode-primary/[0.12]'
                                : laneCompetition?.competitionId === selectedCompetitionId
                                  ? 'bg-vscode-primary/[0.05]'
                                  : ''
                            }`}
                          >
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                aria-label={`Select ${lane.laneAlias || lane.laneId}`}
                                checked={selectedLaneIds.has(lane.laneId)}
                                onChange={() => toggleLane(lane.laneId)}
                                className="h-4 w-4 accent-vscode-primary"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-vscode-text">
                              {lane.firingPointNumber ?? '--'}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-vscode-text">{lane.laneAlias || 'Unnamed'}</td>
                            <td
                              className="max-w-36 truncate px-3 py-2.5 font-mono text-xs text-vscode-dimmed"
                              title={lane.laneId}
                            >
                              {lane.laneId}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="inline-flex items-center gap-1.5 text-xs text-vscode-text-muted">
                                <span
                                  aria-hidden="true"
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    lane.hardware?.connection.status === 'connected'
                                      ? 'bg-vscode-success'
                                      : 'bg-vscode-dimmed'
                                  }`}
                                />
                                {lane.hardware?.connection.status ?? 'unknown'}
                              </span>
                              {lane.hardware?.connection.manufacturer
                                ? ` / ${lane.hardware.connection.manufacturer}`
                                : ''}
                              {lane.hardware?.connection.deviceId ? ` / ${lane.hardware.connection.deviceId}` : ''}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`whitespace-nowrap text-xs font-bold ${
                                  lane.safetyState?.status === 'STOPPED' ? 'text-red-400' : 'text-vscode-success'
                                }`}
                              >
                                {lane.safetyState?.status ?? 'UNKNOWN'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-vscode-text-muted">
                              {clockQuality[lane.laneId] ? (
                                <button
                                  type="button"
                                  className="text-left hover:text-vscode-text"
                                  title={clockQuality[lane.laneId]!.guidance}
                                  disabled={busyAction !== null}
                                  onClick={() => void probeLaneClock(lane.laneId)}
                                >
                                  <span className="font-semibold">{clockQuality[lane.laneId]!.status}</span>{' '}
                                  {formatClockMetric(clockQuality[lane.laneId]!.offsetMilliseconds)}
                                </button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={!snapshot.connected || busyAction !== null}
                                  onClick={() => void probeLaneClock(lane.laneId)}
                                >
                                  Probe
                                </Button>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-vscode-text">
                              {laneCompetition?.competitionTypeId ?? '--'}
                            </td>
                            <td className="px-3 py-2.5 text-vscode-text">
                              <span className="whitespace-nowrap text-xs font-medium text-vscode-text-muted">
                                {(joinPending ? 'JOIN_PENDING' : (lane.competitionState?.phase ?? 'READY')).replaceAll(
                                  '_',
                                  ' ',
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-vscode-text">
                              {lane.assignment?.athlete
                                ? `${lane.assignment.athlete.startNumber} ${lane.assignment.athlete.name}`
                                : '--'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-vscode-text">
                              {lane.score ? (lane.score.totalScoreX10 / 10).toFixed(1) : '--'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {activeCompetition && (
                <div className="mt-4 border-t border-vscode-border pt-4">
                  <h4 className="mb-3 text-[13px] font-semibold text-vscode-text">Manual athlete assignment</h4>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-vscode-text-muted">
                      Target Lane
                      <select
                        value={assignmentLaneId}
                        onChange={(event) => setAssignmentLaneId(event.target.value)}
                        className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text"
                      >
                        {competitionLanes.map((lane) => (
                          <option key={lane.laneId} value={lane.laneId}>
                            {lane.laneAlias || lane.laneId.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex w-28 flex-col gap-1 text-xs font-medium text-vscode-text-muted">
                      Start number
                      <input
                        type="number"
                        min={1}
                        value={athleteStartNumber}
                        onChange={(event) => setAthleteStartNumber(event.target.value)}
                        className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text"
                      />
                    </label>
                    <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs font-medium text-vscode-text-muted">
                      Athlete name
                      <input
                        value={athleteName}
                        onChange={(event) => setAthleteName(event.target.value)}
                        className="min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1 text-[13px] text-vscode-text"
                      />
                    </label>
                    <Button
                      size="sm"
                      disabled={!assignmentLaneId || baseControlsDisabled || !assignmentEditingAllowed}
                      onClick={() => void assignAthlete()}
                    >
                      Assign athlete
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!assignmentLaneId || baseControlsDisabled || !assignmentEditingAllowed}
                      onClick={() =>
                        void invokeLaneCommand('unassign-athlete', (competitionId, laneId) =>
                          mqttService.assignAthlete({ competitionId, laneId, athlete: null }),
                        )
                      }
                    >
                      Unassign
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!assignmentLaneId || baseControlsDisabled || activeCompetition.phase !== 'NOT_STARTED'}
                      onClick={() => void resetLaneSession()}
                    >
                      Reset session
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <ChampionshipAssignmentPanel
              activeCompetitionTypeId={activeCompetition?.competitionTypeId ?? null}
              lanes={competitionLanes}
              disabled={baseControlsDisabled || !assignmentEditingAllowed}
              onCompetitionTypeChange={setCompetitionTypeId}
              onApply={applyChampionshipAssignments}
            />

            {activeCompetition && activeCompetition.phase !== 'MATCH_COMPLETE' && (
              <Card>
                <ProductionOperationsPanel
                  key={activeCompetition.competitionId}
                  competitionId={activeCompetition.competitionId}
                  competitionTypeId={activeCompetition.competitionTypeId}
                  roundName={activeCompetition.roundName}
                  phase={activeCompetition.phase}
                />
              </Card>
            )}

            {activeCompetition && (
              <Card>
                <RelayAthleteLifecyclePanel
                  key={`athlete-lifecycle:${activeCompetition.competitionId}`}
                  competitionId={activeCompetition.competitionId}
                  relayNumber={resultContext?.relayNumber ?? 1}
                  preferredPhase={activeCompetition.phase === 'MATCH_COMPLETE' ? 'POST_RELAY' : 'PRE_RELAY'}
                  athletes={competitionLanes.flatMap((lane) => {
                    const athlete = lane.assignment?.athlete;
                    if (!athlete) return [];
                    return [
                      {
                        laneId: lane.laneId,
                        laneLabel: lane.firingPointNumber
                          ? `Firing point ${lane.firingPointNumber}`
                          : lane.laneAlias || lane.laneId.slice(0, 8),
                        athleteId: athlete.id,
                        athleteName: athlete.name,
                        athleteStartNumber: athlete.startNumber,
                      },
                    ];
                  })}
                />
              </Card>
            )}

            {activeCompetition?.phase === 'NOT_STARTED' && (
              <Card>
                <OperationalProfilePanel
                  key={activeCompetition.competitionId}
                  competitionId={activeCompetition.competitionId}
                  onApplied={() => setOperationalSettingsRevision((value) => value + 1)}
                />
              </Card>
            )}

            {activeCompetition && activeCompetition.phase !== 'MATCH_COMPLETE' && (
              <Card>
                <RelayReadinessPanel
                  key={`${activeCompetition.competitionId}:${activeCompetition.phase}:${operationalSettingsRevision}`}
                  competitionId={activeCompetition.competitionId}
                  relayNumber={resultContext?.relayNumber ?? 1}
                  phase={
                    activeCompetition.phase === 'NOT_STARTED' || activeCompetition.phase === 'SIGHTING'
                      ? 'SIGHTING'
                      : 'MATCH'
                  }
                  lanes={competitionLanes.map((lane) => ({
                    laneId: lane.laneId,
                    label: lane.firingPointNumber
                      ? `Firing point ${lane.firingPointNumber} · ${lane.laneAlias || lane.laneId.slice(0, 8)}`
                      : lane.laneAlias || lane.laneId.slice(0, 8),
                  }))}
                />
              </Card>
            )}

            {activeCompetition && activeCompetition.phase !== 'MATCH_COMPLETE' && (
              <Card>
                <EstInspectionStartPanel
                  key={`inspection:${activeCompetition.competitionId}:${operationalSettingsRevision}`}
                  competitionId={activeCompetition.competitionId}
                  lanes={competitionLanes.map((lane) => ({
                    laneId: lane.laneId,
                    label: lane.laneAlias || lane.laneId.slice(0, 8),
                  }))}
                />
              </Card>
            )}

            {activeCompetition && activeCompetitionDefinition?.timedTarget && (
              <TimedTargetControlPanel
                key={`timed-target:${activeCompetition.competitionId}`}
                definition={activeCompetitionDefinition}
                phase={activeCompetition.phase}
                lanes={competitionLanes}
                disabled={baseControlsDisabled}
                onStart={startTimedTarget}
                onCancel={cancelTimedTarget}
                onRecordUnload={recordTimedTargetUnload}
              />
            )}

            {activeCompetition && resultContext?.eventId && (
              <Card>
                <IrregularShotCasesPanel
                  key={`irregular-shots:${activeCompetition.competitionId}:${resultContext.eventId}`}
                  eventId={resultContext.eventId}
                  competitionId={activeCompetition.competitionId}
                  resultScope={activeCompetition.roundName === 'Final' ? 'FINAL' : 'QUALIFICATION'}
                  adjudication={activeCompetitionDefinition?.finalSeriesAdjudication}
                  lanes={competitionLanes.map((lane) => ({
                    laneId: lane.laneId,
                    label: lane.firingPointNumber
                      ? `Firing point ${lane.firingPointNumber} · ${lane.laneAlias || lane.laneId.slice(0, 8)}`
                      : lane.laneAlias || lane.laneId.slice(0, 8),
                  }))}
                  disabled={baseControlsDisabled}
                />
              </Card>
            )}

            {activeCompetition &&
              activeCompetition.roundName !== 'Final' &&
              resultContext?.eventId &&
              activeCompetitionDefinition?.qualificationMalfunction && (
                <Card>
                  <QualificationMalfunctionPanel
                    key={`qualification-malfunctions:${activeCompetition.competitionId}:${resultContext.eventId}`}
                    competitionId={activeCompetition.competitionId}
                    eventId={resultContext.eventId}
                    relayNumber={resultContext.relayNumber}
                    lanes={competitionLanes}
                    supportsExceptionalMatchParts={
                      activeCompetitionDefinition.qualificationMalfunction.claimLimit
                        ?.exceptionalTwoPartMaximumPerPart !== undefined
                    }
                    disabled={busyAction !== null}
                  />
                </Card>
              )}

            {activeCompetition?.roundName === 'Final' && (
              <Card>
                <FinalOperationPanel
                  key={`operation:${activeCompetition.competitionId}`}
                  competitionId={activeCompetition.competitionId}
                  competitionTypeId={activeCompetition.competitionTypeId}
                  competitorUnit={activeCompetition.competitionUnit ?? 'INDIVIDUAL'}
                  phase={activeCompetition.phase}
                  lanes={competitionLanes}
                  eventId={resultContext?.eventId}
                  disabled={baseControlsDisabled}
                />
              </Card>
            )}

            {activeCompetition?.roundName === 'Final' && (
              <Card>
                <FinalRecoveryPanel
                  key={`recovery:${activeCompetition.competitionId}`}
                  competitionId={activeCompetition.competitionId}
                  competitionTypeId={activeCompetition.competitionTypeId}
                  phase={activeCompetition.phase}
                  lanes={competitionLanes}
                  eventId={resultContext?.eventId}
                  disabled={baseControlsDisabled}
                />
              </Card>
            )}

            {activeCompetition?.roundName === 'Final' && activeCompetition.competitionUnit !== 'MIXED_TEAM' && (
              <Card>
                <FinalControlPanel
                  key={activeCompetition.competitionId}
                  competitionId={activeCompetition.competitionId}
                  competitionTypeId={activeCompetition.competitionTypeId}
                  eventId={resultContext?.eventId}
                  lanes={competitionLanes}
                  disabled={baseControlsDisabled || activeCompetition.phase !== 'MATCH'}
                />
              </Card>
            )}

            {activeCompetition?.roundName === 'Final' && activeCompetition.competitionUnit === 'MIXED_TEAM' && (
              <Card>
                <MixedTeamFinalControlPanel
                  key={activeCompetition.competitionId}
                  competitionId={activeCompetition.competitionId}
                  competitionTypeId={activeCompetition.competitionTypeId}
                  eventId={resultContext?.eventId}
                  lanes={competitionLanes}
                  disabled={baseControlsDisabled || activeCompetition.phase !== 'MATCH'}
                />
              </Card>
            )}

            {activeCompetition?.roundName === 'Final' && activeCompetition.competitionUnit === 'MIXED_TEAM' && (
              <Card>
                <MixedTeamTimeoutPanel
                  key={`timeout:${activeCompetition.competitionId}`}
                  competitionId={activeCompetition.competitionId}
                  lanes={competitionLanes}
                  disabled={baseControlsDisabled || activeCompetition.phase !== 'MATCH'}
                />
              </Card>
            )}

            {activeCompetition && (
              <Card>
                {activeCompetition.roundName !== 'Final' && (
                  <ReserveLaneTransferPanel
                    key={`transfer:${activeCompetition.competitionId}`}
                    competitionId={activeCompetition.competitionId}
                    lanes={competitionLanes.map((lane) => ({
                      laneId: lane.laneId,
                      label: lane.firingPointNumber
                        ? `Firing point ${lane.firingPointNumber} · ${lane.laneAlias || lane.laneId.slice(0, 8)}`
                        : lane.laneAlias || lane.laneId.slice(0, 8),
                    }))}
                  />
                )}
                <RangeInterruptionsPanel
                  key={activeCompetition.competitionId}
                  primaryScope={{ scopeType: 'COMPETITION', scopeId: activeCompetition.competitionId }}
                  additionalScopes={resultContext ? [{ scopeType: 'EVENT', scopeId: resultContext.eventId }] : []}
                  competitionId={
                    activeCompetition.phase === 'SIGHTING' || activeCompetition.phase === 'MATCH'
                      ? activeCompetition.competitionId
                      : undefined
                  }
                  defaultLaneId={assignmentLaneId}
                  defaultPhase={activeCompetition.phase === 'SIGHTING' ? 'SIGHTING' : 'MATCH'}
                  defaultRemainingSeconds={estimateRemainingSeconds(activeCompetition.activeTimer)}
                  qualificationTimedTargetCompetitionTypeId={
                    activeCompetitionDefinition?.timedTarget?.recovery.procedure === 'QUALIFICATION'
                      ? activeCompetition.competitionTypeId
                      : undefined
                  }
                  lanes={competitionLanes.map((lane) => ({
                    laneId: lane.laneId,
                    label: lane.firingPointNumber
                      ? `Firing point ${lane.firingPointNumber} · ${lane.laneAlias || lane.laneId.slice(0, 8)}`
                      : lane.laneAlias || lane.laneId.slice(0, 8),
                    firingPointNumber: lane.firingPointNumber,
                    ...(lane.assignment?.athlete ? { athleteName: lane.assignment.athlete.name } : {}),
                    ...(lane.competitionState?.interruption
                      ? { interruption: lane.competitionState.interruption }
                      : {}),
                    ...(lane.competitionState
                      ? {
                          seriesSnapshot: {
                            stageIndex: lane.competitionState.currentStage.index,
                            seriesIndex: lane.competitionState.currentSeries.index,
                            recordedShots: lane.competitionState.currentSeries.shotsRecorded,
                            maxShots: lane.competitionState.currentSeries.maxShots,
                            seriesComplete: lane.competitionState.phase === 'SERIES_COMPLETE',
                            capturedAt: lane.competitionState.publishedAt,
                          },
                        }
                      : {}),
                  }))}
                />
              </Card>
            )}

            {activeCompetition && (
              <Card>
                <div className="space-y-5">
                  <EstComplaintInbox
                    competitionId={activeCompetition.competitionId}
                    observedSignalIds={competitionEstComplaintSignalIds}
                    relayNumber={resultContext?.relayNumber}
                    onCaseOpened={() => setTargetExaminationVersion((version) => version + 1)}
                  />
                  <div className="border-t border-vscode-border pt-5">
                    <TargetExaminationsPanel
                      key={`${activeCompetition.competitionId}:${targetExaminationVersion}`}
                      primaryScope={{ scopeType: 'COMPETITION', scopeId: activeCompetition.competitionId }}
                      additionalScopes={resultContext ? [{ scopeType: 'EVENT', scopeId: resultContext.eventId }] : []}
                      defaultLaneId={assignmentLaneId}
                      lanes={competitionLanes.map((lane) => ({
                        laneId: lane.laneId,
                        label: lane.firingPointNumber
                          ? `Firing point ${lane.firingPointNumber} · ${lane.laneAlias || lane.laneId.slice(0, 8)}`
                          : lane.laneAlias || lane.laneId.slice(0, 8),
                        firingPointNumber: lane.firingPointNumber,
                        ...(lane.assignment?.athlete ? { athleteName: lane.assignment.athlete.name } : {}),
                      }))}
                    />
                  </div>
                </div>
              </Card>
            )}
          </div>

          <Card className="self-start xl:sticky xl:top-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-vscode-text">Run control</h3>
              <p className="mt-0.5 text-xs text-vscode-text-muted">
                {activeCompetition
                  ? `${activeCompetition.competitionTypeId} · ${activeCompetition.laneIds.length} Lanes · ${activeCompetition.phase.replaceAll('_', ' ')}`
                  : 'No active competition'}
              </p>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-vscode-text-muted">
              Selected competition
              <select
                aria-label="Selected competition"
                value={selectedCompetitionId ?? ''}
                onChange={(event) => setSelectedCompetitionId(event.target.value || null)}
                className="min-h-9 w-full rounded-[3px] border border-vscode-border bg-vscode-input px-2.5 py-1.5 text-[13px] text-vscode-text"
              >
                <option value="">No competition</option>
                {snapshot.competitions.map((competition) => (
                  <option key={competition.competitionId} value={competition.competitionId}>
                    {competition.competitionTypeId} · {competition.phase} · {competition.laneIds.length} Lanes ·{' '}
                    {competition.competitionId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>

            <ol
              aria-label="Competition phases"
              className="mt-4 grid grid-cols-4 divide-x divide-vscode-border border-y border-vscode-border"
            >
              {COMPETITION_PHASE_STEPS.map((step, index) => {
                const completed = currentPhaseIndex > index;
                const current = currentPhaseIndex === index;
                return (
                  <li
                    key={step.label}
                    aria-current={current ? 'step' : undefined}
                    className={`flex min-w-0 flex-col gap-0.5 border-t-2 px-2 py-2 ${
                      current
                        ? 'border-t-vscode-primary bg-vscode-primary/[0.07] text-vscode-text'
                        : completed
                          ? 'border-t-vscode-success text-vscode-text-muted'
                          : 'border-t-transparent text-vscode-dimmed'
                    }`}
                  >
                    <span
                      className={`h-4 font-mono text-[10px] ${
                        current ? 'text-vscode-accent' : completed ? 'text-vscode-success' : 'text-vscode-dimmed'
                      }`}
                    >
                      {completed ? <Check size={12} aria-hidden="true" /> : `0${index + 1}`}
                    </span>
                    <span className="truncate text-[11px] font-semibold">{step.label}</span>
                  </li>
                );
              })}
            </ol>

            {!activeCompetition && (
              <p className="mt-3 border-l-2 border-vscode-border pl-3 text-xs leading-5 text-vscode-text-muted">
                Select Lanes and create a competition to enable run controls.
              </p>
            )}

            <div className="mt-4 border-t border-vscode-border pt-3">
              <p className="mb-2 text-[11px] font-semibold text-vscode-text-muted">Lane membership</p>
              <div className="grid grid-cols-2 gap-2 [&>button]:w-full">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={
                    controlsDisabled || activeCompetition?.phase !== 'NOT_STARTED' || selectedJoinLaneIds.length === 0
                  }
                  onClick={() => void changeMembership('join', selectedJoinLaneIds)}
                >
                  Join selected Lanes
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={
                    controlsDisabled ||
                    selectedJoinedLaneIds.length === 0 ||
                    selectedLeaveLaneIds.length !== selectedJoinedLaneIds.length
                  }
                  onClick={() => void changeMembership('leave', selectedLeaveLaneIds)}
                >
                  Remove selected Lanes
                </Button>
              </div>

              {activeCompetition && activeCompetition.phase !== 'MATCH_COMPLETE' && (
                <CompetitionStartReadinessPanel
                  key={`${activeCompetition.competitionId}:${activeCompetition.phase}`}
                  competitionId={activeCompetition.competitionId}
                  phase={['NOT_STARTED', 'SIGHTING'].includes(activeCompetition.phase) ? 'SIGHTING' : 'MATCH'}
                />
              )}
              <p className="mb-2 mt-4 text-[11px] font-semibold text-vscode-text-muted">Course of fire</p>
              <div className="grid grid-cols-2 gap-2 [&>button]:w-full">
                <Button
                  size="sm"
                  disabled={controlsDisabled || !canStartOrRetrySighting}
                  onClick={() => void startSighting()}
                >
                  {activeCompetition?.phase === 'SIGHTING' && pendingSightingLaneIds.length > 0
                    ? `Retry sighting for pending Lanes (${pendingSightingLaneIds.length})`
                    : `Start sighting (${formatTimerDuration(displayedCompetitionTiming.preparationAndSightingSeconds)})`}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={
                    controlsDisabled || activeCompetition?.phase !== 'SIGHTING' || pendingSightingLaneIds.length > 0
                  }
                  onClick={() =>
                    void invokeCompetitionCommand('end-sighting', (competitionId) =>
                      mqttService.endSighting({ competitionId }),
                    )
                  }
                >
                  End sighting
                </Button>
                <Button
                  size="sm"
                  disabled={controlsDisabled || activeCompetition?.phase !== 'SIGHTING_COMPLETE'}
                  onClick={() => void startMatch()}
                >
                  {displayedCompetitionTiming.matchSeconds === null
                    ? 'Enter timed-target match'
                    : `Start match (${formatTimerDuration(displayedCompetitionTiming.matchSeconds)})`}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={controlsDisabled || activeCompetition?.phase !== 'MATCH' || advanceSeriesSource === null}
                  onClick={() =>
                    void invokeCompetitionCommand('advance', (competitionId) => {
                      if (!advanceSeriesSource) throw new Error('No completed series is available to advance');
                      return mqttService.advanceSeries({ competitionId, ...advanceSeriesSource });
                    })
                  }
                >
                  Next series
                </Button>
              </div>
            </div>

            <div className="mt-4 border-t border-vscode-border pt-3">
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                disabled={finishDisabled}
                onClick={() => void finishCompetition()}
              >
                {activeCompetition?.phase === 'MATCH_COMPLETE' ? 'Retry cleanup' : 'Finish competition'}
              </Button>
            </div>

            {pendingJoinLaneIds.length > 0 && (
              <div
                className="mt-4 flex items-start gap-2 border-l-2 border-vscode-warning pl-3 text-xs leading-5 text-vscode-warning"
                role="status"
              >
                <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <p>
                  {pendingJoinLaneIds.length} Lane membership confirmation(s) are pending. Select those Lanes and retry
                  joining, or remove them before starting the competition.
                </p>
              </div>
            )}

            {activeCompetition && !resultContext && !activeCompetition.cleanupPreparedAt && (
              <div
                className="mt-3 flex items-start gap-2 border-l-2 border-vscode-warning pl-3 text-xs leading-5 text-vscode-warning"
                role="status"
              >
                <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <p>No championship assignment is linked. Results will not be saved to championship management.</p>
              </div>
            )}
            {activeCompetition && resultContext && !canPublishResults && !activeCompetition.cleanupPreparedAt && (
              <div
                className="mt-3 flex items-start gap-2 border-l-2 border-vscode-warning pl-3 text-xs leading-5 text-vscode-warning"
                role="status"
              >
                <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <p>Finishing before the match starts will abandon the competition without saving results.</p>
              </div>
            )}

            {unscoredObservations.length > 0 && (
              <details className="mt-4 border-l-2 border-vscode-warning bg-vscode-warning/5 px-3 py-2.5">
                <summary className="cursor-pointer text-xs font-semibold text-vscode-warning">
                  Unscored target observations ({unscoredObservations.length})
                </summary>
                <p className="mt-2 text-xs leading-5 text-vscode-text-muted">
                  These observations are immutable evidence and are not included in Lane or result totals.
                </p>
                <ul className="mt-2 grid max-h-64 gap-2 overflow-auto">
                  {unscoredObservations.map((evidence) => {
                    const lane = snapshot.lanes.find((entry) => entry.laneId === evidence.laneId);
                    return (
                      <li key={evidence.evidenceId} className="border-t border-vscode-border pt-2 text-xs leading-5">
                        <p className="font-semibold text-vscode-text">
                          {lane?.laneAlias || `Lane ${evidence.laneId.slice(0, 8)}`} ·{' '}
                          {evidence.outcome.replaceAll('_', ' ')}
                        </p>
                        <p className="text-vscode-text-muted">
                          Fired {new Date(evidence.firedAt).toLocaleString()} · received{' '}
                          {new Date(evidence.receivedAt).toLocaleString()}
                        </p>
                        <p className="text-vscode-dimmed">
                          Stage {evidence.competition?.stageIndex ?? '—'} · series{' '}
                          {evidence.competition?.seriesIndex ?? '—'} · observation {evidence.observationId.slice(0, 8)}
                        </p>
                        {evidence.detail && <p className="text-vscode-text-muted">{evidence.detail}</p>}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            {firingWindowViolations.length > 0 && (
              <details className="mt-4 border-l-2 border-vscode-warning bg-vscode-warning/5 px-3 py-2.5">
                <summary className="cursor-pointer text-xs font-semibold text-vscode-warning">
                  Firing-window review ({firingWindowViolations.length})
                </summary>
                <p className="mt-2 text-xs leading-5 text-vscode-text-muted">
                  Detection only; no score or Jury decision was changed.
                </p>
                <ul className="mt-2 grid gap-2">
                  {firingWindowViolations.map((violation) => {
                    const lane = snapshot.lanes.find((entry) => entry.laneId === violation.laneId);
                    return (
                      <li key={violation.id} className="border-t border-vscode-border pt-2 text-xs leading-5">
                        <p className="font-semibold text-vscode-text">
                          {lane?.laneAlias || `Lane ${violation.laneId.slice(0, 8)}`} · Rule {violation.ruleReference}
                        </p>
                        <p className="text-vscode-text-muted">
                          {violation.kind.replaceAll('_', ' ')} · {new Date(violation.evaluatedShotAt).toLocaleString()}
                        </p>
                        <p className="text-vscode-dimmed">
                          Evidence: {violation.timestampSource.replaceAll('_', ' ').toLowerCase()} · boundary tolerance{' '}
                          {violation.clockToleranceMilliseconds} ms
                        </p>
                        <p className="text-vscode-text-muted">{violation.reviewGuidance}</p>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            {snapshot.lastCommand && (
              <details className="mt-4 border-t border-vscode-border pt-3">
                <summary className="text-xs font-semibold text-vscode-text">
                  Last command: {snapshot.lastCommand.action}
                </summary>
                <div className="mt-3 grid gap-1.5 border-t border-vscode-border pt-3 text-xs">
                  {snapshot.lastCommand.lanes.map((lane) => (
                    <div key={lane.laneId} className="flex justify-between gap-4">
                      <code className="text-vscode-dimmed">{lane.laneId}</code>
                      <span
                        className={
                          lane.status !== 'done'
                            ? 'text-vscode-error'
                            : lane.warning
                              ? 'text-vscode-warning'
                              : 'text-vscode-success'
                        }
                      >
                        {lane.status}
                        {lane.error ? ` — ${lane.error.message}` : ''}
                        {lane.warning ? ` — warning: ${lane.warning}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
