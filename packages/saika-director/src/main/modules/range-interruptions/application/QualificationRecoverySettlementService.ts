import type { IQualificationRecoveryExecutionRepository } from '../domain/IQualificationRecoveryExecutionRepository';
import type { IQualificationRecoverySettlementRepository } from '../domain/IQualificationRecoverySettlementRepository';
import type { IQualificationRecoverySettlementTransport } from '../domain/IQualificationRecoverySettlementTransport';
import type { IRangeInterruptionRepository } from '../domain/IRangeInterruptionRepository';
import {
  createQualificationRecoverySettlementEvent,
  createQualificationRecoverySettlementRequest,
  type QualificationRecoverySettlementEvent,
  type QualificationRecoverySettlementRecord,
  type QualificationRecoverySettlementRequest,
} from '../domain/QualificationRecoverySettlement';
import { requireQualificationSighting } from '../domain/QualificationSightingReadiness';
import { getRangeInterruptionState } from '../domain/RangeInterruptionEntry';

export interface ApplyQualificationRecoverySettlementInput {
  readonly caseId: string;
  readonly decisionId: string;
  readonly competitionId: string;
  readonly appliedBy: string;
  readonly statement: string;
}

/** Applies no-fire decisions through a transport isolated from recovery firing and score adjudication. */
export class QualificationRecoverySettlementService {
  constructor(
    private readonly interruptionRepository: IRangeInterruptionRepository,
    private readonly settlementRepository: IQualificationRecoverySettlementRepository,
    private readonly executionRepository: Pick<IQualificationRecoveryExecutionRepository, 'findByCaseIds'>,
    private readonly transport: IQualificationRecoverySettlementTransport,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async apply(input: ApplyQualificationRecoverySettlementInput): Promise<QualificationRecoverySettlementRecord> {
    const interruption = this.interruptionRepository.findCaseById(input.caseId);
    if (!interruption) throw new Error(`Range interruption ${input.caseId} not found`);
    if (!interruption.laneId) throw new Error('Qualification recovery settlement requires one affected Lane');
    const context = interruption.qualificationTimedTargetContext;
    if (!context) throw new Error('This interruption has no Qualification timed-target policy snapshot');
    const scopes = this.interruptionRepository.findScopesByCaseIds([input.caseId]).get(input.caseId) ?? [];
    if (!scopes.some((scope) => scope.scopeType === 'COMPETITION' && scope.scopeId === input.competitionId)) {
      throw new Error(`Competition ${input.competitionId} is not linked to range interruption ${input.caseId}`);
    }
    const state = getRangeInterruptionState(
      this.interruptionRepository.findEntriesByCaseIds([input.caseId]).get(input.caseId) ?? [],
    );
    if (state.status !== 'ENDED') {
      throw new Error('Qualification recovery can only settle while the ended interruption remains open');
    }
    const decisions =
      this.interruptionRepository
        .findQualificationTimedTargetRecoveryDecisionsByCaseIds([input.caseId])
        .get(input.caseId) ?? [];
    const decision = decisions.at(-1);
    if (!decision) throw new Error('Record an official Qualification recovery decision before settlement');
    if (decision.id !== input.decisionId) {
      throw new Error(`Only the latest Qualification recovery decision ${decision.id} can be settled`);
    }
    if (decision.authorizedRecovery.seriesRecovery.treatment !== 'KEEP_RECORDED_SERIES') {
      throw new Error('Only KEEP_RECORDED_SERIES can be settled without recovery firing');
    }
    if (context.recordedShots !== context.seriesShotLimit) {
      throw new Error('KEEP_RECORDED_SERIES requires every series shot to be recorded');
    }
    requireQualificationSighting(
      decision,
      this.executionRepository.findByCaseIds([input.caseId]).get(input.caseId) ?? [],
      this.now(),
    );
    const unsafeExecution = (this.executionRepository.findByCaseIds([input.caseId]).get(input.caseId) ?? []).find(
      (execution) =>
        execution.decisionId === decision.id &&
        execution.status !== 'CANCELLED' &&
        !(execution.phase === 'EXTRA_SIGHTING' && execution.status === 'COMPLETED'),
    );
    if (unsafeExecution) {
      throw new Error(`Qualification recovery run ${unsafeExecution.runId} must reach a safe terminal state first`);
    }

    const appliedBy = requiredText(input.appliedBy, 'Applying official');
    const statement = requiredText(input.statement, 'Settlement statement');
    let current = this.settlementRepository.findByDecisionId(decision.id);
    if (current) {
      if (current.caseId !== input.caseId || current.competitionId !== input.competitionId) {
        throw new Error(`Qualification recovery decision ${decision.id} is bound to another interruption`);
      }
      if (current.appliedBy !== appliedBy || current.statement !== statement) {
        throw new Error(`Qualification recovery decision ${decision.id} is bound to a different settlement request`);
      }
      if (current.status === 'APPLIED') return current;
    } else {
      const requestedAt = this.now();
      current = this.requireSettlement(
        this.settlementRepository.appendRequest(
          createQualificationRecoverySettlementRequest({
            settlementId: crypto.randomUUID(),
            caseId: interruption.id,
            decisionId: decision.id,
            competitionId: input.competitionId,
            laneId: interruption.laneId,
            treatment: 'KEEP_RECORDED_SERIES',
            stageIndex: context.stageIndex,
            seriesIndex: context.seriesIndex,
            expectedMatchProgramId: context.timedTargetProgramId,
            expectedSeriesShotLimit: context.seriesShotLimit,
            expectedRecordedShots: context.recordedShots,
            decisionOfficialName: decision.officialName,
            decisionRuleReference: decision.ruleReference,
            decidedAt: decision.decidedAt,
            appliedBy,
            statement,
            appliedAt: requestedAt,
            requestedAt,
          }),
        ).decisionId,
      );
    }

    try {
      const command = await this.transport.apply(toTransportInput(current));
      this.appendEvent(current.settlementId, 'SETTLEMENT_RESULT', `settlement-result:${command.commandId}`, {
        command,
      });
      return this.requireSettlement(current.decisionId);
    } catch (error) {
      this.appendEvent(current.settlementId, 'SETTLEMENT_ERROR', `settlement-error:${crypto.randomUUID()}`, {
        error: errorMessage(error),
      });
      throw error;
    }
  }

  listByCase(caseId: string): QualificationRecoverySettlementRecord[] {
    return this.settlementRepository.findByCaseIds([caseId]).get(caseId) ?? [];
  }

  private appendEvent(
    settlementId: string,
    type: QualificationRecoverySettlementEvent['type'],
    eventKey: string,
    payload: QualificationRecoverySettlementEvent['payload'],
  ): void {
    const occurredAt = this.now();
    this.settlementRepository.appendEvent(
      createQualificationRecoverySettlementEvent({
        id: crypto.randomUUID(),
        eventKey,
        settlementId,
        type,
        payload,
        occurredAt,
        recordedAt: this.now(),
      }),
    );
  }

  private requireSettlement(decisionId: string): QualificationRecoverySettlementRecord {
    const value = this.settlementRepository.findByDecisionId(decisionId);
    if (!value) throw new Error(`Qualification recovery settlement for decision ${decisionId} not found`);
    return value;
  }
}

function toTransportInput(request: QualificationRecoverySettlementRequest) {
  return {
    competitionId: request.competitionId,
    laneId: request.laneId,
    decisionId: request.decisionId,
    interruptionId: request.caseId,
    stageIndex: request.stageIndex,
    seriesIndex: request.seriesIndex,
    expectedMatchProgramId: request.expectedMatchProgramId,
    expectedSeriesShotLimit: request.expectedSeriesShotLimit,
    expectedRecordedShots: request.expectedRecordedShots,
    treatment: request.treatment,
    decisionOfficialName: request.decisionOfficialName,
    decisionRuleReference: request.decisionRuleReference,
    decidedAt: request.decidedAt.toISOString(),
    appliedBy: request.appliedBy,
    statement: request.statement,
    appliedAt: request.appliedAt.toISOString(),
  };
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
