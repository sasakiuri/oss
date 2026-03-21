// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('emitPhaseChanged', () => {
  let mockEventBus: IEventBus;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
  });

  it('should emit a PhaseChanged event', () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    emitPhaseChanged(mockEventBus, state, 'IDLE');

    expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'PhaseChanged' }));
  });

  it('should set previousPhase correctly', () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    emitPhaseChanged(mockEventBus, state, 'IDLE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ previousPhase: 'IDLE' }));
  });

  it('should set newPhase to the current phase of state', () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    emitPhaseChanged(mockEventBus, state, 'IDLE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ newPhase: 'ACTIVE' }));
  });

  it('should set aggregateId to state.id', () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    emitPhaseChanged(mockEventBus, state, 'IDLE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ aggregateId: 'comp-1' }));
  });

  it('should set stageIndex correctly', () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    emitPhaseChanged(mockEventBus, state, 'IDLE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ stageIndex: 0 }));
  });

  it('should set seriesIndex correctly', () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    emitPhaseChanged(mockEventBus, state, 'IDLE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ seriesIndex: 0 }));
  });

  it('should set stageName correctly', () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    emitPhaseChanged(mockEventBus, state, 'IDLE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ stageName: expect.any(String) }));
  });

  it('should set scored correctly', () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    emitPhaseChanged(mockEventBus, state, 'IDLE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ scored: false }));
  });

  it('should include timestamp', () => {
    const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
    emitPhaseChanged(mockEventBus, state, 'IDLE');

    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ timestamp: expect.any(Number) }));
  });
});
