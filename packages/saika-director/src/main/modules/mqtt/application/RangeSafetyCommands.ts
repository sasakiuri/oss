// SPDX-License-Identifier: MIT
import {
  ActivateSafetyStopCommandSchema,
  ClearSafetyStopCommandSchema,
  type MqttCommandActionOf,
} from '@sasakiuri/saika-protocol/commands';

import { createLaneCommandFailure, fanOutLaneCommands } from './laneCommandBatch';
import type { DirectorCommandPort } from './DirectorCommandPort';
import type { CommandBatchResult, CommandExecutionResult } from './DirectorMqttTypes';

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
    return fanOutLaneCommands(
      this.requireKnownLanes(laneIds),
      (laneId) => this.activateLaneSafetyStopNow(laneId, safetyStopId, reason, officialName),
      (laneId, error) => this.safetyCommandFailure('activate-safety-stop', laneId, error),
    );
  }

  async clearSafetyStop(
    laneIds: string[],
    safetyStopId: string,
    clearanceReason: string,
    officialName: string,
  ): Promise<CommandBatchResult> {
    return fanOutLaneCommands(
      this.requireKnownLanes(laneIds),
      (laneId) => this.clearLaneSafetyStopNow(laneId, safetyStopId, clearanceReason, officialName),
      (laneId, error) => this.safetyCommandFailure('clear-safety-stop', laneId, error),
    );
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
    return this.commands.publishLaneCommand(laneId, 'activate-safety-stop', command, () =>
      this.context.log(`Emergency STOP published for Lane ${laneId} (${safetyStopId})`),
    );
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
    return this.commands.publishLaneCommand(laneId, 'clear-safety-stop', command);
  }

  private requireKnownLanes(laneIds: readonly string[]): string[] {
    const uniqueLaneIds = [...new Set(laneIds)];
    if (uniqueLaneIds.length === 0) throw new Error('A safety operation requires at least one Lane');
    const unknown = uniqueLaneIds.filter((laneId) => !this.context.hasLane(laneId));
    if (unknown.length > 0) throw new Error(`Unknown Lane(s): ${unknown.join(', ')}`);
    return uniqueLaneIds;
  }

  private safetyCommandFailure(
    action: Extract<MqttCommandActionOf<'lane'>, 'activate-safety-stop' | 'clear-safety-stop'>,
    laneId: string,
    error: unknown,
  ): CommandExecutionResult {
    const result = createLaneCommandFailure({ action, laneId, code: 'SAFETY_COMMAND_FAILED', error });
    this.context.onResult(result);
    return result;
  }
}
