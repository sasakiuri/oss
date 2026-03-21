// SPDX-License-Identifier: MIT
/**
 * MQTT external lane competition phase
 *
 * Phase definition for the MQTT API, independent of the internal Phase type in saika.lane.
 * Prevents internal implementation changes from affecting the external API.
 */
export const MqttLanePhase = {
  OFFLINE: 'OFFLINE',
  READY: 'READY',
  SIGHTING: 'SIGHTING',
  SIGHTING_COMPLETE: 'SIGHTING_COMPLETE',
  MATCH: 'MATCH',
  SERIES_COMPLETE: 'SERIES_COMPLETE',
  STAGE_COMPLETE: 'STAGE_COMPLETE',
  FINISHED: 'FINISHED',
} as const;

export type MqttLanePhase = (typeof MqttLanePhase)[keyof typeof MqttLanePhase];
