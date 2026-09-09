// SPDX-License-Identifier: MIT
import { Gauge, LoaderCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { useNavigationStore } from '@/renderer/presentation/stores/ui/navigation.store';

import { BackupCaptureReadinessPanel } from '../backup-capture-readiness/BackupCaptureReadinessPanel';
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

import { CompetitionRunPanel } from './CompetitionRunPanel';
import { ChampionshipAssignmentPanel } from './components/ChampionshipAssignmentPanel';
import { LaneAttentionSignals } from './LaneAttentionSignals';
import { LaneManagementPanel } from './LaneManagementPanel';
import { TimedTargetControlPanel } from './TimedTargetControlPanel';
import { useCompetitionCommands } from './useCompetitionCommands';
import { useCompetitionEvidence } from './useCompetitionEvidence';
import { useCompetitionSelection } from './useCompetitionSelection';
import { useMqttControlSnapshot } from './useMqttControlSnapshot';

function formatActionName(action: string): string {
  return action.replaceAll('-', ' ');
}

function estimateRemainingSeconds(timer: { timerStartAt: string; timerDurationSeconds: number } | undefined): number {
  if (!timer) return 0;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(timer.timerStartAt)) / 1000));
  return Math.max(0, timer.timerDurationSeconds - elapsedSeconds);
}

export function CompetitionControlScreen() {
  const setActiveScreen = useNavigationStore((state) => state.setActiveScreen);
  const [operationalSettingsRevision, setOperationalSettingsRevision] = useState(0);
  const [targetExaminationVersion, setTargetExaminationVersion] = useState(0);
  const { snapshot, refresh } = useMqttControlSnapshot();
  const selection = useCompetitionSelection(snapshot);
  const {
    selectedCompetitionId,
    setCompetitionTypeId,
    assignmentLaneId,
    activeCompetition,
    activeCompetitionTiming,
    activeCompetitionDefinition,
    assignmentEditingAllowed,
    competitionLanes,
  } = selection;
  const { firingWindowViolations, shotObservationEvidence } = useCompetitionEvidence(selectedCompetitionId);
  const commands = useCompetitionCommands({ selection, refresh });
  const {
    busyAction,
    resultContext,
    applyChampionshipAssignments,
    startTimedTarget,
    recordTimedTargetUnload,
    cancelTimedTarget,
  } = commands;
  const baseControlsDisabled =
    busyAction !== null || !snapshot.connected || !activeCompetition || activeCompetitionTiming === null;
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
            <LaneAttentionSignals lanes={snapshot.lanes} />
            <SafetyStopPanel
              connected={snapshot.connected}
              lanes={snapshot.lanes}
              targetLaneIds={snapshot.lanes.map((lane) => lane.laneId)}
            />
            <LaneManagementPanel
              selection={selection}
              commands={commands}
              lanes={snapshot.lanes}
              connected={snapshot.connected}
              baseControlsDisabled={baseControlsDisabled}
              onOpenNetworkSettings={() => setActiveScreen('settings')}
            />
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

            {activeCompetition && activeCompetition.phase !== 'MATCH_COMPLETE' && (
              <Card>
                <BackupCaptureReadinessPanel
                  key={`backup:${activeCompetition.competitionId}:${operationalSettingsRevision}`}
                  competitionId={activeCompetition.competitionId}
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

          <CompetitionRunPanel
            selection={selection}
            commands={commands}
            snapshot={snapshot}
            baseControlsDisabled={baseControlsDisabled}
            firingWindowViolations={firingWindowViolations}
            shotObservationEvidence={shotObservationEvidence}
          />
        </div>
      </div>
    </div>
  );
}
