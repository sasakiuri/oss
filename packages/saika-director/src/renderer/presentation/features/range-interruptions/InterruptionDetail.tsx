// SPDX-License-Identifier: MIT
import { PauseCircle, Play } from 'lucide-react';

import type { RangeInterruptionCaseDto, CaseScopePayload } from '@/shared/ipc/contracts';

import { Detail } from '../shared/cases/CaseFields';
import { LinkCaseScopeForm } from '../shared/cases/LinkCaseScopeForm';
import { unlinkedCaseScopes } from '../shared/cases/caseScopes';
import { Button } from '../shared/common/Button';

import { AuditHistory } from './AuditHistory';
import { GrantForm } from './GrantForm';
import { statusClass, formatDuration, shortLane } from './interruptionFormatting';
import {
  type RangeInterruptionCommands,
  type RangeInterruptionLaneOption,
  type DetailAction,
} from './interruptionPresentationTypes';
import { EndInterruptionForm, LaneOperationForm, GenericEntryForm } from './InterruptionRecordForms';
import {
  qualificationSeriesRecoveryComplete,
  blocksQualificationDecisionSupersession,
  rangeTargetLaneIds,
  pendingRangeLaneIds,
  rangeBatchRecoveryComplete,
} from './interruptionRecoveryState';
import {
  QualificationRecoveryDecisionHistory,
  QualificationRecoveryDecisionForm,
} from './QualificationRecoveryDecisionForm';
import { QualificationRecoveryExecutionPanel } from './QualificationRecoveryExecutionPanel';
import { QualificationRecoverySettlementPanel } from './QualificationRecoverySettlementPanel';
import { RecommendationPanel } from './RecommendationPanel';
import { TargetRecoveryForm } from './TargetRecoveryForm';
import { lowerCaseLabel } from '@/renderer/presentation/formatters/enumLabel';

