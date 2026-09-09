// SPDX-License-Identifier: MIT
import type { CommandExecutionResult, DirectorCommandAction } from './DirectorMqttTypes';

/** Keep partial batch failures in the same Lane result format as acknowledged commands. */
export function createLaneCommandFailure(input: {
  commandId?: string;
  action: DirectorCommandAction;
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
