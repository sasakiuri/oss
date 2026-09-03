import type {
  AppendRangeInterruptionEntryPayload,
  CreateRangeInterruptionCasePayload,
  LinkRangeInterruptionScopePayload,
  RangeInterruptionCaseDto,
  RangeInterruptionCommandBatchDto,
  RangeInterruptionEntryDto,
  RangeInterruptionScopeDto,
  RangeInterruptionScopePayload,
  RecordTargetRecoveryAssessmentPayload,
  RecordRangeCommandBatchPayload,
  RecordQualificationTimedTargetRecoveryDecisionPayload,
  TargetRecoveryAssessmentDto,
  QualificationTimedTargetRecoveryDecisionDto,
  QualificationRecoveryExecutionDto,
  QualificationRecoverySettlementDto,
} from '@/shared/ipc/contracts';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';

import type { IRangeInterruptionRepository } from '../domain/IRangeInterruptionRepository';
import type { IQualificationRecoveryExecutionRepository } from '../domain/IQualificationRecoveryExecutionRepository';
import type { QualificationRecoveryExecutionRecord } from '../domain/QualificationRecoveryExecution';
import type { IQualificationRecoverySettlementRepository } from '../domain/IQualificationRecoverySettlementRepository';
import type { QualificationRecoverySettlementRecord } from '../domain/QualificationRecoverySettlement';
import { createQualificationTimedTargetInterruptionContext } from '../domain/QualificationTimedTargetInterruptionContext';
import { QualificationTimedTargetRecoveryDecision } from '../domain/QualificationTimedTargetRecoveryDecision';
import { RangeInterruptionCase } from '../domain/RangeInterruptionCase';
import { recommendRangeInterruption } from '../domain/RangeInterruptionRecommendationPolicy';
import {
  getRangeInterruptionState,
  RangeInterruptionEntry,
  type RangeInterruptionState,
} from '../domain/RangeInterruptionEntry';
import { RangeInterruptionScopeLink } from '../domain/RangeInterruptionScopeLink';
import { TargetRecoveryAssessment } from '../domain/TargetRecoveryAssessment';
import {
  RangeInterruptionCommandBatch,
  type RangeCommandLaneOutcome,
  type RangeCommandOperation,
} from '../domain/RangeInterruptionCommandBatch';

/** Coordinates the independent, append-only interruption ledger and recommendation policy. */
export class RangeInterruptionService {
  constructor(
    private readonly repository: IRangeInterruptionRepository,
    private readonly competitionTypes?: CompetitionTypeRegistry,
    private readonly qualificationRecoveryExecutions?: Pick<IQualificationRecoveryExecutionRepository, 'findByCaseIds'>,
    private readonly qualificationRecoverySettlements?: Pick<
      IQualificationRecoverySettlementRepository,
      'findByCaseIds'
    >,
  ) {}

  async listAll(): Promise<RangeInterruptionCaseDto[]> {
    return this.projectCases(this.repository.findAllCases());
  }

  async listByScope(scope: RangeInterruptionScopePayload): Promise<RangeInterruptionCaseDto[]> {
    return this.projectCases(this.repository.findCasesByScope(scope));
  }

  async getById(caseId: string): Promise<RangeInterruptionCaseDto> {
    return this.projectCases([this.requireCase(caseId)])[0]!;
  }

  async create(input: CreateRangeInterruptionCasePayload): Promise<RangeInterruptionCaseDto> {
    validateUniqueScopes(input.scopes);
    const { qualificationTimedTargetContext: requestedContext, ...caseInput } = input;
    const interruption = RangeInterruptionCase.create({
      ...caseInput,
      startedAt: new Date(input.startedAt),
      ...(requestedContext
        ? { qualificationTimedTargetContext: this.resolveQualificationTimedTargetContext(input, requestedContext) }
        : {}),
    });
    const scopes = input.scopes.map((scope) =>
      RangeInterruptionScopeLink.create({
        caseId: interruption.id,
        ...scope,
        linkedBy: input.openedBy,
        note: 'Linked when the interruption record was opened',
      }),
    );
    this.repository.appendCase(interruption, scopes);
    return toDto(interruption, scopes, [], [], [], [], [], []);
  }