export function InterruptionDetail({
  interruption,
  additionalScopes,
  lanes,
  competitionId,
  saving,
  action,
  onAction,
  commands,
}: {
  interruption: RangeInterruptionCaseDto;
  additionalScopes: readonly CaseScopePayload[];
  lanes: readonly RangeInterruptionLaneOption[];
  competitionId?: string;
  saving: boolean;
  action: DetailAction;
  onAction: (action: DetailAction) => void;
  commands: RangeInterruptionCommands;
}) {
  const lane = lanes.find((candidate) => candidate.laneId === interruption.laneId);
  const pauseRecorded = interruption.entries.some((entry) => entry.type === 'PAUSE_APPLIED');
  const matchResumeRecorded = interruption.entries.some((entry) => entry.type === 'MATCH_RESUMED');
  const latestGrant = [...interruption.entries].reverse().find((entry) => entry.type === 'TIME_GRANTED') ?? null;
  const authorizedRemainingSeconds = latestGrant?.authorizedRemainingSeconds ?? null;
  const latestQualificationDecision = interruption.qualificationTimedTargetRecoveryDecisions.at(-1) ?? null;
  const laneId = interruption.laneId;
  const laneControlAvailable = Boolean(competitionId && laneId);
  const rangeControlAvailable = Boolean(competitionId && !laneId && lanes.length > 0);
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
  const missingScopes = unlinkedCaseScopes(interruption.scopes, additionalScopes);
  /** Closes the operation form when its command succeeded. */
  const submitAndClose = async (command: Promise<boolean>) => {
    if (await command) onAction(null);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-vscode-text">{interruption.summary}</h3>
            <p className="mt-1 text-xs text-vscode-text-muted">
              {lowerCaseLabel(interruption.cause)} · {new Date(interruption.startedAt).toLocaleString()} · Record{' '}
              {interruption.id.slice(0, 8)}
            </p>
          </div>
          <span className={`text-xs font-semibold ${statusClass(interruption.status)}`}>
            {lowerCaseLabel(interruption.status)}
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
                ? `${lowerCaseLabel(lane.interruption.status)} · ${lane.interruption.interruptionId.slice(0, 8)}`
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
              return commands.startQualificationRecovery({ caseId: interruption.id, decisionId, competitionId, phase });
            }}
            onCancel={(runId, reason) =>
              commands.cancelQualificationRecovery({ caseId: interruption.id, runId, reason })
            }
            onAdjudicate={(runId, appliedBy, statement) =>
              commands.adjudicateQualificationRecovery({ caseId: interruption.id, runId, appliedBy, statement })
            }
          />
          <QualificationRecoverySettlementPanel
            interruption={interruption}
            competitionId={competitionId}
            saving={saving}
            onApply={async (decisionId, appliedBy, statement) => {
              if (!competitionId) return false;
              return commands.applyQualificationSettlement({
                caseId: interruption.id,
                decisionId,
                competitionId,
                appliedBy,
                statement,
              });
            }}
          />
        </>
      )}

      {missingScopes.map((scope) => (
        <LinkCaseScopeForm
          key={`${scope.scopeType}:${scope.scopeId}`}
          caseId={interruption.id}
          scope={scope}
          saving={saving}
          onLink={commands.linkScope}
        />
      ))}

      {action === 'pause' && competitionId && laneId && (
        <LaneOperationForm
          title="Apply Lane STOP"
          description="The Lane pauses and saves its remaining time. Its response is recorded here."
          submitLabel="Send STOP"
          defaultOfficial={interruption.openedBy}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmit={(officialName) =>
            submitAndClose(commands.pauseLane({ competitionId, laneId, interruptionId: interruption.id, officialName }))
          }
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
          onSubmit={(officialName) =>
            submitAndClose(
              commands.pauseRange({
                competitionId,
                targetLaneIds: targetRangeLaneIds,
                commandLaneIds: pendingRangeLaneIds(interruption, 'PAUSE', targetRangeLaneIds),
                interruptionId: interruption.id,
                officialName,
              }),
            )
          }
        />
      )}
      {action === 'end' && (
        <EndInterruptionForm
          interruption={interruption}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmitCommand={commands.appendEntry}
        />
      )}
      {action === 'grant' && (
        <GrantForm
          interruption={interruption}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmitCommand={commands.appendEntry}
        />
      )}
      {action === 'qualification-decision' && (
        <QualificationRecoveryDecisionForm
          interruption={interruption}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmitCommand={commands.recordQualificationDecision}
        />
      )}
      {action === 'recovery' && (
        <TargetRecoveryForm
          interruption={interruption}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmitCommand={commands.recordTargetRecovery}
        />
      )}
      {action === 'resume' && competitionId && laneId && latestGrant && authorizedRemainingSeconds !== null && (
        <LaneOperationForm
          title="Apply authorized Lane resume"
          description={`Resume with ${formatDuration(authorizedRemainingSeconds)}${latestGrant.unlimitedSightingShots ? ' in SIGHTING mode' : ' in MATCH mode'}. The recorded grant is not recalculated.`}
          submitLabel="Resume Lane timer"
          defaultOfficial={latestGrant.officialName}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmit={(officialName) =>
            submitAndClose(
              commands.resumeLane({
                competitionId,
                laneId,
                interruptionId: interruption.id,
                officialName,
                authorizedRemainingSeconds,
                unlimitedSightingShots: latestGrant.unlimitedSightingShots === true,
              }),
            )
          }
        />
      )}
      {action === 'resume' &&
        competitionId &&
        rangeControlAvailable &&
        latestGrant &&
        authorizedRemainingSeconds !== null && (
          <LaneOperationForm
            title="Apply authorized range resume"
            description={`Use one shared start timestamp for the incomplete Lanes, with ${formatDuration(authorizedRemainingSeconds)} authorized.`}
            submitLabel="Resume range timers"
            defaultOfficial={latestGrant.officialName}
            saving={saving}
            onCancel={() => onAction(null)}
            onSubmit={(officialName) =>
              submitAndClose(
                commands.resumeRange({
                  competitionId,
                  targetLaneIds: targetRangeLaneIds,
                  commandLaneIds: pendingRangeLaneIds(interruption, 'RESUME', targetRangeLaneIds),
                  interruptionId: interruption.id,
                  officialName,
                  authorizedRemainingSeconds,
                  unlimitedSightingShots: latestGrant.unlimitedSightingShots === true,
                }),
              )
            }
          />
        )}
      {action === 'match' && competitionId && laneId && (
        <LaneOperationForm
          title="Resume MATCH fire"
          description="Use this only after the athlete has completed the authorized unlimited sighting shots."
          submitLabel="Resume MATCH"
          defaultOfficial={latestGrant?.officialName ?? interruption.openedBy}
          saving={saving}
          onCancel={() => onAction(null)}
          onSubmit={(officialName) =>
            submitAndClose(
              commands.resumeLaneMatch({ competitionId, laneId, interruptionId: interruption.id, officialName }),
            )
          }
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
          onSubmit={(officialName) =>
            submitAndClose(
              commands.resumeRangeMatch({
                competitionId,
                targetLaneIds: targetRangeLaneIds,
                commandLaneIds: pendingRangeLaneIds(interruption, 'MATCH_RESUME', targetRangeLaneIds),
                interruptionId: interruption.id,
                officialName,
              }),
            )
          }
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
          onSubmitCommand={commands.appendEntry}
        />
      )}

      {interruption.targetRecoveryAssessments.length > 0 && (
        <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
          <h4 className="text-[13px] font-semibold text-vscode-text">Target recovery evidence</h4>
          <div className="mt-2 space-y-2">
            {interruption.targetRecoveryAssessments.map((assessment) => (
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

      {interruption.commandBatches.length > 0 && (
        <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
          <h4 className="text-[13px] font-semibold text-vscode-text">Range command attempts</h4>
          <div className="mt-2 space-y-2">
            {interruption.commandBatches.map((batch) => (
              <div key={batch.id} className="border-l-2 border-vscode-border pl-3 text-xs leading-5">
                <p className={batch.success ? 'font-medium text-vscode-text' : 'font-medium text-vscode-warning'}>
                  {lowerCaseLabel(batch.operation)} ·{' '}
                  {batch.outcomes.filter((outcome) => outcome.status === 'done').length}/{batch.outcomes.length}{' '}
                  acknowledged in this attempt
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
