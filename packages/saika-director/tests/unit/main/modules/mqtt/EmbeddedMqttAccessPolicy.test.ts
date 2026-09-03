// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  EmbeddedMqttAccessPolicy,
  embeddedMqttSecurityFromEnvironment,
} from '@/main/modules/mqtt/domain/EmbeddedMqttAccessPolicy';

const laneId = '11111111-1111-4111-8111-111111111111';
const otherLaneId = '22222222-2222-4222-8222-222222222222';

function requiredPolicy(): EmbeddedMqttAccessPolicy {
  return new EmbeddedMqttAccessPolicy({
    mode: 'REQUIRED',
    accounts: [
      { username: 'director', password: 'director-secret', role: 'DIRECTOR' },
      { username: 'lane', password: 'lane-secret', role: 'LANE' },
    ],
  });
}

describe('EmbeddedMqttAccessPolicy', () => {
  it('authenticates configured accounts without accepting missing or incorrect credentials', () => {
    const policy = requiredPolicy();

    expect(policy.authenticate('director', Buffer.from('director-secret'))).toEqual({
      username: 'director',
      role: 'DIRECTOR',
    });
    expect(policy.authenticate('lane', Buffer.from('incorrect'))).toBeNull();
    expect(policy.authenticate(undefined, undefined)).toBeNull();
  });

  it('lets a Director use Saika topics but rejects topics outside the namespace', () => {
    const policy = requiredPolicy();
    const principal = { username: 'director', role: 'DIRECTOR' } as const;

    expect(policy.canPublish(principal, 'saika-director-any', 'saika/competition/c1/command/start-match')).toBe(true);
    expect(policy.canSubscribe(principal, 'saika-director-any', 'saika/lane/+/hardware/state')).toBe(true);
    expect(policy.canPublish(principal, 'saika-director-any', 'unrelated/topic')).toBe(false);
  });

  it('limits a Lane to its own publications and acknowledgement topics', () => {
    const policy = requiredPolicy();
    const principal = { username: 'lane', role: 'LANE' } as const;
    const clientId = `saika-lane-${laneId}`;

    expect(policy.canPublish(principal, clientId, `saika/lane/${laneId}/hardware/state`)).toBe(true);
    expect(
      policy.canPublish(principal, clientId, `saika/competition/c1/command/start-match/acknowledgement/${laneId}`),
    ).toBe(true);
    expect(policy.canPublish(principal, clientId, `saika/competition/c1/lane/${laneId}/score`)).toBe(true);
    expect(policy.canPublish(principal, clientId, `saika/lane/${otherLaneId}/hardware/state`)).toBe(false);
    expect(policy.canPublish(principal, clientId, `saika/lane/${laneId}/command/join-competition`)).toBe(false);
    expect(policy.canPublish(principal, clientId, 'saika/competition/c1/command/start-match')).toBe(false);
    expect(policy.canPublish(principal, 'unbound-client', `saika/lane/${laneId}/hardware/state`)).toBe(false);
  });

  it('limits a Lane subscription to shared state/commands and its own private topics', () => {
    const policy = requiredPolicy();
    const principal = { username: 'lane', role: 'LANE' } as const;
    const clientId = `saika-lane-${laneId}`;

    expect(policy.canSubscribe(principal, clientId, `saika/lane/${laneId}/command/+`)).toBe(true);
    expect(policy.canSubscribe(principal, clientId, 'saika/competition/c1/state')).toBe(true);
    expect(policy.canSubscribe(principal, clientId, 'saika/competition/c1/cue')).toBe(true);
    expect(policy.canSubscribe(principal, clientId, 'saika/competition/c1/command/+')).toBe(true);
    expect(policy.canSubscribe(principal, clientId, `saika/competition/c1/lane/${laneId}/command/+`)).toBe(true);
    expect(policy.canSubscribe(principal, clientId, `saika/competition/c1/lane/${laneId}/query/+/request`)).toBe(true);
    expect(policy.canSubscribe(principal, clientId, 'saika/competition/c1/#')).toBe(false);
    expect(policy.canSubscribe(principal, clientId, `saika/competition/c1/lane/${otherLaneId}/command/+`)).toBe(false);
  });

  it('builds an explicit required configuration and rejects incomplete secrets', () => {
    expect(
      embeddedMqttSecurityFromEnvironment({
        SAIKA_MQTT_BROKER_AUTH_MODE: 'required',
        SAIKA_MQTT_DIRECTOR_USERNAME: 'director',
        SAIKA_MQTT_DIRECTOR_PASSWORD: 'd-secret',
        SAIKA_MQTT_LANE_USERNAME: 'lane',
        SAIKA_MQTT_LANE_PASSWORD: 'l-secret',
      }),
    ).toEqual({
      mode: 'REQUIRED',
      accounts: [
        { username: 'director', password: 'd-secret', role: 'DIRECTOR' },
        { username: 'lane', password: 'l-secret', role: 'LANE' },
      ],
    });
    expect(() =>
      embeddedMqttSecurityFromEnvironment({
        SAIKA_MQTT_BROKER_AUTH_MODE: 'REQUIRED',
        SAIKA_MQTT_DIRECTOR_USERNAME: 'director',
        SAIKA_MQTT_DIRECTOR_PASSWORD: 'd-secret',
      }),
    ).toThrow('SAIKA_MQTT_LANE_USERNAME/SAIKA_MQTT_LANE_PASSWORD');
  });

  it('rejects an invalid broker authentication mode instead of disabling security', () => {
    expect(() => embeddedMqttSecurityFromEnvironment({ SAIKA_MQTT_BROKER_AUTH_MODE: 'REQUIERD' })).toThrow(
      'SAIKA_MQTT_BROKER_AUTH_MODE must be DISABLED or REQUIRED',
    );
  });
});
