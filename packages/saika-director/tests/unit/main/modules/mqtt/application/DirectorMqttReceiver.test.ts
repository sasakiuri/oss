// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { DirectorMqttReceiver } from '@/main/modules/mqtt/application/DirectorMqttReceiver';

const laneId = '11111111-1111-4111-8111-111111111111';
const competitionId = '22222222-2222-4222-8222-222222222222';
const publishedAt = '2026-09-09T00:00:00.000Z';
const buffer = (value: unknown) => Buffer.from(JSON.stringify(value));
function setup() {
  const callbacks = {
    onHardwareState: vi.fn(),
    onCompetitionState: vi.fn(),
    onCompetitionCleared: vi.fn(),
    onLaneUpdate: vi.fn(),
    onCompetitionLaneUpdate: vi.fn(),
    onCompetitionShot: vi.fn(),
    onAcknowledgement: vi.fn(),
    onDebugLog: vi.fn(),
    onShotObservationEvidenceObserved: vi.fn(),
  };
  return { callbacks, receiver: new DirectorMqttReceiver(callbacks) };
}

describe('DirectorMqttReceiver', () => {
  it('accepts hardware state only when its schema, topic structure and Lane identity match', () => {
    const { receiver, callbacks } = setup();
    const topic = `saika/lane/${laneId}/hardware/state`;
    const state = { laneId, laneAlias: 'Lane 1', connection: { status: 'offline' }, appVersion: '0.3.0', publishedAt };
    receiver.handleMessage(topic, Buffer.from('{invalid'));
    receiver.handleMessage(topic, buffer({ ...state, publishedAt: 'invalid-date' }));
    receiver.handleMessage(topic, buffer({ ...state, laneId: competitionId }));
    receiver.handleMessage(`${topic}/extra`, buffer(state));
    receiver.handleMessage(topic.replace('saika/', 'other/'), buffer(state));
    expect(callbacks.onHardwareState).not.toHaveBeenCalled();
    expect(callbacks.onDebugLog).toHaveBeenCalledTimes(2);
    receiver.handleMessage(topic, buffer(state));
    expect(callbacks.onHardwareState).toHaveBeenCalledExactlyOnceWith(state);
  });

  it('validates both Lane and competition identity before projecting an assignment', () => {
    const { receiver, callbacks } = setup();
    const topic = `saika/competition/${competitionId}/lane/${laneId}/assignment`;
    const assignment = { competitionId, laneId, athlete: null, assignedAt: null, publishedAt };
    receiver.handleMessage(topic, buffer({ ...assignment, competitionId: laneId }));
    receiver.handleMessage(topic, buffer({ ...assignment, laneId: competitionId }));
    expect(callbacks.onCompetitionLaneUpdate).not.toHaveBeenCalled();
    receiver.handleMessage(topic, buffer(assignment));
    expect(callbacks.onCompetitionLaneUpdate).toHaveBeenCalledExactlyOnceWith(
      competitionId,
      laneId,
      { assignment },
      publishedAt,
    );
  });

  it.each([
    ['state', 'competitionState'],
    ['assignment', 'assignment'],
    ['score', 'score'],
    ['timed-target/state', 'timedTargetState'],
    ['qualification-recovery/state', 'qualificationRecoveryState'],
  ])('treats an empty retained %s as an explicit clear', (suffix, field) => {
    const { receiver, callbacks } = setup();
    receiver.handleMessage(`saika/competition/${competitionId}/lane/${laneId}/${suffix}`, Buffer.alloc(0));
    expect(callbacks.onCompetitionLaneUpdate).toHaveBeenCalledExactlyOnceWith(competitionId, laneId, { [field]: null });
    expect(callbacks.onDebugLog).not.toHaveBeenCalled();
  });

  it('clears competition state only on its exact retained topic', () => {
    const { receiver, callbacks } = setup();
    receiver.handleMessage(`saika/competition/${competitionId}/state/extra`, Buffer.alloc(0));
    expect(callbacks.onCompetitionCleared).not.toHaveBeenCalled();
    receiver.handleMessage(`saika/competition/${competitionId}/state`, Buffer.alloc(0));
    expect(callbacks.onCompetitionCleared).toHaveBeenCalledExactlyOnceWith(competitionId);
  });

  it('preserves every valid shot delivery and the original JSON for evidence consumers', () => {
    const { receiver, callbacks } = setup();
    const topic = `saika/competition/${competitionId}/lane/${laneId}/shot`;
    const shot = {
      laneId,
      competitionId,
      shotId: laneId,
      sessionId: laneId,
      x: 0,
      y: 0,
      rawScoreX10: 100,
      innerTen: false,
      mode: 'MATCH',
      timestamp: publishedAt,
      stageIndex: 1,
      scored: true,
      seriesIndex: 0,
      shotNumberInSeries: 1,
      isRecorded: true,
      isReplay: false,
      publishedAt,
    };
    const payload = Buffer.from(JSON.stringify(shot, null, 2));
    receiver.handleMessage(topic, payload);
    receiver.handleMessage(topic, payload);
    expect(callbacks.onCompetitionShot).toHaveBeenCalledTimes(2);
    expect(callbacks.onCompetitionShot).toHaveBeenLastCalledWith(shot, payload.toString('utf8'));
  });
});

