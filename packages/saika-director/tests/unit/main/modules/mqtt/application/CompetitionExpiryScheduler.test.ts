// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionExpiryScheduler } from '@/main/modules/mqtt/application/CompetitionExpiryScheduler';
import { DirectorMqttState } from '@/main/modules/mqtt/application/DirectorMqttState';
import type { CommandExecutionResult } from '@/main/modules/mqtt/application/DirectorMqttTypes';
import { KeyedOperationQueue } from '@/main/shared-infra/operations/KeyedOperationQueue';
import type { CompetitionStatePayload } from '@/shared/mqtt';

const now = '2026-09-09T00:00:00.000Z';
function competition(competitionId = 'competition'): CompetitionStatePayload {
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
    laneIds: ['lane'],
    startedAt: now,
    finishedAt: null,
    publishedAt: now,
    activeTimer: { timerScope: 'STAGE', stageIndex: 1, seriesIndex: null, timerStartAt: now, timerDurationSeconds: 1 },
  };
}
const success: CommandExecutionResult = { action: 'timer-expired', commandId: 'expiry', success: true, lanes: [] };

function setup() {
  const state = new DirectorMqttState(1000, vi.fn());
  state.setCompetition(competition());
  const queue = new KeyedOperationQueue();
  const publishExpiry = vi.fn<() => Promise<CommandExecutionResult>>().mockResolvedValue(success);
  const clearActiveTimer = vi.fn(async (current: CompetitionStatePayload) => {
    state.setCompetition({ ...current, activeTimer: undefined });
  });
  const onError = vi.fn();
  const scheduler = new CompetitionExpiryScheduler({
    state,
    publishExpiry,
    clearActiveTimer,
    onError,
    isConnected: () => true,
    runCompetitionOperation: (id, operation) => queue.run([id], operation),
  });
  return { scheduler, state, queue, publishExpiry, clearActiveTimer, onError };
}

describe('CompetitionExpiryScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it('retries a failed expiry with the original deadline and stops after durable cleanup', async () => {
    const { scheduler, publishExpiry, clearActiveTimer } = setup();
    publishExpiry.mockResolvedValueOnce({ ...success, success: false });
    scheduler.restoreAll();
    await vi.advanceTimersByTimeAsync(1000);
    expect(clearActiveTimer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(publishExpiry).toHaveBeenCalledTimes(2);
    expect(publishExpiry).toHaveBeenNthCalledWith(
      2,
      'competition',
      expect.objectContaining({ expiredAt: '2026-09-09T00:00:01.000Z' }),
    );
    expect(clearActiveTimer).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backs off when retained cleanup fails after successful acknowledgement', async () => {
    const { scheduler, publishExpiry, clearActiveTimer, onError } = setup();
    clearActiveTimer.mockRejectedValueOnce(new Error('retained publication failed'));
    scheduler.restoreAll();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(999);
    expect(publishExpiry).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(clearActiveTimer).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('suspends the old deadline while a replacement timer is pending', async () => {
    const { scheduler, state, publishExpiry } = setup();
    scheduler.restoreAll();
    const current = competition();
    state.setCompetition({ ...current, pendingTimer: { ...current.activeTimer!, action: 'timer-started' } });
    scheduler.restoreAll();
    await vi.advanceTimersByTimeAsync(5000);
    scheduler.retryForLane('lane');
    await vi.advanceTimersByTimeAsync(0);
    expect(publishExpiry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invalidates an expiry queued before session shutdown', async () => {
    const { scheduler, queue, publishExpiry } = setup();
    let release!: () => void;
    const pending = queue.run(
      ['competition'],
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    scheduler.restoreAll();
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.stop();
    release();
    await pending;
    await vi.advanceTimersByTimeAsync(0);
    expect(publishExpiry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not clear a new session timer or schedule retries when an old publication completes', async () => {
    const { scheduler, state, publishExpiry, clearActiveTimer } = setup();
    let release!: (result: CommandExecutionResult) => void;
    publishExpiry.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    scheduler.restoreAll();
    await vi.advanceTimersByTimeAsync(1000);
    scheduler.stop();
    state.reset();
    state.setCompetition(competition());
    release(success);
    await vi.advanceTimersByTimeAsync(0);
    expect(clearActiveTimer).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    scheduler.restoreAll();
    await vi.advanceTimersByTimeAsync(0);
    expect(clearActiveTimer).toHaveBeenCalledOnce();
  });
});
