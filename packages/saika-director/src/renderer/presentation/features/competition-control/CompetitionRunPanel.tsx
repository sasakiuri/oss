// SPDX-License-Identifier: MIT
import { AlertTriangle } from 'lucide-react';

import type {
  FiringWindowViolationDto,
  MqttControlSnapshotDto,
  ShotObservationEvidenceDto,
} from '@/shared/ipc/contracts';

import { ObservationReviewsPanel } from '../observation-reviews/ObservationReviewsPanel';
import { Button } from '../shared/common/Button';
import { Card } from '../shared/common/Card';

import { CompetitionEvidencePanel } from './CompetitionEvidencePanel';
import { CompetitionStartReadinessPanel } from './CompetitionStartReadinessPanel';
import type { CompetitionCommands } from './useCompetitionCommands';
import type { CompetitionSelection } from './useCompetitionSelection';

type Selection = Pick<
  CompetitionSelection,
  | 'selectedCompetitionId'
  | 'setSelectedCompetitionId'
  | 'activeCompetition'
  | 'displayedCompetitionTiming'
  | 'pendingJoinLaneIds'
  | 'pendingSightingLaneIds'
  | 'canPublishResults'
  | 'selectedJoinedLaneIds'
  | 'selectedJoinLaneIds'
  | 'selectedLeaveLaneIds'
  | 'advanceSeriesSource'
>;
type Commands = Pick<
  CompetitionCommands,
  | 'resultContext'
  | 'changeMembership'
  | 'startSighting'
  | 'startMatch'
  | 'finishCompetition'
  | 'endSighting'
  | 'advanceSeries'
>;
const COMPETITION_PHASE_STEPS = [
  { label: 'Setup', phases: ['NOT_STARTED'] },
  { label: 'Sighting', phases: ['SIGHTING', 'SIGHTING_COMPLETE'] },
  { label: 'Match', phases: ['MATCH'] },
  { label: 'Complete', phases: ['MATCH_COMPLETE'] },
] as const;

function phaseStepIndex(phase: string | undefined): number {
  return COMPETITION_PHASE_STEPS.findIndex((step) => (step.phases as readonly string[]).includes(phase ?? ''));
}

function formatTimerDuration(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} sec`;
}

interface CompetitionRunPanelProps {
  selection: Selection;
  commands: Commands;
  snapshot: MqttControlSnapshotDto;
  baseControlsDisabled: boolean;
  firingWindowViolations: FiringWindowViolationDto[];
  shotObservationEvidence: ShotObservationEvidenceDto[];
}
export function CompetitionRunPanel({
  selection,
  commands,
  snapshot,
  baseControlsDisabled,
  firingWindowViolations,
  shotObservationEvidence,
}: CompetitionRunPanelProps) {
  const {
    selectedCompetitionId,
    setSelectedCompetitionId,
    activeCompetition,
    displayedCompetitionTiming,
    pendingJoinLaneIds,
    pendingSightingLaneIds,
    canPublishResults,
    selectedJoinedLaneIds,
    selectedJoinLaneIds,
    selectedLeaveLaneIds,
    advanceSeriesSource,
  } = selection;
  const { resultContext, changeMembership, startSighting, startMatch, finishCompetition, endSighting, advanceSeries } =
    commands;
  const { lanes } = snapshot;
  const competitionLocked = activeCompetition?.phase === 'MATCH_COMPLETE';
  const controlsDisabled = baseControlsDisabled || competitionLocked;
  const finishDisabled = baseControlsDisabled;
  const canStartOrRetrySighting =
    (activeCompetition?.laneIds.length ?? 0) > 0 &&
    pendingJoinLaneIds.length === 0 &&
    (activeCompetition?.phase === 'NOT_STARTED' ||
      (activeCompetition?.phase === 'SIGHTING' && pendingSightingLaneIds.length > 0));
  const currentPhaseIndex = phaseStepIndex(activeCompetition?.phase);
  return (
    <Card className="self-start lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
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

      {!activeCompetition && (
        <p className="mt-3 border-l-2 border-vscode-border pl-3 text-xs leading-5 text-vscode-text-muted">
          Select Lanes and create a competition to enable run controls.
        </p>
      )}

      {activeCompetition && (
        <>
          <ol aria-label="Competition phases" className="mt-4 grid grid-cols-4 border-b border-vscode-border">
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
                  <span className="truncate text-xs font-medium">{step.label}</span>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 border-t border-vscode-border pt-3">
            <p className="mb-2 text-[11px] font-semibold text-vscode-text-muted">Lane membership</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 [&>button]:w-full">
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
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 [&>button]:w-full">
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
                onClick={() => void endSighting()}
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
                onClick={() => void advanceSeries()}
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
        </>
      )}

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

      {activeCompetition && (
        <ObservationReviewsPanel
          key={activeCompetition.competitionId}
          competitionId={activeCompetition.competitionId}
        />
      )}

      <CompetitionEvidencePanel
        lanes={lanes}
        firingWindowViolations={firingWindowViolations}
        shotObservationEvidence={shotObservationEvidence}
      />
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
  );
}
