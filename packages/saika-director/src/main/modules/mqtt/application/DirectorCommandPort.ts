// SPDX-License-Identifier: MIT
import type { MqttCommandActionOf } from '@sasakiuri/saika-protocol/commands';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { CommandExecutionResult } from './DirectorMqttTypes';
import type { PublishCommandOptions } from './MqttCommandDispatcher';

type CommandPayload = PublishCommandOptions['payload'];

/**
 * Command identity and connected publication, shared by focused control workflows. Each publish
 * method addresses one topic scope, so an action can only be sent on the topic its scope defines.
 */
export interface DirectorCommandPort {
  commandBase(fields: Record<string, unknown>): CommandPayload;
  /** Sends a Lane command and waits for that Lane's acknowledgement. */
  publishLaneCommand(
    laneId: string,
    action: MqttCommandActionOf<'lane'>,
    payload: CommandPayload,
    onPublished?: () => void,
  ): Promise<CommandExecutionResult>;
  /** Sends a command to one competition Lane and waits for that Lane's acknowledgement. */
  publishCompetitionLaneCommand(
    competitionId: string,
    laneId: string,
    action: MqttCommandActionOf<'competition-lane'>,
    payload: CommandPayload,
    onPublished?: () => void,
  ): Promise<CommandExecutionResult>;
  /** Broadcasts a competition command and waits for an acknowledgement from each expected Lane. */
  publishCompetitionCommand(
    competitionId: string,
    action: MqttCommandActionOf<'competition'>,
    payload: CommandPayload,
    expectedLaneIds: readonly string[],
    onPublished?: () => void,
  ): Promise<CommandExecutionResult>;
}

export function createDirectorCommandPort(
  directorId: string,
  publishCommand: (options: PublishCommandOptions) => Promise<CommandExecutionResult>,
): DirectorCommandPort {
  return {
    commandBase: (fields) => ({
      commandId: crypto.randomUUID(),
      issuedBy: directorId,
      issuerId: directorId,
      issuedAt: new Date().toISOString(),
      ...fields,
    }),
    publishLaneCommand: (laneId, action, payload, onPublished) =>
      publishCommand({
        action,
        topic: mqttTopics.laneCommand(laneId, action),
        acknowledgementTopic: () => mqttTopics.laneCommandAcknowledgement(laneId, action),
        payload,
        expectedLaneIds: [laneId],
        onPublished,
      }),
    publishCompetitionLaneCommand: (competitionId, laneId, action, payload, onPublished) =>
      publishCommand({
        action,
        topic: mqttTopics.laneCompetitionCommand(competitionId, laneId, action),
        acknowledgementTopic: () => mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, laneId, action),
        payload,
        expectedLaneIds: [laneId],
        onPublished,
      }),
    publishCompetitionCommand: (competitionId, action, payload, expectedLaneIds, onPublished) =>
      publishCommand({
        action,
        topic: mqttTopics.competitionCommand(competitionId, action),
        acknowledgementTopic: (laneId) => mqttTopics.competitionCommandAcknowledgement(competitionId, action, laneId),
        payload,
        expectedLaneIds,
        onPublished,
      }),
  };
}
