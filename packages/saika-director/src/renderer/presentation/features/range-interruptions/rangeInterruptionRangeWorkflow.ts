import type {
  MqttCommandBatchResultDto,
  RangeInterruptionCaseDto,
  RecordRangeCommandBatchPayload,
} from '@/shared/ipc/contracts';

interface ApiError {
  message: string;
}
type ApiResult<T> = { success: true; data: T } | { success: false; error: ApiError };

export interface RangeInterruptionRangeWorkflowPorts {
  lane: {
    pauseRangeTimers(input: {
      competitionId: string;
      laneIds: string[];
      interruptionId: string;
    }): Promise<ApiResult<MqttCommandBatchResultDto>>;
    resumeRangeTimers(input: {
      competitionId: string;
      laneIds: string[];
      interruptionId: string;
      authorizedRemainingSeconds: number;
      unlimitedSightingShots: boolean;
    }): Promise<ApiResult<MqttCommandBatchResultDto>>;
    resumeRangeMatch(input: {
      competitionId: string;
      laneIds: string[];
      interruptionId: string;
    }): Promise<ApiResult<MqttCommandBatchResultDto>>;
  };
  ledger: {
    recordCommandBatch(input: RecordRangeCommandBatchPayload): Promise<ApiResult<RangeInterruptionCaseDto>>;
  };
}

interface RangeActionContext {
  competitionId: string;
  targetLaneIds: string[];
  commandLaneIds: string[];
  interruptionId: string;
  officialName: string;
}

export async function applyRangePause(
  context: RangeActionContext,
  ports: RangeInterruptionRangeWorkflowPorts,
): Promise<RangeInterruptionCaseDto> {
  const result = requireApiSuccess(
    await ports.lane.pauseRangeTimers({
      competitionId: context.competitionId,
      laneIds: context.commandLaneIds,
      interruptionId: context.interruptionId,
    }),
  );
  return recordAndRequireCompletion(context, 'PAUSE', result, ports);
}

export async function applyRangeResume(
  context: RangeActionContext & { authorizedRemainingSeconds: number; unlimitedSightingShots: boolean },
  ports: RangeInterruptionRangeWorkflowPorts,
): Promise<RangeInterruptionCaseDto> {
  const result = requireApiSuccess(
    await ports.lane.resumeRangeTimers({
      competitionId: context.competitionId,
      laneIds: context.commandLaneIds,
      interruptionId: context.interruptionId,
      authorizedRemainingSeconds: context.authorizedRemainingSeconds,
      unlimitedSightingShots: context.unlimitedSightingShots,
    }),
  );
  return recordAndRequireCompletion(context, 'RESUME', result, ports);
}

export async function applyRangeMatchResume(
  context: RangeActionContext,
  ports: RangeInterruptionRangeWorkflowPorts,
): Promise<RangeInterruptionCaseDto> {
  const result = requireApiSuccess(
    await ports.lane.resumeRangeMatch({
      competitionId: context.competitionId,
      laneIds: context.commandLaneIds,
      interruptionId: context.interruptionId,
    }),
  );
  return recordAndRequireCompletion(context, 'MATCH_RESUME', result, ports);
}

async function recordAndRequireCompletion(
  context: RangeActionContext,
  operation: RecordRangeCommandBatchPayload['operation'],
  result: MqttCommandBatchResultDto,
  ports: RangeInterruptionRangeWorkflowPorts,
): Promise<RangeInterruptionCaseDto> {
  const recorded = requireApiSuccess(
    await ports.ledger.recordCommandBatch({
      caseId: context.interruptionId,
      competitionId: context.competitionId,
      operation,
      targetLaneIds: context.targetLaneIds,
      officialName: context.officialName,
      occurredAt: new Date().toISOString(),
      commands: result.commands.map((command) => ({
        commandId: command.commandId,
        action: command.action as 'pause-timer' | 'resume-timer' | 'resume-match',
        lanes: command.lanes.map((lane) => ({
          laneId: lane.laneId,
          status: lane.status,
          ...(lane.error ? { error: lane.error } : {}),
          ...(lane.acknowledgedAt ? { acknowledgedAt: lane.acknowledgedAt } : {}),
        })),
      })),
    }),
  );
  const failed = result.commands.flatMap((command) => command.lanes).filter((lane) => lane.status !== 'done');
  if (failed.length > 0) {
    throw new Error(
      `The range command was recorded, but ${failed.length} Lane(s) still require retry: ${failed.map((lane) => lane.laneId).join(', ')}`,
    );
  }
  return recorded;
}

function requireApiSuccess<T>(response: ApiResult<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}
