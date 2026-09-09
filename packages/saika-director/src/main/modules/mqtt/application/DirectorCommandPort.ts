// SPDX-License-Identifier: MIT
import type { CommandExecutionResult } from './DirectorMqttTypes';
import type { PublishCommandOptions } from './MqttCommandDispatcher';

/** Command identity and connected publication, shared by focused control workflows. */
export interface DirectorCommandPort {
  commandBase(fields: Record<string, unknown>): Record<string, unknown> & { commandId: string };
  publishCommand(options: PublishCommandOptions): Promise<CommandExecutionResult>;
}
