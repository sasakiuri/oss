// SPDX-License-Identifier: MIT
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import type { EventForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';
import { eventsContract } from '@/shared/ipc/contracts';

import type {
  DebugLogEmitted,
  FiringWindowViolationDetected,
  LaneConnected,
  MqttConnectionError,
  MqttControlStateChanged,
  ShotObservationEvidenceObserved,
  ShotReceived,
} from '../domain/events';
import { toFiringWindowViolationDto } from './toFiringWindowViolationDto';

/** MQTT domain events the renderer receives, with the payload each channel carries. */
export const mqttEventForwarding: EventForwardingRule[] = [
  {
    eventType: 'ShotReceived',
    channel: eventsContract.channels.shotReceived,
    extractPayload: (event: AnyDomainEvent) => {
      const shot = event as ShotReceived;
      return {
        channel: shot.channel,
        shotNumber: shot.shotNumber,
        score: shot.score,
        seriesNumber: shot.seriesNumber,
      };
    },
  },
  {
    eventType: 'LaneConnected',
    channel: eventsContract.channels.laneConnected,
    extractPayload: (event: AnyDomainEvent) => ({
      channel: (event as LaneConnected).channel,
    }),
  },
  {
    eventType: 'DebugLogEmitted',
    channel: eventsContract.channels.debugLog,
    extractPayload: (event: AnyDomainEvent) => {
      const entry = event as DebugLogEmitted;
      return {
        timestamp: entry.timestamp,
        direction: entry.direction,
        raw: entry.raw,
        parsed: entry.parsed,
      };
    },
  },
  {
    eventType: 'MqttConnectionError',
    channel: eventsContract.channels.mqttConnectionError,
    extractPayload: (event: AnyDomainEvent) => ({
      message: (event as MqttConnectionError).message,
    }),
  },
  {
    eventType: 'MqttControlStateChanged',
    channel: eventsContract.channels.mqttControlStateChanged,
    extractPayload: (event: AnyDomainEvent) => (event as MqttControlStateChanged).snapshot,
  },
  {
    eventType: 'FiringWindowViolationDetected',
    channel: eventsContract.channels.firingWindowViolationDetected,
    extractPayload: (event: AnyDomainEvent) =>
      toFiringWindowViolationDto((event as FiringWindowViolationDetected).violation),
  },
  {
    eventType: 'ShotObservationEvidenceObserved',
    channel: eventsContract.channels.shotObservationEvidenceObserved,
    extractPayload: (event: AnyDomainEvent) => {
      const observed = event as ShotObservationEvidenceObserved;
      return { ...observed.evidence, observedAt: observed.observedAt.toISOString() };
    },
  },
];