  private resolveQualificationTimedTargetContext(
    input: CreateRangeInterruptionCasePayload,
    requested: NonNullable<CreateRangeInterruptionCasePayload['qualificationTimedTargetContext']>,
  ) {
    if (input.cause !== 'ATHLETE_NON_FAULT') {
      throw new Error('ISSF 8.8.1 Qualification recovery applies only to a safety or technical interruption');
    }
    if (input.phase !== 'MATCH') {
      throw new Error('Qualification series recovery requires a MATCH interruption');
    }
    if (!input.laneId) throw new Error('Qualification series recovery requires an affected Lane');
    if (!this.competitionTypes) throw new Error('Competition type policy registry is unavailable');

    const definition = this.competitionTypes.get(requested.competitionTypeId);
    const recovery = definition.timedTarget?.recovery;
    if (recovery?.procedure !== 'QUALIFICATION') {
      throw new Error(`Competition type ${definition.id} has no Qualification timed-target recovery policy`);
    }
    const stage = definition.config.stages[requested.stageIndex];
    if (!stage || stage.type !== 'match' || !stage.id) {
      throw new Error(`Competition type ${definition.id} has no MATCH stage ${requested.stageIndex}`);
    }
    const series = stage.series[requested.seriesIndex];
    if (!series?.timedTargetProgramId || series.shots <= 0) {
      throw new Error(
        `Competition type ${definition.id} has no timed series at ${requested.stageIndex}:${requested.seriesIndex}`,
      );
    }
    const identity = definition.rulePackIdentity;
    return createQualificationTimedTargetInterruptionContext({
      competitionTypeId: definition.id,
      rulePack: identity
        ? {
            id: identity.id,
            schemaVersion: identity.schemaVersion,
            fingerprintSha256: identity.fingerprint.value,
          }
        : null,
      stageId: stage.id,
      stageIndex: requested.stageIndex,
      seriesIndex: requested.seriesIndex,
      timedTargetProgramId: series.timedTargetProgramId,
      seriesShotLimit: series.shots,
      recordedShots: requested.recordedShots,
      seriesComplete: requested.seriesComplete,
      laneSnapshotCapturedAt: requested.laneSnapshotCapturedAt,
      recoveryCapability: recovery,
    });
  }

  async linkScope(input: LinkRangeInterruptionScopePayload): Promise<RangeInterruptionCaseDto> {
    this.requireChangeableCase(input.caseId, { allowClosed: true });
    const existing = this.repository.findScopesByCaseIds([input.caseId]).get(input.caseId) ?? [];
    if (existing.some((scope) => scope.scopeType === input.scope.scopeType && scope.scopeId === input.scope.scopeId)) {
      throw new Error('This scope is already linked to the range interruption');
    }
    this.repository.appendScope(
      RangeInterruptionScopeLink.create({
        caseId: input.caseId,
        ...input.scope,
        linkedBy: input.linkedBy,
        note: input.note,
      }),
    );
    return this.getById(input.caseId);
  }

