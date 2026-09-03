import {
  QualificationRecoveryFiringAuthorizationSchema,
  type QualificationRecoveryFiringAuthorizationPayload,
  type QualificationRecoveryShotPayload,
  type QualificationRecoveryStatePayload,
} from '@/shared/mqtt';

export type QualificationRecoveryExecutionPhase = QualificationRecoveryFiringAuthorizationPayload['phase'];
export type QualificationRecoveryExecutionStatus =
  | 'REQUESTED'
  | 'COMMAND_FAILED'
  | 'ACCEPTED'
  | 'RUNNING'
  | 'CANCELLING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ADJUDICATING'
  | 'ADJUDICATION_FAILED'
  | 'ADJUDICATED';

export interface QualificationRecoveryCommandLaneResult {
  readonly laneId: string;
  readonly status: 'done' | 'error' | 'timeout';
  readonly error?: { readonly code: string; readonly message: string };
  readonly warning?: string;
  readonly acknowledgedAt?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface QualificationRecoveryCommandResult {
  readonly commandId: string;
  readonly action:
    | 'start-qualification-recovery'
    | 'cancel-qualification-recovery'
    | 'apply-qualification-recovery'
    | 'settle-qualification-recovery';
  readonly success: boolean;
  readonly lanes: readonly QualificationRecoveryCommandLaneResult[];
}

export interface QualificationRecoveryExecutionStart {
  readonly runId: string;
  readonly caseId: string;
  readonly decisionId: string;
  readonly competitionId: string;
  readonly laneId: string;
  readonly phase: QualificationRecoveryExecutionPhase;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly authorization: QualificationRecoveryFiringAuthorizationPayload;
  readonly officialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: Date;
  readonly requestedAt: Date;
}

export type QualificationRecoveryExecutionEventType =
  | 'START_RESULT'
  | 'START_ERROR'
  | 'LANE_STATE'
  | 'LANE_STATE_REJECTED'
  | 'SHOT'
  | 'SHOT_REJECTED'
  | 'CANCEL_REQUESTED'
  | 'CANCEL_RESULT'
  | 'CANCEL_ERROR'
  | 'ADJUDICATION_REQUESTED'
  | 'ADJUDICATION_RESULT'
  | 'ADJUDICATION_ERROR';

export interface QualificationRecoveryAdjudicationRequest {
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: string;
}

export type QualificationRecoveryExecutionEventPayload =
  | { readonly command: QualificationRecoveryCommandResult }
  | { readonly error: string }
  | { readonly state: QualificationRecoveryStatePayload }
  | { readonly state: QualificationRecoveryStatePayload; readonly reason: string }
  | { readonly shot: QualificationRecoveryShotPayload }
  | { readonly shot: QualificationRecoveryShotPayload; readonly reason: string }
  | { readonly reason: string }
  | { readonly adjudication: QualificationRecoveryAdjudicationRequest };

export interface QualificationRecoveryExecutionEvent {
  readonly id: string;
  readonly eventKey: string;
  readonly runId: string;
  readonly type: QualificationRecoveryExecutionEventType;
  readonly payload: QualificationRecoveryExecutionEventPayload;
  readonly occurredAt: Date;
  readonly recordedAt: Date;
}

export interface QualificationRecoveryExecutionRecord extends QualificationRecoveryExecutionStart {
  readonly status: QualificationRecoveryExecutionStatus;
  readonly latestLaneState: QualificationRecoveryStatePayload | null;
  readonly shots: readonly QualificationRecoveryShotPayload[];
  readonly events: readonly QualificationRecoveryExecutionEvent[];
}

export function createQualificationRecoveryExecutionStart(
  input: QualificationRecoveryExecutionStart,
): QualificationRecoveryExecutionStart {
  const authorization = QualificationRecoveryFiringAuthorizationSchema.parse(input.authorization);
  if (authorization.phase !== input.phase) throw new Error('Recovery execution phase must match its authorization');
  requiredText(input.runId, 'runId');
  requiredText(input.caseId, 'caseId');
  requiredText(input.decisionId, 'decisionId');
  requiredText(input.competitionId, 'competitionId');
  requiredText(input.laneId, 'laneId');
  nonNegativeInteger(input.stageIndex, 'stageIndex');
  nonNegativeInteger(input.seriesIndex, 'seriesIndex');
  requiredText(input.expectedMatchProgramId, 'expectedMatchProgramId');
  positiveInteger(input.expectedSeriesShotLimit, 'expectedSeriesShotLimit');
  nonNegativeInteger(input.expectedRecordedShots, 'expectedRecordedShots');
  if (input.expectedRecordedShots > input.expectedSeriesShotLimit) {
    throw new Error('expectedRecordedShots must not exceed expectedSeriesShotLimit');
  }
  requiredText(input.officialName, 'officialName');
  requiredText(input.decisionRuleReference, 'decisionRuleReference');
  const decidedAt = validDate(input.decidedAt, 'decidedAt');
  const requestedAt = validDate(input.requestedAt, 'requestedAt');
  if (requestedAt.getTime() < decidedAt.getTime()) {
    throw new Error('A recovery execution cannot be requested before its official decision');
  }
  return deepFreeze({ ...input, authorization, decidedAt, requestedAt });
}

export function createQualificationRecoveryExecutionEvent(
  input: QualificationRecoveryExecutionEvent,
): QualificationRecoveryExecutionEvent {
  requiredText(input.id, 'id');
  requiredText(input.eventKey, 'eventKey');
  requiredText(input.runId, 'runId');
  const occurredAt = validDate(input.occurredAt, 'occurredAt');
  const recordedAt = validDate(input.recordedAt, 'recordedAt');
  return deepFreeze({ ...input, payload: clone(input.payload), occurredAt, recordedAt });
}

export function createQualificationRecoveryExecutionRecord(
  start: QualificationRecoveryExecutionStart,
  sourceEvents: readonly QualificationRecoveryExecutionEvent[],
): QualificationRecoveryExecutionRecord {
  const validatedStart = createQualificationRecoveryExecutionStart(start);
  const events = sourceEvents.map(createQualificationRecoveryExecutionEvent);
  if (events.some((event) => event.runId !== start.runId)) {
    throw new Error(`Qualification recovery execution ${start.runId} contains an event for another run`);
  }
  const latestLaneState = events
    .filter((event) => event.type === 'LANE_STATE')
    .map((event) => event.payload as { state: QualificationRecoveryStatePayload })
    .sort((left, right) => Date.parse(left.state.publishedAt) - Date.parse(right.state.publishedAt))
    .at(-1);
  const shots = events
    .filter((event) => event.type === 'SHOT')
    .map((event) => (event.payload as { shot: QualificationRecoveryShotPayload }).shot)
    .sort(
      (left, right) => Date.parse(left.firedAt) - Date.parse(right.firedAt) || left.shotId.localeCompare(right.shotId),
    );
  const latestStartOutcome = [...events]
    .reverse()
    .find((event) => event.type === 'START_RESULT' || event.type === 'START_ERROR');
  const latestCancellationOutcome = [...events]
    .reverse()
    .find(
      (event) => event.type === 'CANCEL_REQUESTED' || event.type === 'CANCEL_RESULT' || event.type === 'CANCEL_ERROR',
    );
  const cancellationPending =
    latestCancellationOutcome?.type === 'CANCEL_REQUESTED' ||
    (latestCancellationOutcome?.type === 'CANCEL_RESULT' &&
      commandAccepted(
        (latestCancellationOutcome.payload as { command: QualificationRecoveryCommandResult }).command,
        validatedStart.laneId,
        'cancel-qualification-recovery',
      ));
  const latestAdjudicationOutcome = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === 'ADJUDICATION_REQUESTED' ||
        event.type === 'ADJUDICATION_RESULT' ||
        event.type === 'ADJUDICATION_ERROR',
    );
  const adjudicationAccepted = events.some(
    (event) =>
      event.type === 'ADJUDICATION_RESULT' &&
      commandAccepted(
        (event.payload as { command: QualificationRecoveryCommandResult }).command,
        validatedStart.laneId,
        'apply-qualification-recovery',
      ),
  );
  const status = executionStatus(
    validatedStart.laneId,
    latestLaneState?.state,
    latestStartOutcome,
    cancellationPending,
    adjudicationAccepted,
    latestAdjudicationOutcome,
  );
  return deepFreeze({
    ...validatedStart,
    status,
    latestLaneState: latestLaneState?.state ?? null,
    shots,
    events,
  });
}

