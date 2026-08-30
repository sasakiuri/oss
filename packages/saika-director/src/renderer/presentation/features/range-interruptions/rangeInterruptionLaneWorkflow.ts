import type {
  AppendRangeInterruptionEntryPayload,
  MqttCommandExecutionResultDto,
  RangeInterruptionCaseDto,
} from '@/shared/ipc/contracts';

interface ApiError {
  message: string;
}

type ApiResult<T> = { success: true; data: T } | { success: false; error: ApiError };

export interface RangeInterruptionLaneWorkflowPorts {
  lane: {
    pauseLaneTimer(input: {
      competitionId: string;
      laneId: string;
      interruptionId: string;
    }): Promise<ApiResult<MqttCommandExecutionResultDto>>;
    resumeLaneTimer(input: {
      competitionId: string;
      laneId: string;
      interruptionId: string;
      authorizedRemainingSeconds: number;
      unlimitedSightingShots: boolean;
    }): Promise<ApiResult<MqttCommandExecutionResultDto>>;
    resumeLaneMatch(input: {
      competitionId: string;
      laneId: string;
      interruptionId: string;
    }): Promise<ApiResult<MqttCommandExecutionResultDto>>;
  };
  ledger: {
    appendEntry(input: AppendRangeInterruptionEntryPayload): Promise<ApiResult<RangeInterruptionCaseDto>>;
  };
}

interface LaneActionContext {
  competitionId: string;
  laneId: string;
  interruptionId: string;
  officialName: string;
}

/**
 * Renderer-level orchestration only: Lane applies an operation, then the independent
 * append-only ledger records the acknowledged command. Neither side owns ISSF policy.
 */
export async function applyLanePause(
  context: LaneActionContext,
  ports: RangeInterruptionLaneWorkflowPorts,
): Promise<RangeInterruptionCaseDto> {
  const result = requireCommandSuccess(
    await ports.lane.pauseLaneTimer({
      competitionId: context.competitionId,
      laneId: context.laneId,
      interruptionId: context.interruptionId,
    }),
  );
  const laneResult = requireLaneResult(result, context.laneId);
  const remainingSeconds = numericData(laneResult.data, 'remainingSeconds');
  const totalSeconds = numericData(laneResult.data, 'totalSeconds');
  const capturedAt = dateData(laneResult.data, 'capturedAt') ?? new Date().toISOString();

  return requireLedgerSuccess(
    await ports.ledger.appendEntry({
      caseId: context.interruptionId,
      type: 'PAUSE_APPLIED',
      occurredAt: capturedAt,
      statement: `Lane STOP acknowledged; timer captured at ${formatDuration(remainingSeconds)} remaining of ${formatDuration(totalSeconds)}.`,
      officialName: context.officialName,
      ruleReference: 'ISSF 6.10.9 / 6.11.3',
      commandId: result.commandId,
    }),
  );
}

export async function applyLaneResume(
  context: LaneActionContext & {
    authorizedRemainingSeconds: number;
    unlimitedSightingShots: boolean;
  },
  ports: RangeInterruptionLaneWorkflowPorts,
): Promise<RangeInterruptionCaseDto> {
  const result = requireCommandSuccess(
    await ports.lane.resumeLaneTimer({
      competitionId: context.competitionId,
      laneId: context.laneId,
      interruptionId: context.interruptionId,
      authorizedRemainingSeconds: context.authorizedRemainingSeconds,
      unlimitedSightingShots: context.unlimitedSightingShots,
    }),
  );

  return requireLedgerSuccess(
    await ports.ledger.appendEntry({
      caseId: context.interruptionId,
      type: 'RESUME_APPLIED',
      occurredAt: acknowledgedAt(result, context.laneId),
      statement: context.unlimitedSightingShots
        ? `Authorized timer resumed at ${formatDuration(context.authorizedRemainingSeconds)} in SIGHTING mode.`
        : `Authorized timer resumed at ${formatDuration(context.authorizedRemainingSeconds)} in MATCH mode.`,
      officialName: context.officialName,
      ruleReference: 'ISSF 6.10.9 / 6.11.3',
      commandId: result.commandId,
    }),
  );
}

export async function applyLaneMatchResume(
  context: LaneActionContext,
  ports: RangeInterruptionLaneWorkflowPorts,
): Promise<RangeInterruptionCaseDto> {
  const result = requireCommandSuccess(
    await ports.lane.resumeLaneMatch({
      competitionId: context.competitionId,
      laneId: context.laneId,
      interruptionId: context.interruptionId,
    }),
  );

  return requireLedgerSuccess(
    await ports.ledger.appendEntry({
      caseId: context.interruptionId,
      type: 'MATCH_RESUMED',
      occurredAt: acknowledgedAt(result, context.laneId),
      statement: 'MATCH fire resumed after the authorized unlimited sighting shots.',
      officialName: context.officialName,
      ruleReference: 'ISSF 6.10.9 / 6.11.3.2',
      commandId: result.commandId,
    }),
  );
}

function requireCommandSuccess(response: ApiResult<MqttCommandExecutionResultDto>): MqttCommandExecutionResultDto {
  if (!response.success) throw new Error(response.error.message);
  if (!response.data.success) {
    const failures = response.data.lanes
      .filter((lane) => lane.status !== 'done')
      .map((lane) => lane.error?.message ?? `${lane.laneId}: ${lane.status}`)
      .join('; ');
    throw new Error(failures || `Lane command ${response.data.action} was not acknowledged`);
  }
  return response.data;
}

function requireLaneResult(result: MqttCommandExecutionResultDto, laneId: string) {
  const lane = result.lanes.find((candidate) => candidate.laneId === laneId && candidate.status === 'done');
  if (!lane) throw new Error(`Lane ${laneId} did not return a completed acknowledgement`);
  return lane;
}

function requireLedgerSuccess(response: ApiResult<RangeInterruptionCaseDto>): RangeInterruptionCaseDto {
  if (!response.success) {
    throw new Error(`The Lane command succeeded, but its audit entry could not be recorded: ${response.error.message}`);
  }
  return response.data;
}

function acknowledgedAt(result: MqttCommandExecutionResultDto, laneId: string): string {
  return requireLaneResult(result, laneId).acknowledgedAt ?? new Date().toISOString();
}

function numericData(data: Record<string, unknown> | undefined, key: string): number {
  const value = data?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Lane acknowledgement did not include a valid ${key}`);
  }
  return Math.round(value);
}

function dateData(data: Record<string, unknown> | undefined, key: string): string | null {
  const value = data?.[key];
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