  async appendEntry(input: AppendRangeInterruptionEntryPayload): Promise<RangeInterruptionCaseDto> {
    const { interruption, state } = this.requireChangeableCase(input.caseId, {
      allowClosed: input.type === 'REOPENED' || input.type === 'VOID',
    });
    if (
      interruption.qualificationTimedTargetContext &&
      (input.type === 'TIME_GRANTED' || input.type === 'RESUME_APPLIED' || input.type === 'MATCH_RESUMED')
    ) {
      throw new Error('Qualification timed-target recovery must use its separate decision and execution workflow');
    }
    if (interruption.qualificationTimedTargetContext && input.type === 'CLOSED') {
      const decisions =
        this.repository.findQualificationTimedTargetRecoveryDecisionsByCaseIds([input.caseId]).get(input.caseId) ?? [];
      const decision = decisions.at(-1);
      if (!decision) {
        throw new Error('Record an official Qualification recovery decision before closing this interruption');
      }
      if (decision.authorizedRecovery.seriesRecovery.treatment === 'KEEP_RECORDED_SERIES') {
        const settlement = this.requireQualificationSettlements(input.caseId).find(
          (candidate) => candidate.decisionId === decision.id,
        );
        if (settlement?.status !== 'APPLIED') {
          throw new Error('Apply the Qualification retain-series settlement before closing this interruption');
        }
      } else {
        const seriesExecution = this.requireQualificationExecutions(input.caseId).find(
          (execution) => execution.decisionId === decision.id && execution.phase === 'SERIES_RECOVERY',
        );
        if (seriesExecution?.status !== 'ADJUDICATED') {
          throw new Error('Adjudicate the authorized Qualification series recovery before closing this interruption');
        }
      }
    }
    validateTransition(input.type, state);

    const occurredAt = new Date(input.occurredAt);
    const entry = RangeInterruptionEntry.create({
      ...input,
      occurredAt,
      ...(input.type === 'ENDED'
        ? {
            lostTimeSeconds: elapsedSeconds(interruption.startedAt, occurredAt),
            ruleReference: input.ruleReference ?? defaultRuleReference(interruption.cause),
          }
        : {}),
    });
    this.repository.appendEntry(entry);
    return this.getById(input.caseId);
  }

  async recordTargetRecovery(input: RecordTargetRecoveryAssessmentPayload): Promise<RangeInterruptionCaseDto> {
    const { interruption, state } = this.requireChangeableCase(input.caseId);
    if (interruption.cause !== 'SINGLE_TARGET_FAILURE') {
      throw new Error('Target recovery assessments apply only to a single-target failure');
    }
    if (state.status !== 'ENDED') {
      throw new Error('End the interruption before recording the target recovery assessment');
    }
    const repairCompletedAt = input.repairCompletedAt ? new Date(input.repairCompletedAt) : undefined;
    if (repairCompletedAt && repairCompletedAt.getTime() < interruption.startedAt.getTime()) {
      throw new Error('Target repair cannot complete before the interruption starts');
    }
    if (input.movedToReserveFiringPoint && input.reserveFiringPointNumber === undefined) {
      throw new Error('Record the reserve firing point number when the athlete moved');
    }

    this.repository.appendTargetRecoveryAssessment(
      TargetRecoveryAssessment.create({
        ...input,
        repairCompletedAt,
        assessedAt: input.assessedAt ? new Date(input.assessedAt) : undefined,
      }),
    );
    return this.getById(input.caseId);
  }

