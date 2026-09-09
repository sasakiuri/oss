// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectorMqttState } from '@/main/modules/mqtt/application/DirectorMqttState';
import type {
  CompetitionStatePayload,
  LaneAssignmentPayload,
  LaneCompetitionStatePayload,
  LaneScorePayload,
} from '@/shared/mqtt';

const publishedAt = '2026-09-09T00:00:00.000Z';
function competition(competitionId = 'competition-1'): CompetitionStatePayload {
  return {
    competitionId,
    competitionTypeId: 'BR60S',
    competitionTypeName: 'Beam Rifle',
    discipline: 'BEAM_RIFLE_10M',
    roundName: 'Qualification',
    acc: 'DECIMAL',
    phase: 'MATCH',
    shotsPerSeries: 10,
    totalSeries: 6,
    totalShots: 60,
    laneIds: ['lane-1'],
    startedAt: null,
    finishedAt: null,
    publishedAt,
  };
}
function assignment(competitionId: string): LaneAssignmentPayload {
  return {
    competitionId,
    laneId: 'lane-1',
    athlete: { id: 'athlete-1', name: competitionId, startNumber: 1 },
    assignedAt: publishedAt,
    publishedAt,
  };
}
function laneState(commandId: string): LaneCompetitionStatePayload {
  return {
    competitionId: 'competition-1',
    laneId: 'lane-1',
    sessionId: 'session-1',
    phase: 'FINISHED',
    currentStage: { index: 1, name: 'Match', scored: true, totalSeries: 6 },
    currentSeries: { index: 5, shotsRecorded: 10, maxShots: 10 },
    finalSnapshotCommandId: commandId,
    publishedAt,
  };
}
function laneScore(commandId: string): LaneScorePayload {
  return {
    competitionId: 'competition-1',
    laneId: 'lane-1',
    sessionId: 'session-1',
    totalScoreX10: 0,
    totalShotCount: 0,
    acc: 'DECIMAL',
    stages: [],
    finalSnapshotCommandId: commandId,
    publishedAt,
  };
}

describe('DirectorMqttState', () => {
  afterEach(() => vi.useRealTimers());

  it('projects replayed Lane data only into its most recent competition', () => {
    const state = new DirectorMqttState(1000, vi.fn());
    state.updateCompetitionLane('competition-1', 'lane-1', { assignment: assignment('competition-1') });
    expect(state.getLane('lane-1')?.assignment).toBeNull();
    state.setCompetition(competition());
    state.projectCompetitionLaneData();
    expect(state.getLane('lane-1')?.assignment?.competitionId).toBe('competition-1');
    state.setCompetition({ ...competition('competition-2'), publishedAt: '2026-09-09T00:01:00.000Z' });
    state.updateCompetitionLane('competition-2', 'lane-1', { assignment: assignment('competition-2') });
    state.updateCompetitionLane('competition-1', 'lane-1', { assignment: null });
    expect(state.getLane('lane-1')?.assignment?.competitionId).toBe('competition-2');
    state.removeCompetition('competition-2');
    state.projectCompetitionLaneData();
    expect(state.getLane('lane-1')?.assignment).toBeNull();
    expect(state.getCompetitionIdForLane('lane-1')).toBe('competition-1');
  });

  it('requires new final state and score for the current command and matching session', async () => {
    vi.useFakeTimers();
    const state = new DirectorMqttState(1000, vi.fn());
    state.setCompetition(competition());
    state.updateCompetitionLane('competition-1', 'lane-1', {
      competitionState: laneState('old'),
      score: laneScore('old'),
    });
    const baseline = state.captureCompetitionLaneSnapshotRevisions('competition-1', ['lane-1']);
    const settled = vi.fn();
    const result = state.waitForFreshFinalLaneSnapshots('competition-1', ['lane-1'], baseline, 'current').then(settled);
    state.updateCompetitionLane('competition-1', 'lane-1', {
      competitionState: laneState('current'),
      score: laneScore('old'),
    });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    state.updateCompetitionLane('competition-1', 'lane-1', {
      score: { ...laneScore('current'), sessionId: 'other-session' },
    });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    state.updateCompetitionLane('competition-1', 'lane-1', { score: laneScore('current') });
    await result;
    expect(settled).toHaveBeenCalledWith(new Map());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports missing final publications at the deadline and removes its listener', async () => {
    vi.useFakeTimers();
    const state = new DirectorMqttState(1000, vi.fn());
    state.setCompetition(competition());
    const result = state.waitForFreshFinalLaneSnapshots('competition-1', ['lane-1'], new Map(), 'current');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await result).get('lane-1')).toContain('did not publish its final competition state');
    state.updateCompetitionLane('competition-1', 'lane-1', {
      competitionState: laneState('current'),
      score: laneScore('current'),
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for the target series publication independently of command acknowledgements', async () => {
    vi.useFakeTimers();
    const state = new DirectorMqttState(1000, vi.fn());
    state.setCompetition(competition());
    const result = state.waitForTimedTargetLaneReadiness('competition-1', ['lane-1'], 1, 5);
    state.updateCompetitionLane('competition-1', 'lane-1', {
      competitionState: { ...laneState('current'), phase: 'MATCH', awaitingSeriesStart: true },
    });
    expect(vi.getTimerCount()).toBe(1);
    state.updateCompetitionLane('competition-1', 'lane-1', {
      competitionState: { ...laneState('current'), phase: 'MATCH', awaitingSeriesStart: false },
    });
    await expect(result).resolves.toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds shot deduplication and resets broker-scoped projections before replay', () => {
    const state = new DirectorMqttState(1000, vi.fn());
    expect(state.rememberShot('first')).toBe(true);
    expect(state.rememberShot('first')).toBe(false);
    for (let i = 0; i < 10_000; i++) state.rememberShot(`shot-${i}`);
    expect(state.rememberShot('first')).toBe(true);
    state.setCompetition(competition());
    state.updateCompetitionLane('competition-1', 'lane-1', { assignment: assignment('competition-1') });
    state.reset();
    expect(state.getLanes()).toEqual([]);
    expect(state.getCompetitions()).toEqual([]);
    expect(state.rememberShot('first')).toBe(true);
  });
});
