// SPDX-License-Identifier: MIT
/** Public MQTT phases are independent of the internal competition Phase type. */

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