  async recordQualificationTimedTargetRecoveryDecision(
    input: RecordQualificationTimedTargetRecoveryDecisionPayload,
  ): Promise<RangeInterruptionCaseDto> {
    const { interruption, state } = this.requireChangeableCase(input.caseId);
    if (!interruption.qualificationTimedTargetContext) {
      throw new Error('This interruption has no Qualification timed-target policy snapshot');
    }
    if (state.status !== 'ENDED') {
      throw new Error('End the interruption before recording a Qualification recovery decision');
    }
    if (state.endedEntry?.lostTimeSeconds === null || state.endedEntry === null) {
      throw new Error('The interruption has no measured lost time');
    }
    const recommendation = recommendRangeInterruption(interruption, state.endedEntry.lostTimeSeconds);
    if (recommendation.type !== 'QUALIFICATION_TIMED_TARGET') {
      throw new Error('A Qualification timed-target recommendation is unavailable');
    }

    const prior =
      this.repository.findQualificationTimedTargetRecoveryDecisionsByCaseIds([input.caseId]).get(input.caseId) ?? [];
    const latest = prior.at(-1) ?? null;
    if (latest && input.supersedesDecisionId !== latest.id) {
      throw new Error(`A new decision must supersede the latest decision ${latest.id}`);
    }
    if (!latest && input.supersedesDecisionId !== undefined) {
      throw new Error('The first recovery decision must not supersede another decision');
    }
    if (latest && this.requireQualificationExecutions(input.caseId).some(blocksDecisionSupersession)) {
      throw new Error(
        'A Qualification recovery decision cannot be superseded while an execution remains active or requires adjudication',
      );
    }
    if (
      latest &&
      latest.authorizedRecovery.seriesRecovery.treatment === 'KEEP_RECORDED_SERIES' &&
      this.requireQualificationSettlements(input.caseId).some((settlement) => settlement.decisionId === latest.id)
    ) {
      throw new Error('A Qualification recovery decision cannot be superseded after settlement was requested');
    }

    validateAuthorizedRecoveryForContext(
      interruption.qualificationTimedTargetContext,
      input.authorizedRecovery.seriesRecovery,
    );

    const decidedAt = input.decidedAt ? new Date(input.decidedAt) : new Date();
    if (decidedAt.getTime() < state.endedEntry.occurredAt.getTime()) {
      throw new Error('A Qualification recovery decision cannot precede the end of the interruption');
    }
    this.repository.appendQualificationTimedTargetRecoveryDecision(
      QualificationTimedTargetRecoveryDecision.create({
        id: input.id,
        caseId: input.caseId,
        ...(input.supersedesDecisionId ? { supersedesDecisionId: input.supersedesDecisionId } : {}),
        recommendation,
        authorizedRecovery: input.authorizedRecovery,
        statement: input.statement,
        officialName: input.officialName,
        incidentReportReference: input.incidentReportReference,
        ruleReference: input.ruleReference,
        decidedAt,
      }),
    );
    return this.getById(input.caseId);
  }

  async recordCommandBatch(input: RecordRangeCommandBatchPayload): Promise<RangeInterruptionCaseDto> {
    const { state } = this.requireChangeableCase(input.caseId);
    const transitionType = transitionForOperation(input.operation);
    validateTransition(transitionType, state);
    const outcomes: RangeCommandLaneOutcome[] = input.commands.flatMap((command) =>
      command.lanes.map((lane) => ({
        commandId: command.commandId,
        action: command.action,
        laneId: lane.laneId,
        status: lane.status,
        errorCode: lane.error?.code ?? null,
        errorMessage: lane.error?.message ?? null,
        acknowledgedAt: lane.acknowledgedAt ?? null,
      })),
    );
    const batch = RangeInterruptionCommandBatch.create({
      id: input.id,
      caseId: input.caseId,
      competitionId: input.competitionId,
      operation: input.operation,
      targetLaneIds: unique(input.targetLaneIds),
      outcomes,
      officialName: input.officialName,
      occurredAt: new Date(input.occurredAt),
    });

    const prior = this.repository.findCommandBatchesByCaseIds([input.caseId]).get(input.caseId) ?? [];
    const related = [...prior, batch].filter(
      (candidate) =>
        candidate.operation === batch.operation &&
        candidate.competitionId === batch.competitionId &&
        sameSet(candidate.targetLaneIds, batch.targetLaneIds),
    );
    const latestOutcomeByLane = new Map<string, RangeCommandLaneOutcome>();
    for (const candidate of related) {
      for (const outcome of candidate.outcomes) latestOutcomeByLane.set(outcome.laneId, outcome);
    }
    const completed = batch.targetLaneIds.every((laneId) => latestOutcomeByLane.get(laneId)?.status === 'done');
    const transitionEntry = completed
      ? RangeInterruptionEntry.create({
          caseId: input.caseId,
          type: transitionType,
          occurredAt: batch.occurredAt,
          statement: `Range ${formatOperation(batch.operation)} acknowledged by all ${batch.targetLaneIds.length} intended Lane(s); per-Lane outcomes are retained in batch ${batch.id}.`,
          officialName: batch.officialName,
          ruleReference: 'ISSF 6.10.9 / 6.11.3',
          commandId: batch.id,
        })
      : undefined;
    this.repository.appendCommandBatch(batch, transitionEntry);
    return this.getById(input.caseId);
  }

