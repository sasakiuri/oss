import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type {
  AppendRangeInterruptionEntryPayload,
  CreateRangeInterruptionCasePayload,
  LinkCaseScopePayload,
  RangeInterruptionCaseDto,
  CaseScopePayload,
  RecordTargetRecoveryAssessmentPayload,
  RecordRangeCommandBatchPayload,
  RecordQualificationTimedTargetRecoveryDecisionPayload,
} from '@/shared/ipc/contracts';

import type { IQualificationRecoveryExecutionRepository } from '../domain/IQualificationRecoveryExecutionRepository';
import type { IQualificationRecoverySettlementRepository } from '../domain/IQualificationRecoverySettlementRepository';
import type { IRangeInterruptionRepository } from '../domain/IRangeInterruptionRepository';
import {
  blocksDecisionSupersession,
  type QualificationRecoveryExecutionRecord,
} from '../domain/QualificationRecoveryExecution';
import type { QualificationRecoverySettlementRecord } from '../domain/QualificationRecoverySettlement';
import {
  assertQualificationSeriesRecoveryApplies,
  qualificationTimedTargetContextFor,
} from '../domain/QualificationTimedTargetInterruptionContext';
import {
  assertQualificationRecoveryCarriedOut,
  QualificationTimedTargetRecoveryDecision,
} from '../domain/QualificationTimedTargetRecoveryDecision';
import { RangeInterruptionCase } from '../domain/RangeInterruptionCase';
import {
  RangeInterruptionCommandBatch,
  type RangeCommandLaneOutcome,
  type RangeCommandOperation,
} from '../domain/RangeInterruptionCommandBatch';
import {
  getRangeInterruptionState,
  RangeInterruptionEntry,
  type RangeInterruptionState,
} from '../domain/RangeInterruptionEntry';
import { recommendRangeInterruption } from '../domain/RangeInterruptionRecommendationPolicy';
import { RangeInterruptionScopeLink } from '../domain/RangeInterruptionScopeLink';
import { TargetRecoveryAssessment } from '../domain/TargetRecoveryAssessment';
import { toRangeInterruptionCaseDto } from './RangeInterruptionDto';

/** Coordinates the independent, append-only interruption ledger and recommendation policy. */
export class RangeInterruptionService {
  constructor(
    private readonly repository: IRangeInterruptionRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly qualificationRecoveryExecutions: Pick<IQualificationRecoveryExecutionRepository, 'findByCaseIds'>,
    private readonly qualificationRecoverySettlements: Pick<
      IQualificationRecoverySettlementRepository,
      'findByCaseIds'
    >,
  ) {}

  async listAll(): Promise<RangeInterruptionCaseDto[]> {
    return this.projectCases(this.repository.findAllCases());
  }

  async listByScope(scope: CaseScopePayload): Promise<RangeInterruptionCaseDto[]> {
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
    return toRangeInterruptionCaseDto(interruption, scopes, [], [], [], [], [], []);
  }

  private resolveQualificationTimedTargetContext(
    input: CreateRangeInterruptionCasePayload,
    requested: NonNullable<CreateRangeInterruptionCasePayload['qualificationTimedTargetContext']>,
  ) {
    assertQualificationSeriesRecoveryApplies(input);
    return qualificationTimedTargetContextFor(this.competitionTypes.get(requested.competitionTypeId), requested);
  }

  async linkScope(input: LinkCaseScopePayload): Promise<RangeInterruptionCaseDto> {
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
      assertQualificationRecoveryCarriedOut(
        this.repository.findQualificationTimedTargetRecoveryDecisionsByCaseIds([input.caseId]).get(input.caseId) ?? [],
        this.qualificationExecutions(input.caseId),
        this.qualificationSettlements(input.caseId),
      );
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
    if (latest && this.qualificationExecutions(input.caseId).some(blocksDecisionSupersession)) {
      throw new Error(
        'A Qualification recovery decision cannot be superseded while an execution remains active or requires adjudication',
      );
    }
    if (
      latest &&
      latest.authorizedRecovery.seriesRecovery.treatment === 'KEEP_RECORDED_SERIES' &&
      this.qualificationSettlements(input.caseId).some((settlement) => settlement.decisionId === latest.id)
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

  private qualificationExecutions(caseId: string): QualificationRecoveryExecutionRecord[] {
    return this.qualificationRecoveryExecutions.findByCaseIds([caseId]).get(caseId) ?? [];
  }

  private qualificationSettlements(caseId: string): QualificationRecoverySettlementRecord[] {
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
    const qualificationExecutions = this.qualificationRecoveryExecutions.findByCaseIds(ids);
    const qualificationSettlements = this.qualificationRecoverySettlements.findByCaseIds(ids);
    return interruptions.map((interruption) =>
      toRangeInterruptionCaseDto(
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

function validateUniqueScopes(scopes: readonly CaseScopePayload[]): void {
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
