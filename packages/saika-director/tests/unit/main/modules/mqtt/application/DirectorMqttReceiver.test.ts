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