  private requireCase(caseId: string): RangeInterruptionCase {
    const interruption = this.repository.findCaseById(caseId);
    if (!interruption) throw new Error(`Range interruption ${caseId} not found`);
    return interruption;
  }

  private requireQualificationExecutions(caseId: string): QualificationRecoveryExecutionRecord[] {
    if (!this.qualificationRecoveryExecutions) {
      throw new Error('Qualification recovery execution status is unavailable');
    }
    return this.qualificationRecoveryExecutions.findByCaseIds([caseId]).get(caseId) ?? [];
  }

  private requireQualificationSettlements(caseId: string): QualificationRecoverySettlementRecord[] {
    if (!this.qualificationRecoverySettlements) {
      throw new Error('Qualification recovery settlement status is unavailable');
    }
    return this.qualificationRecoverySettlements.findByCaseIds([caseId]).get(caseId) ?? [];
  }

  private requireChangeableCase(
    caseId: string,
    options: { allowClosed?: boolean } = {},
  ): { interruption: RangeInterruptionCase; entries: RangeInterruptionEntry[]; state: RangeInterruptionState } {
    const interruption = this.requireCase(caseId);
    const entries = this.repository.findEntriesByCaseIds([caseId]).get(caseId) ?? [];
    const state = getRangeInterruptionState(entries);
    if (state.status === 'VOID') throw new Error('A voided range interruption cannot be changed');
    if (state.status === 'CLOSED' && !options.allowClosed) {
      throw new Error('A closed range interruption must be reopened before it can be changed');
    }
    return { interruption, entries, state };
  }

  private projectCases(interruptions: readonly RangeInterruptionCase[]): RangeInterruptionCaseDto[] {
    const ids = interruptions.map((interruption) => interruption.id);
    const scopes = this.repository.findScopesByCaseIds(ids);
    const entries = this.repository.findEntriesByCaseIds(ids);
    const targetRecoveryAssessments = this.repository.findTargetRecoveryAssessmentsByCaseIds(ids);
    const commandBatches = this.repository.findCommandBatchesByCaseIds(ids);
    const qualificationDecisions = this.repository.findQualificationTimedTargetRecoveryDecisionsByCaseIds(ids);
    const qualificationExecutions = this.qualificationRecoveryExecutions?.findByCaseIds(ids) ?? new Map();
    const qualificationSettlements = this.qualificationRecoverySettlements?.findByCaseIds(ids) ?? new Map();
    return interruptions.map((interruption) =>
      toDto(
        interruption,
        scopes.get(interruption.id) ?? [],
        entries.get(interruption.id) ?? [],
        targetRecoveryAssessments.get(interruption.id) ?? [],
        commandBatches.get(interruption.id) ?? [],
        qualificationDecisions.get(interruption.id) ?? [],
        qualificationExecutions.get(interruption.id) ?? [],
        qualificationSettlements.get(interruption.id) ?? [],
      ),
    );
  }
}

function validateUniqueScopes(scopes: readonly RangeInterruptionScopePayload[]): void {
  const keys = scopes.map((scope) => `${scope.scopeType}:${scope.scopeId}`);
  if (new Set(keys).size !== keys.length) throw new Error('Range interruption scopes must be unique');
}

function validateTransition(type: AppendRangeInterruptionEntryPayload['type'], state: RangeInterruptionState): void {
  switch (type) {
    case 'PAUSE_APPLIED':
      if (state.status !== 'OPEN') throw new Error('A pause can only be recorded before the interruption ends');
      break;
    case 'ENDED':
      if (state.status !== 'OPEN') throw new Error('Only an open interruption can be ended');
      break;
    case 'TIME_GRANTED':
      if (state.status !== 'ENDED' && state.status !== 'GRANTED') {
        throw new Error('End the interruption before recording a time grant');
      }
      break;
    case 'RESUME_APPLIED':
      if (state.status !== 'GRANTED') throw new Error('Record the authorized time grant before applying a resume');
      break;
    case 'MATCH_RESUMED':
      if (state.status !== 'RESUMED') throw new Error('The Lane timer must be resumed before MATCH fire is resumed');
      if (!state.grantEntry?.unlimitedSightingShots) {
        throw new Error('MATCH resume is only a separate step when sighting shots were authorized');
      }
      break;
    case 'CLOSED':
      if (state.status === 'OPEN') throw new Error('End the interruption before closing its record');
      break;
    case 'REOPENED':
      if (state.status !== 'CLOSED') throw new Error('Only a closed range interruption can be reopened');
      break;
    case 'NOTE':
    case 'VOID':
      break;
  }
}

