// SPDX-License-Identifier: MIT
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';
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

  it.each([
    mqttTopics.laneHardwareState(laneId),
    mqttTopics.laneHardwareShot(laneId),
    mqttTopics.laneHardwareObservation(laneId),
    mqttTopics.laneSafetyState(laneId),
    mqttTopics.laneRangeOfficerRequest(laneId),
    mqttTopics.laneQualificationMalfunctionSignal(laneId),
    mqttTopics.laneEstComplaintSignal(laneId),
    mqttTopics.laneCommandAcknowledgement(laneId, 'join-competition'),
    mqttTopics.competitionCommandAcknowledgement('c1', 'start-match', laneId),
    mqttTopics.laneCompetitionState('c1', laneId),
    mqttTopics.laneAssignment('c1', laneId),
    mqttTopics.laneScore('c1', laneId),
    mqttTopics.competitionShot('c1', laneId),
    mqttTopics.competitionShotObservation('c1', laneId),
    mqttTopics.timedTargetState('c1', laneId),
    mqttTopics.competitionShootOffShot('c1', laneId),
    mqttTopics.qualificationRecoveryState('c1', laneId),
    mqttTopics.qualificationRecoveryShot('c1', laneId),
    mqttTopics.laneCompetitionCommandAcknowledgement('c1', laneId, 'assign-athlete'),
    mqttTopics.laneQueryResponse('c1', laneId, 'request-1'),
  ])('lets a Lane publish its own %s', (topic) => {
    const principal = { username: 'lane', role: 'LANE' } as const;
    expect(requiredPolicy().canPublish(principal, `saika-lane-${laneId}`, topic)).toBe(true);
  });

  it.each([
    `saika/lane/${laneId}/command/acknowledgement`,
    `saika/lane/${laneId}/command/join-competition/acknowledgement/extra`,
    `saika/lane/${laneId}/unknown`,
    `saika/lane/${laneId}/hardware/state/extra`,
    `saika/competition/c1/command/start-match/acknowledgement/${laneId}/extra`,
    `saika/competition/c1/command/start-match/acknowledgement/${otherLaneId}`,
    `saika/competition/c1/lane/${laneId}/command/acknowledgement`,
    `saika/competition/c1/lane/${laneId}/command/assign-athlete`,
    `saika/competition/c1/lane/${laneId}/query/request-1/request`,
    `saika/competition/c1/lane/${laneId}/unknown`,
    `saika/competition/c1/lane/${laneId}/score/extra`,
    `saika/competition/c1/lane/${otherLaneId}/score`,
    'saika/competition/c1/state',
    'saika/competition/c1/cue',
  ])('refuses a Lane publication to %s', (topic) => {
    const principal = { username: 'lane', role: 'LANE' } as const;
    expect(requiredPolicy().canPublish(principal, `saika-lane-${laneId}`, topic)).toBe(false);
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

  it.each([
    [`saika/lane/${laneId}/command/+`, true],
    [`saika/lane/${laneId}/command/join-competition`, false],
    [`saika/lane/${laneId}/hardware/state`, false],
    [`saika/lane/${otherLaneId}/command/+`, false],
    ['saika/competition/+/state', true],
    ['saika/competition/+/command/+', true],
    ['saika/competition//state', false],
    ['saika/competition/c1', false],
    ['saika/competition/c1/state/extra', false],
    ['saika/competition/c1/command/start-match', false],
    ['saika/competition/c1/cue/+', false],
    ['saika/competition/c1/lane/+/command/+', false],
    [`saika/competition/c1/lane/${laneId}/command/assign-athlete`, false],
    [`saika/competition/c1/lane/${laneId}/command/+/acknowledgement`, false],
    [`saika/competition/c1/lane/${laneId}/query/+/response`, false],
    [`saika/competition/c1/lane/${laneId}/state`, false],
    [`other/competition/c1/state`, false],
    [`saika/vista/c1/state`, false],
  ])('decides a Lane subscription to %s as %s', (topic, allowed) => {
    const principal = { username: 'lane', role: 'LANE' } as const;
    expect(requiredPolicy().canSubscribe(principal, `saika-lane-${laneId}`, topic)).toBe(allowed);
  });

  it('matches a Lane client ID case-insensitively but compares topic Lane IDs exactly', () => {
    const policy = requiredPolicy();
    const principal = { username: 'lane', role: 'LANE' } as const;
    const lowerLaneId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const upperLaneId = lowerLaneId.toUpperCase();
    const clientId = `saika-lane-${upperLaneId}`;

    expect(policy.canSubscribe(principal, clientId, `saika/lane/${upperLaneId}/command/+`)).toBe(true);
    expect(policy.canSubscribe(principal, clientId, `saika/lane/${lowerLaneId}/command/+`)).toBe(false);
    expect(policy.canSubscribe(principal, clientId, `saika/competition/c1/lane/${upperLaneId}/query/+/request`)).toBe(
      true,
    );
    expect(policy.canSubscribe(principal, 'saika-lane-not-a-uuid', 'saika/competition/c1/state')).toBe(false);
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
