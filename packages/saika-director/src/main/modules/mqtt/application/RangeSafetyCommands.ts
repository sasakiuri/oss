// SPDX-License-Identifier: MIT
import { ActivateSafetyStopCommandSchema, ClearSafetyStopCommandSchema, mqttTopics } from '@/shared/mqtt';

import { createLaneCommandFailure } from './createLaneCommandFailure';
import type { DirectorCommandPort } from './DirectorCommandPort';
import type { CommandBatchResult, CommandExecutionResult, DirectorCommandAction } from './DirectorMqttTypes';

export interface RangeSafetyContext {
  hasLane(laneId: string): boolean;
  onResult(result: CommandExecutionResult): void;
  log(message: string): void;
}

/** Competition-independent safety latches; the coordinator serializes STOP and clear operations. */
export class RangeSafetyCommands {
  constructor(
    private readonly commands: DirectorCommandPort,
    private readonly context: RangeSafetyContext,
  ) {}

  async activateSafetyStop(
    laneIds: string[],
    safetyStopId: string,
    reason: string,
    officialName: string,
  ): Promise<CommandBatchResult> {
    const targets = this.requireKnownLanes(laneIds);
    const commands = await Promise.all(
      targets.map((laneId) =>
        this.activateLaneSafetyStopNow(laneId, safetyStopId, reason, officialName).catch((error) =>
          this.safetyCommandFailure('activate-safety-stop', laneId, error),
        ),
      ),
    );
    return { success: commands.every((command) => command.success), commands };
  }

  async clearSafetyStop(
    laneIds: string[],
    safetyStopId: string,
    clearanceReason: string,
    officialName: string,
  ): Promise<CommandBatchResult> {
    const targets = this.requireKnownLanes(laneIds);
    const commands = await Promise.all(
      targets.map((laneId) =>
        this.clearLaneSafetyStopNow(laneId, safetyStopId, clearanceReason, officialName).catch((error) =>
          this.safetyCommandFailure('clear-safety-stop', laneId, error),
        ),
      ),
    );
    return { success: commands.every((command) => command.success), commands };
  }

  private activateLaneSafetyStopNow(
    laneId: string,
    safetyStopId: string,
    reason: string,
    officialName: string,
  ): Promise<CommandExecutionResult> {
    const command = ActivateSafetyStopCommandSchema.parse(
      this.commands.commandBase({ safetyStopId, reason, issuedBy: officialName }),
    );
    return this.commands.publishCommand({
      action: 'activate-safety-stop',
      topic: mqttTopics.laneCommand(laneId, 'activate-safety-stop'),
      acknowledgementTopic: () => mqttTopics.laneCommandAcknowledgement(laneId, 'activate-safety-stop'),
      payload: command,
      expectedLaneIds: [laneId],
      onPublished: () => this.context.log(`Emergency STOP published for Lane ${laneId} (${safetyStopId})`),
    });
  }

  private clearLaneSafetyStopNow(
    laneId: string,
    safetyStopId: string,
    clearanceReason: string,
    officialName: string,
  ): Promise<CommandExecutionResult> {
    const command = ClearSafetyStopCommandSchema.parse(
      this.commands.commandBase({ safetyStopId, clearanceReason, confirmedSafe: true, issuedBy: officialName }),
    );
    return this.commands.publishCommand({
      action: 'clear-safety-stop',
      topic: mqttTopics.laneCommand(laneId, 'clear-safety-stop'),
      acknowledgementTopic: () => mqttTopics.laneCommandAcknowledgement(laneId, 'clear-safety-stop'),
      payload: command,
      expectedLaneIds: [laneId],
    });
  }

  private requireKnownLanes(laneIds: readonly string[]): string[] {
    const uniqueLaneIds = [...new Set(laneIds)];
    if (uniqueLaneIds.length === 0) throw new Error('A safety operation requires at least one Lane');
    const unknown = uniqueLaneIds.filter((laneId) => !this.context.hasLane(laneId));
    if (unknown.length > 0) throw new Error(`Unknown Lane(s): ${unknown.join(', ')}`);
    return uniqueLaneIds;
  }

  private safetyCommandFailure(
    action: Extract<DirectorCommandAction, 'activate-safety-stop' | 'clear-safety-stop'>,
    laneId: string,
    error: unknown,
  ): CommandExecutionResult {
    const result = createLaneCommandFailure({ action, laneId, code: 'SAFETY_COMMAND_FAILED', error });
    this.context.onResult(result);
    return result;
  }
}
