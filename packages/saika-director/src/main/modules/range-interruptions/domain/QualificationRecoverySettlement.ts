import type { QualificationRecoveryCommandResult } from './QualificationRecoveryExecution';

export type QualificationRecoverySettlementStatus = 'REQUESTED' | 'COMMAND_FAILED' | 'APPLIED';

export interface QualificationRecoverySettlementRequest {
  readonly settlementId: string;
  readonly caseId: string;
  readonly decisionId: string;
  readonly competitionId: string;
  readonly laneId: string;
  readonly treatment: 'KEEP_RECORDED_SERIES';
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly decisionOfficialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: Date;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: Date;
  readonly requestedAt: Date;
}

export type QualificationRecoverySettlementEventType = 'SETTLEMENT_RESULT' | 'SETTLEMENT_ERROR';

export type QualificationRecoverySettlementEventPayload =
  { readonly command: QualificationRecoveryCommandResult } | { readonly error: string };

export interface QualificationRecoverySettlementEvent {
  readonly id: string;
  readonly eventKey: string;
  readonly settlementId: string;
  readonly type: QualificationRecoverySettlementEventType;
  readonly payload: QualificationRecoverySettlementEventPayload;
  readonly occurredAt: Date;
  readonly recordedAt: Date;
}

export interface QualificationRecoverySettlementRecord extends QualificationRecoverySettlementRequest {
  readonly status: QualificationRecoverySettlementStatus;
  readonly events: readonly QualificationRecoverySettlementEvent[];
}

export function createQualificationRecoverySettlementRequest(
  input: QualificationRecoverySettlementRequest,
): QualificationRecoverySettlementRequest {
  if (input.treatment !== 'KEEP_RECORDED_SERIES') {
    throw new Error('A no-fire settlement only supports KEEP_RECORDED_SERIES');
  }
  const expectedSeriesShotLimit = positiveInteger(input.expectedSeriesShotLimit, 'expectedSeriesShotLimit');
  const expectedRecordedShots = nonNegativeInteger(input.expectedRecordedShots, 'expectedRecordedShots');
  if (expectedRecordedShots !== expectedSeriesShotLimit) {
    throw new Error('KEEP_RECORDED_SERIES requires a full recorded series');
  }
  const decidedAt = validDate(input.decidedAt, 'decidedAt');
  const appliedAt = validDate(input.appliedAt, 'appliedAt');
  const requestedAt = validDate(input.requestedAt, 'requestedAt');
  if (appliedAt.getTime() < decidedAt.getTime()) {
    throw new Error('Qualification recovery cannot be settled before its official decision');
  }
  if (requestedAt.getTime() < decidedAt.getTime()) {
    throw new Error('A settlement cannot be requested before its official decision');
  }
  return Object.freeze({
    settlementId: requiredText(input.settlementId, 'settlementId'),
    caseId: requiredText(input.caseId, 'caseId'),
    decisionId: requiredText(input.decisionId, 'decisionId'),
    competitionId: requiredText(input.competitionId, 'competitionId'),
    laneId: requiredText(input.laneId, 'laneId'),
    treatment: input.treatment,
    stageIndex: nonNegativeInteger(input.stageIndex, 'stageIndex'),
    seriesIndex: nonNegativeInteger(input.seriesIndex, 'seriesIndex'),
    expectedMatchProgramId: requiredText(input.expectedMatchProgramId, 'expectedMatchProgramId'),
    expectedSeriesShotLimit,
    expectedRecordedShots,
    decisionOfficialName: requiredText(input.decisionOfficialName, 'decisionOfficialName'),
    decisionRuleReference: requiredText(input.decisionRuleReference, 'decisionRuleReference'),
    decidedAt,
    appliedBy: requiredText(input.appliedBy, 'appliedBy'),
    statement: requiredText(input.statement, 'statement'),
    appliedAt,
    requestedAt,
  });
}

export function createQualificationRecoverySettlementEvent(
  input: QualificationRecoverySettlementEvent,
): QualificationRecoverySettlementEvent {
  return deepFreeze({
    id: requiredText(input.id, 'id'),
    eventKey: requiredText(input.eventKey, 'eventKey'),
    settlementId: requiredText(input.settlementId, 'settlementId'),
    type: input.type,
    payload: clone(input.payload),
    occurredAt: validDate(input.occurredAt, 'occurredAt'),
    recordedAt: validDate(input.recordedAt, 'recordedAt'),
  });
}

export function createQualificationRecoverySettlementRecord(
  request: QualificationRecoverySettlementRequest,
  sourceEvents: readonly QualificationRecoverySettlementEvent[],
): QualificationRecoverySettlementRecord {
  const validated = createQualificationRecoverySettlementRequest(request);
  const events = sourceEvents.map(createQualificationRecoverySettlementEvent);
  if (events.some((event) => event.settlementId !== validated.settlementId)) {
    throw new Error(`Qualification recovery settlement ${validated.settlementId} contains an unrelated event`);
  }
  const applied = events.some(
    (event) =>
      event.type === 'SETTLEMENT_RESULT' &&
      commandAccepted((event.payload as { command: QualificationRecoveryCommandResult }).command, validated.laneId),
  );
  const latest = events.at(-1);
  const status: QualificationRecoverySettlementStatus = applied
    ? 'APPLIED'
    : latest?.type === 'SETTLEMENT_RESULT' || latest?.type === 'SETTLEMENT_ERROR'
      ? 'COMMAND_FAILED'
      : 'REQUESTED';
  return deepFreeze({ ...validated, status, events });
}

function commandAccepted(command: QualificationRecoveryCommandResult, laneId: string): boolean {
  return (
    command.action === 'settle-qualification-recovery' &&
    command.success &&
    command.lanes.some((lane) => lane.laneId === laneId && lane.status === 'done')
  );
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
