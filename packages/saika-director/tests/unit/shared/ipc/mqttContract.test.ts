// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { MqttControlSnapshotSchema, SetBrokerConfigPayloadSchema } from '@/shared/ipc/contracts/mqtt.contract';

describe('SetBrokerConfigPayloadSchema', () => {
  it('accepts embedded mode without an external URL', () => {
    expect(SetBrokerConfigPayloadSchema.parse({ mode: 'embedded' })).toEqual({ mode: 'embedded' });
  });

  it('requires a valid MQTT URL for external mode', () => {
    expect(() => SetBrokerConfigPayloadSchema.parse({ mode: 'external' })).toThrow();
    expect(() => SetBrokerConfigPayloadSchema.parse({ mode: 'external', url: 'https://broker.example' })).toThrow();
    expect(SetBrokerConfigPayloadSchema.parse({ mode: 'external', url: 'mqtts://broker.example:8883' })).toEqual({
      mode: 'external',
      url: 'mqtts://broker.example:8883',
    });
  });
});

describe('MqttControlSnapshotSchema', () => {
  it('exposes the Director firing-point number for each Lane', () => {
    const snapshot = MqttControlSnapshotSchema.parse({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: null,
      lanes: [
        {
          laneId: '11111111-1111-4111-8111-111111111111',
          laneAlias: 'Lane 1',
          firingPointNumber: 1,
          hardware: null,
          competitionState: null,
          assignment: null,
          score: null,
          lastRawShot: null,
          lastCompetitionShot: null,
          lastSeenAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      competitions: [],
      lastCommand: null,
    });

    expect(snapshot.lanes[0]?.firingPointNumber).toBe(1);
  });
});
