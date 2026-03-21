// SPDX-License-Identifier: MIT
import type { ErrorDefinition } from '../ErrorCatalog';

export type MqttErrorCode =
  | 'MQTT_CONNECTION_FAILED'
  | 'MQTT_PUBLISH_FAILED'
  | 'MQTT_SUBSCRIBE_FAILED'
  | 'MQTT_INVALID_TOPIC'
  | 'MQTT_CLIENT_NOT_CONNECTED'
  | 'MQTT_UNKNOWN_COMMAND_ACTION'
  | 'MQTT_COMMAND_VALIDATION_FAILED'
  | 'MQTT_COMMAND_EXECUTION_FAILED'
  | 'MQTT_ALREADY_IN_COMPETITION'
  | 'MQTT_NOT_IN_COMPETITION'
  | 'MQTT_CLOCK_OUT_OF_SYNC';

export const MQTT_ERRORS: ReadonlyArray<[MqttErrorCode, ErrorDefinition]> = [
  [
    'MQTT_CONNECTION_FAILED',
    {
      code: 'MQTT_CONNECTION_FAILED',
      message: 'Failed to connect to MQTT broker: {{brokerUrl}}',
      userMessage: 'Failed to connect to MQTT broker: {{brokerUrl}}',
      severity: 'error',
    },
  ],
  [
    'MQTT_PUBLISH_FAILED',
    {
      code: 'MQTT_PUBLISH_FAILED',
      message: 'Failed to publish message to topic: {{topic}}',
      userMessage: 'Failed to publish message to topic: {{topic}}',
      severity: 'error',
    },
  ],
  [
    'MQTT_SUBSCRIBE_FAILED',
    {
      code: 'MQTT_SUBSCRIBE_FAILED',
      message: 'Failed to subscribe to topic: {{topic}}',
      userMessage: 'Failed to subscribe to topic: {{topic}}',
      severity: 'error',
    },
  ],
  [
    'MQTT_INVALID_TOPIC',
    {
      code: 'MQTT_INVALID_TOPIC',
      message: 'Invalid MQTT topic format: {{topic}}',
      userMessage: 'Invalid MQTT topic format: {{topic}}',
      severity: 'error',
    },
  ],
  [
    'MQTT_CLIENT_NOT_CONNECTED',
    {
      code: 'MQTT_CLIENT_NOT_CONNECTED',
      message: 'MQTT client is not connected',
      userMessage: 'MQTT client is not connected',
      severity: 'error',
    },
  ],
  [
    'MQTT_UNKNOWN_COMMAND_ACTION',
    {
      code: 'MQTT_UNKNOWN_COMMAND_ACTION',
      message: 'Unknown MQTT command action: {{action}}',
      userMessage: 'Unknown MQTT command action: {{action}}',
      severity: 'error',
    },
  ],
  [
    'MQTT_COMMAND_VALIDATION_FAILED',
    {
      code: 'MQTT_COMMAND_VALIDATION_FAILED',
      message: 'MQTT command validation failed for action {{action}}: {{detail}}',
      userMessage: 'MQTT command validation failed: {{action}}',
      severity: 'error',
    },
  ],
  [
    'MQTT_COMMAND_EXECUTION_FAILED',
    {
      code: 'MQTT_COMMAND_EXECUTION_FAILED',
      message: 'MQTT command execution failed for action {{action}}: {{detail}}',
      userMessage: 'MQTT command execution failed: {{action}}',
      severity: 'error',
    },
  ],
  [
    'MQTT_ALREADY_IN_COMPETITION',
    {
      code: 'MQTT_ALREADY_IN_COMPETITION',
      message: 'Lane is already in competition: {{competitionId}}',
      userMessage: 'Lane is already in competition: {{competitionId}}',
      severity: 'error',
    },
  ],
  [
    'MQTT_NOT_IN_COMPETITION',
    {
      code: 'MQTT_NOT_IN_COMPETITION',
      message: 'Lane is not in any competition',
      userMessage: 'Lane is not in any competition',
      severity: 'error',
    },
  ],
  [
    'MQTT_CLOCK_OUT_OF_SYNC',
    {
      code: 'MQTT_CLOCK_OUT_OF_SYNC',
      message: 'Clock drift exceeds threshold ({{driftMs}}ms). Command rejected.',
      userMessage: 'Clock drift exceeds threshold ({{driftMs}}ms). Command rejected.',
      severity: 'error',
    },
  ],
];
