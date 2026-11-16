// SPDX-License-Identifier: MIT
import type { EventForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';
import { eventsContract } from '@/shared/ipc/contracts';

import { toFiringWindowViolationDto } from './toFiringWindowViolationDto';

/** MQTT domain events the renderer receives, with the payload each channel carries. */
export const mqttEventForwarding: EventForwardingRule[] = [
  {
    eventType: 'ShotReceived',
    channel: eventsContract.channels.shotReceived,
    extractPayload: (shot) => ({
      channel: shot.channel,
      shotNumber: shot.shotNumber,
      score: shot.score,
      seriesNumber: shot.seriesNumber,
    }),
  },
  {
    eventType: 'LaneConnected',
    channel: eventsContract.channels.laneConnected,
    extractPayload: (event) => ({ channel: event.channel }),
  },
  {
    eventType: 'DebugLogEmitted',
    channel: eventsContract.channels.debugLog,
    extractPayload: (entry) => ({
      timestamp: entry.timestamp,
      direction: entry.direction,
      raw: entry.raw,
      parsed: entry.parsed,
    }),
  },
  {
    eventType: 'MqttConnectionError',
    channel: eventsContract.channels.mqttConnectionError,
    extractPayload: (event) => ({ message: event.message }),
  },
  {
    eventType: 'MqttControlStateChanged',
    channel: eventsContract.channels.mqttControlStateChanged,
    extractPayload: (event) => event.snapshot,
  },
  {
    eventType: 'FiringWindowViolationDetected',
    channel: eventsContract.channels.firingWindowViolationDetected,
    extractPayload: (event) => toFiringWindowViolationDto(event.violation),
  },
  {
    eventType: 'ShotObservationEvidenceObserved',
    channel: eventsContract.channels.shotObservationEvidenceObserved,
    extractPayload: (observed) => ({ ...observed.evidence, observedAt: observed.observedAt.toISOString() }),
  },
];