function elapsedSeconds(startedAt: Date, endedAt: Date): number {
  const elapsedMs = endedAt.getTime() - startedAt.getTime();
  if (elapsedMs < 0) throw new Error('The interruption cannot end before it starts');
  return Math.ceil(elapsedMs / 1000);
}

function blocksDecisionSupersession(execution: QualificationRecoveryExecutionRecord): boolean {
  if (execution.status === 'CANCELLED') return false;
  return execution.phase !== 'EXTRA_SIGHTING' || execution.status !== 'COMPLETED';
}

function validateAuthorizedRecoveryForContext(
  context: NonNullable<RangeInterruptionCase['qualificationTimedTargetContext']>,
  recovery: QualificationTimedTargetRecoveryDecision['authorizedRecovery']['seriesRecovery'],
): void {
  if (recovery.treatment === 'KEEP_RECORDED_SERIES') {
    if (context.recordedShots !== context.seriesShotLimit) {
      throw new Error('KEEP_RECORDED_SERIES requires every series shot to be recorded');
    }
    return;
  }
  if (recovery.shotsToFire <= 0) {
    throw new Error('A series recovery must authorize at least one shot');
  }
  const creditedShots =
    recovery.treatment === 'ANNUL_AND_REPEAT' ? recovery.shotsToFire : context.recordedShots + recovery.shotsToFire;
  if (creditedShots !== context.seriesShotLimit) {
    throw new Error(
      `The authorized recovery credits ${creditedShots} shot(s), but the interrupted series requires ${context.seriesShotLimit}`,
    );
  }
}

function defaultRuleReference(cause: RangeInterruptionCase['cause']): string {
  if (cause === 'ALL_TARGET_FAILURE') return 'ISSF 6.10.9.1';
  if (cause === 'SINGLE_TARGET_FAILURE') return 'ISSF 6.10.9.2';
  return 'ISSF 6.11.3';
}

