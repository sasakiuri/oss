import type { QualificationTimedTargetSeriesRecoveryRecommendation } from '@sasakiuri/saika-rules';

import type { QualificationRecoveryShotPayload, QualificationRecoveryStatePayload } from '@/shared/mqtt';

import type { IQualificationRecoveryExecutionRepository } from '../domain/IQualificationRecoveryExecutionRepository';
import type { IQualificationRecoveryExecutionTransport } from '../domain/IQualificationRecoveryExecutionTransport';
import type { IRangeInterruptionRepository } from '../domain/IRangeInterruptionRepository';
import {
  createQualificationRecoveryExecutionEvent,
  createQualificationRecoveryExecutionStart,
  type QualificationRecoveryAdjudicationRequest,
  type QualificationRecoveryExecutionEvent,
  type QualificationRecoveryExecutionPhase,
  type QualificationRecoveryExecutionRecord,
  type QualificationRecoveryExecutionStart,
} from '../domain/QualificationRecoveryExecution';
import { requireQualificationSighting } from '../domain/QualificationSightingReadiness';
import { getRangeInterruptionState } from '../domain/RangeInterruptionEntry';

export interface StartQualificationRecoveryExecutionInput {
  readonly caseId: string;
  readonly decisionId: string;
  readonly competitionId: string;
  readonly phase: QualificationRecoveryExecutionPhase;
}

export interface CancelQualificationRecoveryExecutionInput {
  readonly caseId: string;
  readonly runId: string;
  readonly reason: string;
}

export interface AdjudicateQualificationRecoveryExecutionInput {
  readonly caseId: string;
  readonly runId: string;
  readonly appliedBy: string;
  readonly statement: string;
}

