// SPDX-License-Identifier: MIT
import type { ErrorCatalogEntries } from '../ErrorCatalog';

export const MQTT_ERRORS = {
  MQTT_CONNECTION_FAILED: {
    message: 'Failed to connect to MQTT broker: {{brokerUrl}}',
    userMessage: 'Failed to connect to MQTT broker: {{brokerUrl}}',
    severity: 'error',
  },
  MQTT_PUBLISH_FAILED: {
    message: 'Failed to publish message to topic: {{topic}}',
    userMessage: 'Failed to publish message to topic: {{topic}}',
    severity: 'error',
  },
  MQTT_SUBSCRIBE_FAILED: {
    message: 'Failed to subscribe to topic: {{topic}}',
    userMessage: 'Failed to subscribe to topic: {{topic}}',
    severity: 'error',
  },
  MQTT_CLIENT_NOT_CONNECTED: {
    message: 'MQTT client is not connected',
    userMessage: 'MQTT client is not connected',
    severity: 'error',
  },
  MQTT_UNKNOWN_COMMAND_ACTION: {
    message: 'Unknown MQTT command action: {{action}}',
    userMessage: 'Unknown MQTT command action: {{action}}',
    severity: 'error',
  },
  MQTT_COMMAND_VALIDATION_FAILED: {
    message: 'MQTT command validation failed for action {{action}}: {{detail}}',
    userMessage: 'MQTT command validation failed: {{action}}',
    severity: 'error',
  },
  MQTT_COMMAND_EXECUTION_FAILED: {
    message: 'MQTT command execution failed for action {{action}}: {{detail}}',
    userMessage: 'MQTT command execution failed: {{action}}',
    severity: 'error',
  },
  MQTT_COMMAND_UNAUTHORIZED: {
    message: 'MQTT command issuer is not trusted: {{detail}}',
    userMessage: 'The command was rejected because its Director identity is not trusted.',
    severity: 'error',
  },
  MQTT_ALREADY_IN_COMPETITION: {
    message: 'Lane is already in competition: {{competitionId}}',
    userMessage: 'Lane is already in competition: {{competitionId}}',
    severity: 'error',
  },
  MQTT_NOT_IN_COMPETITION: {
    message: 'Lane is not in any competition',
    userMessage: 'Lane is not in any competition',
    severity: 'error',
  },
  MQTT_COMPETITION_STATE_TIMEOUT: {
    message: 'Timed out waiting for competition state: {{competitionId}}',
    userMessage: 'Competition state could not be obtained: {{competitionId}}',
    severity: 'error',
  },
  MQTT_COMPETITION_STATE_MISMATCH: {
    message: 'Competition state does not match the lane configuration: {{detail}}',
    userMessage: 'Competition settings do not match this lane: {{detail}}',
    severity: 'error',
  },
  MQTT_CLOCK_OUT_OF_SYNC: {
    message: 'Clock drift exceeds threshold ({{driftMs}}ms). Command rejected.',
    userMessage: 'Clock drift exceeds threshold ({{driftMs}}ms). Command rejected.',
    severity: 'error',
  },
} satisfies ErrorCatalogEntries;