function toDto(
  interruption: RangeInterruptionCase,
  scopes: readonly RangeInterruptionScopeLink[],
  entries: readonly RangeInterruptionEntry[],
  targetRecoveryAssessments: readonly TargetRecoveryAssessment[],
  commandBatches: readonly RangeInterruptionCommandBatch[],
  qualificationDecisions: readonly QualificationTimedTargetRecoveryDecision[],
  qualificationExecutions: readonly QualificationRecoveryExecutionRecord[],
  qualificationSettlements: readonly QualificationRecoverySettlementRecord[],
): RangeInterruptionCaseDto {
  const state = getRangeInterruptionState(entries);
  const recommendation =
    state.endedEntry?.lostTimeSeconds === null || state.endedEntry === null
      ? null
      : recommendRangeInterruption(
          interruption,
          state.endedEntry.lostTimeSeconds,
          targetRecoveryAssessments.at(-1) ?? null,
        );
  const recommendationDto =
    recommendation?.type === 'QUALIFICATION_TIMED_TARGET'
      ? { ...recommendation, ruleReferences: [...recommendation.ruleReferences] }
      : recommendation;
  return {
    id: interruption.id,
    cause: interruption.cause,
    phase: interruption.phase,
    startedAt: interruption.startedAt.toISOString(),
    remainingSecondsAtStart: interruption.remainingSecondsAtStart,
    laneId: interruption.laneId,
    firingPointNumber: interruption.firingPointNumber,
    athleteName: interruption.athleteName,
    summary: interruption.summary,
    details: interruption.details,
    openedBy: interruption.openedBy,
    createdAt: interruption.createdAt.toISOString(),
    scopes: scopes.map(toScopeDto),
    entries: entries.map(toEntryDto),
    targetRecoveryAssessments: targetRecoveryAssessments.map(toTargetRecoveryAssessmentDto),
    commandBatches: commandBatches.map(toCommandBatchDto),
    qualificationTimedTargetContext: interruption.qualificationTimedTargetContext
      ? {
          competitionTypeId: interruption.qualificationTimedTargetContext.competitionTypeId,
          rulePack: interruption.qualificationTimedTargetContext.rulePack,
          stageId: interruption.qualificationTimedTargetContext.stageId,
          stageIndex: interruption.qualificationTimedTargetContext.stageIndex,
          seriesIndex: interruption.qualificationTimedTargetContext.seriesIndex,
          timedTargetProgramId: interruption.qualificationTimedTargetContext.timedTargetProgramId,
          seriesShotLimit: interruption.qualificationTimedTargetContext.seriesShotLimit,
          recordedShots: interruption.qualificationTimedTargetContext.recordedShots,
          seriesComplete: interruption.qualificationTimedTargetContext.seriesComplete,
          laneSnapshotCapturedAt: interruption.qualificationTimedTargetContext.laneSnapshotCapturedAt,
        }
      : null,
    qualificationTimedTargetRecoveryDecisions: qualificationDecisions.map(toQualificationRecoveryDecisionDto),
    qualificationRecoveryExecutions: qualificationExecutions.map(toQualificationRecoveryExecutionDto),
    qualificationRecoverySettlements: qualificationSettlements.map(toQualificationRecoverySettlementDto),
    status: state.status,
    dataHoldActive: state.dataHoldActive,
    recommendation: recommendationDto,
  };
}

function toQualificationRecoverySettlementDto(
  settlement: QualificationRecoverySettlementRecord,
): QualificationRecoverySettlementDto {
  return {
    settlementId: settlement.settlementId,
    caseId: settlement.caseId,
    decisionId: settlement.decisionId,
    competitionId: settlement.competitionId,
    laneId: settlement.laneId,
    treatment: settlement.treatment,
    stageIndex: settlement.stageIndex,
    seriesIndex: settlement.seriesIndex,
    expectedMatchProgramId: settlement.expectedMatchProgramId,
    expectedSeriesShotLimit: settlement.expectedSeriesShotLimit,
    expectedRecordedShots: settlement.expectedRecordedShots,
    decisionOfficialName: settlement.decisionOfficialName,
    decisionRuleReference: settlement.decisionRuleReference,
    decidedAt: settlement.decidedAt.toISOString(),
    appliedBy: settlement.appliedBy,
    statement: settlement.statement,
    appliedAt: settlement.appliedAt.toISOString(),
    requestedAt: settlement.requestedAt.toISOString(),
    status: settlement.status,
    events: settlement.events.map((event) => ({
      id: event.id,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt.toISOString(),
      recordedAt: event.recordedAt.toISOString(),
    })),
  };
}

function toQualificationRecoveryExecutionDto(
  execution: QualificationRecoveryExecutionRecord,
): QualificationRecoveryExecutionDto {
  return {
    runId: execution.runId,
    caseId: execution.caseId,
    decisionId: execution.decisionId,
    competitionId: execution.competitionId,
    laneId: execution.laneId,
    phase: execution.phase,
    stageIndex: execution.stageIndex,
    seriesIndex: execution.seriesIndex,
    expectedMatchProgramId: execution.expectedMatchProgramId,
    expectedSeriesShotLimit: execution.expectedSeriesShotLimit,
    expectedRecordedShots: execution.expectedRecordedShots,
    authorization: execution.authorization,
    officialName: execution.officialName,
    decisionRuleReference: execution.decisionRuleReference,
    decidedAt: execution.decidedAt.toISOString(),
    requestedAt: execution.requestedAt.toISOString(),
    status: execution.status,
    latestLaneState: execution.latestLaneState,
    shots: [...execution.shots],
    events: execution.events.map((event) => ({
      id: event.id,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt.toISOString(),
      recordedAt: event.recordedAt.toISOString(),
    })),
  };
}

