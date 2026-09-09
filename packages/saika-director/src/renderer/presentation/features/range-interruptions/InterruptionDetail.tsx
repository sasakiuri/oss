// SPDX-License-Identifier: MIT
import { PauseCircle, Play } from 'lucide-react';

import { mqttService, rangeInterruptionsService } from '@/renderer/services';
import type { RangeInterruptionCaseDto, RangeInterruptionScopePayload } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { AuditHistory } from './AuditHistory';
import { GrantForm } from './GrantForm';
import { Detail } from './InterruptionFields';
import { statusClass, formatEnum, formatDuration, shortLane } from './interruptionFormatting';
import { type RangeInterruptionLaneOption, type DetailAction } from './interruptionPresentationTypes';
import { EndInterruptionForm, LaneOperationForm, GenericEntryForm, LinkScopeForm } from './InterruptionRecordForms';
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
import { RecommendationPanel } from './RecommendationPanel';
import { TargetRecoveryForm } from './TargetRecoveryForm';

export function InterruptionDetail({
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

function laneWorkflowPorts(): RangeInterruptionLaneWorkflowPorts {
  return { lane: mqttService, ledger: rangeInterruptionsService };
}

function rangeWorkflowPorts(): RangeInterruptionRangeWorkflowPorts {
  return { lane: mqttService, ledger: rangeInterruptionsService };
}
