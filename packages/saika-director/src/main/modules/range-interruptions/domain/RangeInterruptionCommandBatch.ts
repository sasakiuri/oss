export const RANGE_COMMAND_OPERATIONS = ['PAUSE', 'RESUME', 'MATCH_RESUME'] as const;
export type RangeCommandOperation = (typeof RANGE_COMMAND_OPERATIONS)[number];

export interface RangeCommandLaneOutcome {
  commandId: string;
  action: 'pause-timer' | 'resume-timer' | 'resume-match';
  laneId: string;
  status: 'done' | 'error' | 'timeout';
  errorCode: string | null;
  errorMessage: string | null;
  acknowledgedAt: string | null;
}

export interface RangeInterruptionCommandBatchProps {
  id?: string;
  caseId: string;
  competitionId: string;
  operation: RangeCommandOperation;
  targetLaneIds: readonly string[];
  outcomes: readonly RangeCommandLaneOutcome[];
  officialName: string;
  occurredAt: Date;
  recordedAt?: Date;
}

/** One fan-out attempt, including every per-Lane acknowledgement and failure. */
export class RangeInterruptionCommandBatch {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly competitionId: string,
    readonly operation: RangeCommandOperation,
    readonly targetLaneIds: readonly string[],
    readonly outcomes: readonly RangeCommandLaneOutcome[],
    readonly success: boolean,
    readonly officialName: string,
    readonly occurredAt: Date,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this.targetLaneIds);
    Object.freeze(this.outcomes);
    Object.freeze(this);
  }

  static create(props: RangeInterruptionCommandBatchProps): RangeInterruptionCommandBatch {
    if (!RANGE_COMMAND_OPERATIONS.includes(props.operation)) throw new Error('operation is invalid');
    if (props.outcomes.length === 0) throw new Error('A range command batch must retain at least one Lane outcome');
    const targetLaneIds = props.targetLaneIds.map((laneId) => requiredText(laneId, 'targetLaneId'));
    if (targetLaneIds.length === 0 || new Set(targetLaneIds).size !== targetLaneIds.length) {
      throw new Error('targetLaneIds must be a non-empty unique list');
    }
    const laneIds = props.outcomes.map((outcome) => requiredText(outcome.laneId, 'laneId'));
    if (new Set(laneIds).size !== laneIds.length) throw new Error('A range command batch cannot repeat a Lane');
    if (laneIds.some((laneId) => !targetLaneIds.includes(laneId))) {
      throw new Error('Every command outcome must belong to the intended range Lane set');
    }
    const expectedAction = actionFor(props.operation);
    const outcomes = props.outcomes.map((outcome) => {
      if (outcome.action !== expectedAction) throw new Error(`${props.operation} requires ${expectedAction} outcomes`);
      if (!['done', 'error', 'timeout'].includes(outcome.status)) throw new Error('outcome status is invalid');
      return Object.freeze({
        ...outcome,
        commandId: requiredText(outcome.commandId, 'commandId'),
        laneId: requiredText(outcome.laneId, 'laneId'),
      });
    });
    const occurredAt = validDate(props.occurredAt, 'occurredAt');
    const recordedAt = validDate(props.recordedAt ?? new Date(), 'recordedAt');
    return new RangeInterruptionCommandBatch(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      requiredText(props.competitionId, 'competitionId'),
      props.operation,
      targetLaneIds,
      outcomes,
      outcomes.every((outcome) => outcome.status === 'done'),
      requiredText(props.officialName, 'officialName'),
      occurredAt,
      recordedAt,
    );
  }

  static reconstruct(
    props: RangeInterruptionCommandBatchProps & { id: string; recordedAt: Date },
  ): RangeInterruptionCommandBatch {
    return RangeInterruptionCommandBatch.create(props);
  }
}

function actionFor(operation: RangeCommandOperation): RangeCommandLaneOutcome['action'] {
  if (operation === 'PAUSE') return 'pause-timer';
  if (operation === 'RESUME') return 'resume-timer';
  return 'resume-match';
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