/** Binds an immutable official decision to the replaceable MQTT transport port. */
export class QualificationRecoveryExecutionService {
  constructor(
    private readonly interruptionRepository: IRangeInterruptionRepository,
    private readonly executionRepository: IQualificationRecoveryExecutionRepository,
    private readonly transport: IQualificationRecoveryExecutionTransport,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async start(input: StartQualificationRecoveryExecutionInput): Promise<QualificationRecoveryExecutionRecord> {
    const interruption = this.interruptionRepository.findCaseById(input.caseId);
    if (!interruption) throw new Error(`Range interruption ${input.caseId} not found`);
    if (!interruption.laneId) throw new Error('Qualification recovery execution requires one affected Lane');
    const scopes = this.interruptionRepository.findScopesByCaseIds([input.caseId]).get(input.caseId) ?? [];
    if (!scopes.some((scope) => scope.scopeType === 'COMPETITION' && scope.scopeId === input.competitionId)) {
      throw new Error(`Competition ${input.competitionId} is not linked to range interruption ${input.caseId}`);
    }
    const context = interruption.qualificationTimedTargetContext;
    if (!context) throw new Error('This interruption has no Qualification timed-target policy snapshot');
    const interruptionState = getRangeInterruptionState(
      this.interruptionRepository.findEntriesByCaseIds([input.caseId]).get(input.caseId) ?? [],
    );
    if (interruptionState.status !== 'ENDED') {
      throw new Error('Qualification recovery can only execute while the ended interruption remains open');
    }

    const decisions =
      this.interruptionRepository
        .findQualificationTimedTargetRecoveryDecisionsByCaseIds([input.caseId])
        .get(input.caseId) ?? [];
    const decision = decisions.at(-1);
    if (!decision) throw new Error('Record an official Qualification recovery decision before execution');
    if (decision.id !== input.decisionId) {
      throw new Error(`Only the latest Qualification recovery decision ${decision.id} can be executed`);
    }

    const sightingPrerequisite =
      input.phase === 'SERIES_RECOVERY'
        ? requireQualificationSighting(decision, this.listByCase(input.caseId), this.now())
        : undefined;
    const authorization =
      input.phase === 'EXTRA_SIGHTING'
        ? extraSightingAuthorization(decision.authorizedRecovery.extraSightingSeriesShots)
        : {
            ...seriesRecoveryAuthorization(decision.authorizedRecovery.seriesRecovery),
            ...(sightingPrerequisite ? { sightingPrerequisite } : {}),
          };
    const requested = createQualificationRecoveryExecutionStart({
      runId: crypto.randomUUID(),
      caseId: interruption.id,
      decisionId: decision.id,
      competitionId: input.competitionId,
      laneId: interruption.laneId,
      phase: input.phase,
      stageIndex: context.stageIndex,
      seriesIndex: context.seriesIndex,
      expectedMatchProgramId: context.timedTargetProgramId,
      expectedSeriesShotLimit: context.seriesShotLimit,
      expectedRecordedShots: context.recordedShots,
      authorization,
      officialName: decision.officialName,
      decisionRuleReference: decision.ruleReference,
      decidedAt: decision.decidedAt,
      requestedAt: this.now(),
    });
    const start = this.executionRepository.appendStart(requested);
    const current = this.requireExecution(start.runId);
    if (current.status !== 'REQUESTED' && current.status !== 'COMMAND_FAILED') return current;

    try {
      const command = await this.transport.start(toTransportStart(start));
      this.appendEvent(start.runId, 'START_RESULT', `start-result:${command.commandId}`, { command }, this.now());
      return this.requireExecution(start.runId);
    } catch (error) {
      const occurredAt = this.now();
      this.appendEvent(
        start.runId,
        'START_ERROR',
        `start-error:${crypto.randomUUID()}`,
        { error: errorMessage(error) },
        occurredAt,
      );
      throw error;
    }
  }

  async cancel(input: CancelQualificationRecoveryExecutionInput): Promise<QualificationRecoveryExecutionRecord> {
    const current = this.requireExecution(input.runId);
    if (current.caseId !== input.caseId) {
      throw new Error(`Qualification recovery run ${input.runId} does not belong to interruption ${input.caseId}`);
    }
    if (
      current.latestLaneState?.status === 'COMPLETED' ||
      current.status === 'ADJUDICATING' ||
      current.status === 'ADJUDICATION_FAILED' ||
      current.status === 'ADJUDICATED'
    ) {
      throw new Error('A completed Qualification recovery cannot be cancelled');
    }
    if (current.status === 'CANCELLED') return current;
    const reason = input.reason.trim();
    if (!reason) throw new Error('Qualification recovery cancellation reason is required');
    const requestId = crypto.randomUUID();
    const requestedAt = this.now();
    this.appendEvent(current.runId, 'CANCEL_REQUESTED', `cancel-requested:${requestId}`, { reason }, requestedAt);
    try {
      const command = await this.transport.cancel({
        competitionId: current.competitionId,
        laneId: current.laneId,
        runId: current.runId,
        reason,
      });
      this.appendEvent(current.runId, 'CANCEL_RESULT', `cancel-result:${command.commandId}`, { command }, this.now());
      return this.requireExecution(current.runId);
    } catch (error) {
      const occurredAt = this.now();
      this.appendEvent(
        current.runId,
        'CANCEL_ERROR',
        `cancel-error:${requestId}`,
        { error: errorMessage(error) },
        occurredAt,
      );
      throw error;
    }
  }

  async adjudicate(
    input: AdjudicateQualificationRecoveryExecutionInput,
  ): Promise<QualificationRecoveryExecutionRecord> {
    const appliedBy = requiredText(input.appliedBy, 'Adjudicating official');
    const statement = requiredText(input.statement, 'Adjudication statement');
    let current = this.requireExecution(input.runId);
    if (current.caseId !== input.caseId) {
      throw new Error(`Qualification recovery run ${input.runId} does not belong to interruption ${input.caseId}`);
    }
    if (current.phase !== 'SERIES_RECOVERY') {
      throw new Error('Extra sighting shots can never be adjudicated into the MATCH score');
    }

    const requested = current.events.find((event) => event.type === 'ADJUDICATION_REQUESTED');
    let adjudication: QualificationRecoveryAdjudicationRequest;
    if (requested) {
      adjudication = (requested.payload as { adjudication: QualificationRecoveryAdjudicationRequest }).adjudication;
      if (adjudication.appliedBy !== appliedBy || adjudication.statement !== statement) {
        throw new Error(`Qualification recovery run ${input.runId} is bound to a different adjudication request`);
      }
      if (current.status === 'ADJUDICATED') return current;
    } else {
      if (current.status !== 'COMPLETED') {
        throw new Error(`Qualification recovery run ${input.runId} is not ready for adjudication`);
      }
      assertCompleteObservedEvidence(current);
      const appliedAt = this.now();
      const completedAt = Date.parse(current.latestLaneState?.terminalAt ?? '');
      if (!Number.isFinite(completedAt) || appliedAt.getTime() < completedAt) {
        throw new Error('Qualification recovery cannot be adjudicated before the Lane firing window completes');
      }
      adjudication = {
        appliedBy,
        statement,
        appliedAt: appliedAt.toISOString(),
      };
      this.appendEvent(
        current.runId,
        'ADJUDICATION_REQUESTED',
        `adjudication-requested:${current.runId}`,
        { adjudication },
        new Date(adjudication.appliedAt),
      );
      current = this.requireExecution(current.runId);
    }

    try {
      const command = await this.transport.apply({
        competitionId: current.competitionId,
        laneId: current.laneId,
        runId: current.runId,
        appliedBy: adjudication.appliedBy,
        statement: adjudication.statement,
        appliedAt: adjudication.appliedAt,
      });
      this.appendEvent(
        current.runId,
        'ADJUDICATION_RESULT',
        `adjudication-result:${command.commandId}`,
        { command },
        this.now(),
      );
      return this.requireExecution(current.runId);
    } catch (error) {
      this.appendEvent(
        current.runId,
        'ADJUDICATION_ERROR',
        `adjudication-error:${crypto.randomUUID()}`,
        { error: errorMessage(error) },
        this.now(),
      );
      throw error;
    }
  }

  observeState(state: QualificationRecoveryStatePayload): boolean {
    const current = this.executionRepository.findByRunId(state.runId);
    if (!current) return false;
    const reason = stateBindingError(current, state);
    this.appendEvent(
      current.runId,
      reason ? 'LANE_STATE_REJECTED' : 'LANE_STATE',
      `lane-state:${state.runId}:${state.publishedAt}`,
      reason ? { state, reason } : { state },
      new Date(state.publishedAt),
    );
    return !reason;
  }

  observeShot(shot: QualificationRecoveryShotPayload): boolean {
    const current = this.executionRepository.findByRunId(shot.runId);
    if (!current) return false;
    const reason = shotBindingError(current, shot);
    this.appendEvent(
      current.runId,
      reason ? 'SHOT_REJECTED' : 'SHOT',
      `shot:${shot.shotId}`,
      reason ? { shot, reason } : { shot },
      new Date(shot.publishedAt),
    );
    return !reason;
  }

  listByCase(caseId: string): QualificationRecoveryExecutionRecord[] {
    return this.executionRepository.findByCaseIds([caseId]).get(caseId) ?? [];
  }

  private appendEvent(
    runId: string,
    type: QualificationRecoveryExecutionEvent['type'],
    eventKey: string,
    payload: QualificationRecoveryExecutionEvent['payload'],
    occurredAt: Date,
  ): void {
    this.executionRepository.appendEvent(
      createQualificationRecoveryExecutionEvent({
        id: crypto.randomUUID(),
        eventKey,
        runId,
        type,
        payload,
        occurredAt,
        recordedAt: this.now(),
      }),
    );
  }

  private requireExecution(runId: string): QualificationRecoveryExecutionRecord {
    const value = this.executionRepository.findByRunId(runId);
    if (!value) throw new Error(`Qualification recovery run ${runId} not found`);
    return value;
  }
}

function extraSightingAuthorization(shotsToFire: number) {
  if (shotsToFire <= 0) throw new Error('The official decision does not authorize an extra sighting series');
  return { phase: 'EXTRA_SIGHTING' as const, shotsToFire };
}

function seriesRecoveryAuthorization(recovery: QualificationTimedTargetSeriesRecoveryRecommendation) {
  if (recovery.treatment === 'KEEP_RECORDED_SERIES' || recovery.shotsToFire <= 0) {
    throw new Error('The official decision keeps the recorded series and authorizes no recovery firing');
  }
  return { phase: 'SERIES_RECOVERY' as const, seriesRecovery: recovery };
}

function toTransportStart(start: QualificationRecoveryExecutionStart) {
  return {
    competitionId: start.competitionId,
    laneId: start.laneId,
    runId: start.runId,
    decisionId: start.decisionId,
    interruptionId: start.caseId,
    stageIndex: start.stageIndex,
    seriesIndex: start.seriesIndex,
    expectedMatchProgramId: start.expectedMatchProgramId,
    expectedSeriesShotLimit: start.expectedSeriesShotLimit,
    expectedRecordedShots: start.expectedRecordedShots,
    authorization: start.authorization,
    officialName: start.officialName,
    decisionRuleReference: start.decisionRuleReference,
    decidedAt: start.decidedAt.toISOString(),
  };
}

function stateBindingError(
  execution: QualificationRecoveryExecutionRecord,
  state: QualificationRecoveryStatePayload,
): string | null {
  const mismatches = [
    state.sequenceId === execution.runId ? null : 'sequenceId',
    state.decisionId === execution.decisionId ? null : 'decisionId',
    state.interruptionId === execution.caseId ? null : 'interruptionId',
    state.competitionId === execution.competitionId ? null : 'competitionId',
    state.laneId === execution.laneId ? null : 'laneId',
    state.stageIndex === execution.stageIndex ? null : 'stageIndex',
    state.seriesIndex === execution.seriesIndex ? null : 'seriesIndex',
    state.expectedMatchProgramId === execution.expectedMatchProgramId ? null : 'expectedMatchProgramId',
    state.expectedSeriesShotLimit === execution.expectedSeriesShotLimit ? null : 'expectedSeriesShotLimit',
    state.expectedRecordedShots === execution.expectedRecordedShots ? null : 'expectedRecordedShots',
    JSON.stringify(state.authorization) === JSON.stringify(execution.authorization) ? null : 'authorization',
    state.officialName === execution.officialName ? null : 'officialName',
    state.decisionRuleReference === execution.decisionRuleReference ? null : 'decisionRuleReference',
    Date.parse(state.decidedAt) === execution.decidedAt.getTime() ? null : 'decidedAt',
    state.shots.length <= authorizedShotCount(execution.authorization) ? null : 'shots',
    new Set(state.shots.map((shot) => shot.shotId)).size === state.shots.length ? null : 'shotIds',
  ].filter((value): value is string => value !== null);
  return mismatches.length > 0
    ? `Lane state does not match immutable execution fields: ${mismatches.join(', ')}`
    : null;
}

function authorizedShotCount(authorization: QualificationRecoveryExecutionRecord['authorization']): number {
  return authorization.phase === 'EXTRA_SIGHTING'
    ? authorization.shotsToFire
    : authorization.seriesRecovery.shotsToFire;
}

function shotBindingError(
  execution: QualificationRecoveryExecutionRecord,
  shot: QualificationRecoveryShotPayload,
): string | null {
  const mismatches = [
    shot.decisionId === execution.decisionId ? null : 'decisionId',
    shot.interruptionId === execution.caseId ? null : 'interruptionId',
    shot.competitionId === execution.competitionId ? null : 'competitionId',
    shot.laneId === execution.laneId ? null : 'laneId',
    shot.phase === execution.phase ? null : 'phase',
    shot.stageIndex === execution.stageIndex ? null : 'stageIndex',
    shot.seriesIndex === execution.seriesIndex ? null : 'seriesIndex',
  ].filter((value): value is string => value !== null);
  return mismatches.length > 0
    ? `Recovery shot does not match immutable execution fields: ${mismatches.join(', ')}`
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertCompleteObservedEvidence(execution: QualificationRecoveryExecutionRecord): void {
  const state = execution.latestLaneState;
  if (state?.status !== 'COMPLETED') {
    throw new Error(`Qualification recovery run ${execution.runId} has no completed Lane state`);
  }
  const stateShotIds = [...state.shots.map((shot) => shot.shotId)].sort();
  const observedShotIds = [...execution.shots.map((shot) => shot.shotId)].sort();
  if (
    stateShotIds.length !== observedShotIds.length ||
    stateShotIds.some((shotId, index) => shotId !== observedShotIds[index])
  ) {
    throw new Error('Completed Lane state and observed recovery-shot evidence do not match');
  }
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}