function executionStatus(
  laneId: string,
  state: QualificationRecoveryStatePayload | undefined,
  startOutcome: QualificationRecoveryExecutionEvent | undefined,
  cancellationRequested: boolean,
  adjudicationAccepted: boolean,
  adjudicationOutcome: QualificationRecoveryExecutionEvent | undefined,
): QualificationRecoveryExecutionStatus {
  if (adjudicationAccepted) return 'ADJUDICATED';
  if (adjudicationOutcome?.type === 'ADJUDICATION_REQUESTED') return 'ADJUDICATING';
  if (adjudicationOutcome?.type === 'ADJUDICATION_ERROR') return 'ADJUDICATION_FAILED';
  if (adjudicationOutcome?.type === 'ADJUDICATION_RESULT') {
    return commandAccepted(
      (adjudicationOutcome.payload as { command: QualificationRecoveryCommandResult }).command,
      laneId,
      'apply-qualification-recovery',
    )
      ? 'ADJUDICATED'
      : 'ADJUDICATION_FAILED';
  }
  if (state?.status === 'RUNNING') return cancellationRequested ? 'CANCELLING' : 'RUNNING';
  if (state?.status === 'COMPLETED') return 'COMPLETED';
  if (state?.status === 'CANCELLED') return 'CANCELLED';
  if (cancellationRequested) return 'CANCELLING';
  if (!startOutcome) return 'REQUESTED';
  if (startOutcome.type === 'START_ERROR') return 'COMMAND_FAILED';
  return commandAccepted(
    (startOutcome.payload as { command: QualificationRecoveryCommandResult }).command,
    laneId,
    'start-qualification-recovery',
  )
    ? 'ACCEPTED'
    : 'COMMAND_FAILED';
}

function commandAccepted(
  command: QualificationRecoveryCommandResult,
  laneId: string,
  action: QualificationRecoveryCommandResult['action'],
): boolean {
  return (
    command.action === action &&
    command.success &&
    command.lanes.some((lane) => lane.laneId === laneId && lane.status === 'done')
  );
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

function requiredText(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function nonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