describe('DirectorMqttReceiver topic routing', () => {
  const competition = 'C';
  const lane = 'L';
  const acknowledgement = {
    commandId: competitionId,
    laneId,
    status: 'done',
    acknowledgedAt: publishedAt,
  };

  function recordCalls() {
    const calls: unknown[][] = [];
    const record =
      (name: string) =>
      (...args: unknown[]) =>
        calls.push([name, ...args]);
    const receiver = new DirectorMqttReceiver({
      onHardwareState: record('onHardwareState'),
      onCompetitionState: record('onCompetitionState'),
      onCompetitionCleared: record('onCompetitionCleared'),
      onLaneUpdate: record('onLaneUpdate'),
      onCompetitionLaneUpdate: record('onCompetitionLaneUpdate'),
      onCompetitionShot: record('onCompetitionShot'),
      onAcknowledgement: record('onAcknowledgement'),
      onDebugLog: record('onDebugLog'),
      onCompetitionShootOffShotObserved: record('onCompetitionShootOffShotObserved'),
      onQualificationRecoveryStateObserved: record('onQualificationRecoveryStateObserved'),
      onQualificationRecoveryShotObserved: record('onQualificationRecoveryShotObserved'),
      onShotObservationEvidenceObserved: record('onShotObservationEvidenceObserved'),
    });
    return { calls, receiver };
  }

  it.each([
    [`saika/lane/${lane}/hardware/state`, 'hardware state'],
    [`saika/lane/${lane}/safety/state`, 'Lane safety state'],
    [`saika/lane/${lane}/range-officer/request`, 'Range Officer request'],
    [`saika/lane/${lane}/qualification-malfunction/signal`, 'qualification malfunction signal'],
    [`saika/lane/${lane}/est-complaint/signal`, 'EST complaint signal'],
    [`saika/lane/${lane}/hardware/shot`, 'raw shot'],
    [`saika/lane/${lane}/hardware/observation`, 'shot observation evidence'],
    [`saika/lane/${lane}/command/start-match/acknowledgement`, 'command acknowledgement'],
    [`saika/lane/${lane}/command/start-match`, null],
    [`saika/lane/${lane}/hardware/other`, null],
    ['saika/lane//hardware/state', 'hardware state'],
    [`saika/competition/${competition}/state`, 'competition state'],
    ['saika/competition//state', 'competition state'],
    [`saika/competition/${competition}/cue`, null],
    [`saika/competition/${competition}/command/start-match`, null],
    [`saika/competition/${competition}/command/start-match/acknowledgement/${lane}`, 'command acknowledgement'],
    [`saika/competition/${competition}/lane/${lane}/command/assign-athlete`, null],
    [`saika/competition/${competition}/lane/${lane}/command/assign-athlete/acknowledgement`, 'command acknowledgement'],
    [`saika/competition/${competition}/lane/${lane}/shoot-off/shot`, 'competition shoot-off shot'],
    [`saika/competition/${competition}/lane/${lane}/timed-target/state`, 'timed target state'],
    [`saika/competition/${competition}/lane/${lane}/qualification-recovery/state`, 'Qualification recovery state'],
    [`saika/competition/${competition}/lane/${lane}/qualification-recovery/shot`, 'Qualification recovery shot'],
    [`saika/competition/${competition}/lane/${lane}/state`, 'lane state'],
    [`saika/competition/${competition}/lane/${lane}/assignment`, 'lane assignment'],
    [`saika/competition/${competition}/lane/${lane}/score`, 'lane score'],
    [`saika/competition/${competition}/lane/${lane}/shot`, 'competition shot'],
    [`saika/competition/${competition}/lane/${lane}/observation`, 'shot observation evidence'],
    [`saika/competition/${competition}/lane/${lane}/query/request-1/request`, null],
    [`saika/competition/${competition}/lane/${lane}/query/request-1/response`, null],
    [`saika/competition/${competition}/lane/${lane}/other`, null],
    [`saika/competition/${competition}/lane//state`, null],
    [`saika/competition/${competition}/lane//timed-target/state`, 'timed target state'],
    [`saika/competition/${competition}/lane//shoot-off/shot`, 'competition shoot-off shot'],
    [`saika/other/${lane}/hardware/state`, null],
    [`other/lane/${lane}/hardware/state`, null],
  ])('routes invalid JSON on %s to the %s parser', (topic, label) => {
    const { calls, receiver } = recordCalls();
    receiver.handleMessage(topic, Buffer.from('{'));
    expect(calls).toEqual(label ? [['onDebugLog', `Ignored invalid JSON for ${label}`]] : []);
  });

  it.each([
    [`saika/lane/${lane}/hardware/state`, [['onDebugLog', 'Ignored invalid JSON for hardware state']]],
    [
      `saika/lane/${lane}/command/start-match/acknowledgement`,
      [['onDebugLog', 'Ignored invalid JSON for command acknowledgement']],
    ],
    [`saika/competition/${competition}/state`, [['onCompetitionCleared', competition]]],
    ['saika/competition//state', []],
    [`saika/competition/${competition}/cue`, []],
    [`saika/competition/${competition}/command/start-match/acknowledgement/${lane}`, []],
    [`saika/competition/${competition}/lane/${lane}/command/assign-athlete/acknowledgement`, []],
    [
      `saika/competition/${competition}/lane/${lane}/state`,
      [['onCompetitionLaneUpdate', competition, lane, { competitionState: null }]],
    ],
    [
      `saika/competition/${competition}/lane/${lane}/assignment`,
      [['onCompetitionLaneUpdate', competition, lane, { assignment: null }]],
    ],
    [
      `saika/competition/${competition}/lane/${lane}/score`,
      [['onCompetitionLaneUpdate', competition, lane, { score: null }]],
    ],
    [
      `saika/competition/${competition}/lane/${lane}/timed-target/state`,
      [['onCompetitionLaneUpdate', competition, lane, { timedTargetState: null }]],
    ],
    [
      `saika/competition/${competition}/lane/${lane}/qualification-recovery/state`,
      [['onCompetitionLaneUpdate', competition, lane, { qualificationRecoveryState: null }]],
    ],
    [`saika/competition/${competition}/lane/${lane}/qualification-recovery/shot`, []],
    [`saika/competition/${competition}/lane/${lane}/shoot-off/shot`, []],
    [`saika/competition/${competition}/lane/${lane}/shot`, []],
    [`saika/competition/${competition}/lane/${lane}/observation`, []],
    [`saika/competition/${competition}/lane//state`, []],
    ['saika/competition//lane/L/timed-target/state', []],
    [`saika/competition/${competition}/lane//qualification-recovery/state`, []],
  ])('handles an empty payload on %s', (topic, expected) => {
    const { calls, receiver } = recordCalls();
    receiver.handleMessage(topic, Buffer.alloc(0));
    expect(calls).toEqual(expected);
  });

  it.each([
    `saika/lane/${lane}/command/start-match/acknowledgement`,
    `saika/competition/${competition}/command/start-match/acknowledgement/${lane}`,
    `saika/competition/${competition}/lane/${lane}/command/assign-athlete/acknowledgement`,
  ])('forwards a valid acknowledgement on %s with its topic', (topic) => {
    const { calls, receiver } = recordCalls();
    receiver.handleMessage(topic, buffer(acknowledgement));
    expect(calls).toEqual([['onAcknowledgement', topic, acknowledgement]]);
  });
});
