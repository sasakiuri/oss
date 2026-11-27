// SPDX-License-Identifier: MIT
import type { MqttCommandAction } from '@sasakiuri/saika-protocol/commands';
import type { CommandBatchResult, CommandExecutionResult } from './DirectorMqttTypes';

/** Keep partial batch failures in the same Lane result format as acknowledged commands. */
export function createLaneCommandFailure(input: {
  commandId?: string;
  action: MqttCommandAction;
  laneId: string;
  code: 'MQTT_PUBLISH_FAILED' | 'RANGE_COMMAND_FAILED' | 'SAFETY_COMMAND_FAILED';
  error: unknown;
}): CommandExecutionResult {
  return {
    commandId: input.commandId ?? crypto.randomUUID(),
    action: input.action,
    success: false,
    lanes: [
      {
        laneId: input.laneId,
        status: 'error',
        error: {
          code: input.code,
          message: input.error instanceof Error ? input.error.message : String(input.error),
        },
      },
    ],
  };
}

/**
 * Sends one command per Lane at the same time. A rejected Lane command becomes that Lane's failure
 * result, so the other Lanes' outcomes are kept; an error thrown before `run` returns a promise
 * rejects the whole batch.
 */
export async function fanOutLaneCommands(
  laneIds: readonly string[],
  run: (laneId: string) => Promise<CommandExecutionResult>,
  onFailure: (laneId: string, error: unknown) => CommandExecutionResult,
): Promise<CommandBatchResult> {
  const commands = await Promise.all(
    laneIds.map((laneId) => run(laneId).catch((error: unknown) => onFailure(laneId, error))),
  );
  return { success: commands.every((command) => command.success), commands };
}