function toQualificationRecoveryDecisionDto(
  decision: QualificationTimedTargetRecoveryDecision,
): QualificationTimedTargetRecoveryDecisionDto {
  return {
    id: decision.id,
    caseId: decision.caseId,
    supersedesDecisionId: decision.supersedesDecisionId,
    recommendation: { ...decision.recommendation, ruleReferences: [...decision.recommendation.ruleReferences] },
    authorizedRecovery: {
      extraSightingSeriesShots: decision.authorizedRecovery.extraSightingSeriesShots,
      seriesRecovery: decision.authorizedRecovery.seriesRecovery,
    },
    followsRecommendation: decision.followsRecommendation,
    statement: decision.statement,
    officialName: decision.officialName,
    incidentReportReference: decision.incidentReportReference,
    ruleReference: decision.ruleReference,
    decidedAt: decision.decidedAt.toISOString(),
    recordedAt: decision.recordedAt.toISOString(),
  };
}

function toCommandBatchDto(batch: RangeInterruptionCommandBatch): RangeInterruptionCommandBatchDto {
  return {
    id: batch.id,
    caseId: batch.caseId,
    competitionId: batch.competitionId,
    operation: batch.operation,
    targetLaneIds: [...batch.targetLaneIds],
    success: batch.success,
    outcomes: batch.outcomes.map((outcome) => ({ ...outcome })),
    officialName: batch.officialName,
    occurredAt: batch.occurredAt.toISOString(),
    recordedAt: batch.recordedAt.toISOString(),
  };
}

function transitionForOperation(
  operation: RangeCommandOperation,
): 'PAUSE_APPLIED' | 'RESUME_APPLIED' | 'MATCH_RESUMED' {
  if (operation === 'PAUSE') return 'PAUSE_APPLIED';
  if (operation === 'RESUME') return 'RESUME_APPLIED';
  return 'MATCH_RESUMED';
}

function formatOperation(operation: RangeCommandOperation): string {
  if (operation === 'PAUSE') return 'STOP';
  if (operation === 'RESUME') return 'timer resume';
  return 'MATCH resume';
}

function unique(values: readonly string[]): string[] {
  const result = [...new Set(values)];
  if (result.length !== values.length) throw new Error('targetLaneIds must be unique');
  return result;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function toTargetRecoveryAssessmentDto(assessment: TargetRecoveryAssessment): TargetRecoveryAssessmentDto {
  return {
    id: assessment.id,
    caseId: assessment.caseId,
    repairCompletedAt: assessment.repairCompletedAt?.toISOString() ?? null,
    movedToReserveFiringPoint: assessment.movedToReserveFiringPoint,
    reserveFiringPointNumber: assessment.reserveFiringPointNumber,
    statement: assessment.statement,
    officialName: assessment.officialName,
    assessedAt: assessment.assessedAt.toISOString(),
  };
}

function toScopeDto(scope: RangeInterruptionScopeLink): RangeInterruptionScopeDto {
  return {
    id: scope.id,
    caseId: scope.caseId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    linkedBy: scope.linkedBy,
    note: scope.note,
    linkedAt: scope.linkedAt.toISOString(),
  };
}

function toEntryDto(entry: RangeInterruptionEntry): RangeInterruptionEntryDto {
  return {
    id: entry.id,
    caseId: entry.caseId,
    type: entry.type,
    occurredAt: entry.occurredAt.toISOString(),
    statement: entry.statement,
    officialName: entry.officialName,
    ruleReference: entry.ruleReference,
    lostTimeSeconds: entry.lostTimeSeconds,
    extensionSeconds: entry.extensionSeconds,
    authorizedRemainingSeconds: entry.authorizedRemainingSeconds,
    unlimitedSightingShots: entry.unlimitedSightingShots,
    incidentReportReference: entry.incidentReportReference,
    commandId: entry.commandId,
    recordedAt: entry.recordedAt.toISOString(),
  };
}
