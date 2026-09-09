// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { bindCompetitionEvents } from '@/main/composition/bindCompetitionEvents';
import type { TimedTargetState } from '@/main/modules/timed-target/domain/ITimedTargetControl';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';

const finished = {
  type: 'CompetitionFinished',
  timestamp: 1,
  aggregateId: 'competition',
  sessionId: 'session',
} as const;

describe('competition event composition', () => {
  it('cancels the matching active sequence and releases all subscriptions on disposal', () => {
    const eventBus = new TypedEventBus();
    const cancel = vi.fn();
    const getState = vi.fn(() => ({ phase: 'FIRING', sequenceId: 'sequence' }) as TimedTargetState);
    const dispose = bindCompetitionEvents(eventBus, { getState, cancel });
    eventBus.emit(finished);
    expect(getState).toHaveBeenCalledWith('competition');
    expect(cancel).toHaveBeenCalledWith({ sequenceId: 'sequence', reason: 'Competition finished' });
    dispose();
    dispose();
    cancel.mockClear();
    getState.mockClear();
    eventBus.emit(finished);
    expect(getState).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each(['COMPLETE', 'CANCELLED'] as const)('leaves a %s sequence unchanged', (phase) => {
    const eventBus = new TypedEventBus();
    const cancel = vi.fn();
    bindCompetitionEvents(eventBus, {
      getState: () => ({ phase, sequenceId: 'sequence' }) as TimedTargetState,
      cancel,
    });
    eventBus.emit(finished);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels on pause but keeps resume events separate from cancellation', () => {
    const eventBus = new TypedEventBus();
    const cancel = vi.fn();
    bindCompetitionEvents(eventBus, {
      getState: () => ({ phase: 'FIRING', sequenceId: 'sequence' }) as TimedTargetState,
      cancel,
    });
    const interruption = {
      type: 'CompetitionInterruptionChanged',
      timestamp: 1,
      aggregateId: 'competition',
      interruptionId: 'interruption',
      remainingSeconds: 10,
      unlimitedSightingShots: false,
    } as const;
    eventBus.emit({ ...interruption, status: 'RUNNING_MATCH' });
    expect(cancel).not.toHaveBeenCalled();
    eventBus.emit({ ...interruption, status: 'PAUSED' });
    expect(cancel).toHaveBeenCalledWith({ sequenceId: 'sequence', reason: 'Competition interruption interruption' });
  });
});
