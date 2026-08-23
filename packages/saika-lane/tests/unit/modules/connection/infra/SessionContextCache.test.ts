// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  initializeLogger: vi.fn(),
  resetLogger: vi.fn(),
}));

import { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';

import { buildSession } from '../../../../helpers/factories';
import { createMockEventBus, createMockSessionRepository } from '../../../../helpers/mockDependencies';

describe('SessionContextCache', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let cache: SessionContextCache;

  beforeEach(() => {
    eventBus = createMockEventBus();
    sessionRepository = createMockSessionRepository();
    cache = new SessionContextCache(eventBus);
  });

  describe('getContext', () => {
    it('should throw SESSION_NOT_FOUND when no context is cached', () => {
      expect(() => cache.getContext()).toThrow();
    });

    it('should throw SESSION_NOT_FOUND with correct error code', () => {
      try {
        cache.getContext();
        expect.fail('Expected an error to be thrown');
      } catch (error) {
        expect((error as { code?: string }).code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should return cached context after SessionStarted event', () => {
      cache.subscribeEvents(vi.fn());

      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline: Discipline.airPistol10m(),
        timestamp: Date.now(),
      });

      const context = cache.getContext();
      expect(context.discipline.value).toBe('AIR_PISTOL_10M');
      expect(context.mode.value).toBe('SIGHTING');
    });
  });

  describe('bootstrap', () => {
    it('should populate cache from active session', async () => {
      const session = buildSession({ discipline: Discipline.rifle50m() });
      sessionRepository.findActive = vi.fn().mockResolvedValue(session);

      await cache.bootstrap(sessionRepository);

      const context = cache.getContext();
      expect(context.discipline.value).toBe('RIFLE_50M');
    });

    it('should not populate cache when no active session exists', async () => {
      sessionRepository.findActive = vi.fn().mockResolvedValue(null);

      await cache.bootstrap(sessionRepository);

      expect(() => cache.getContext()).toThrow();
    });

    it('should call findActive on session repository', async () => {
      await cache.bootstrap(sessionRepository);

      expect(sessionRepository.findActive).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeEvents', () => {
    it('should subscribe to SessionStarted event', () => {
      cache.subscribeEvents(vi.fn());

      expect(eventBus.on).toHaveBeenCalledWith('SessionStarted', expect.any(Function));
    });

    it('should subscribe to ModeSwitched event', () => {
      cache.subscribeEvents(vi.fn());

      expect(eventBus.on).toHaveBeenCalledWith('ModeSwitched', expect.any(Function));
    });

    it('should subscribe to competition stage and phase events', () => {
      cache.subscribeEvents(vi.fn());

      expect(eventBus.on).toHaveBeenCalledWith('StageAdvanced', expect.any(Function));
      expect(eventBus.on).toHaveBeenCalledWith('PhaseChanged', expect.any(Function));
    });

    it('should subscribe to SessionReset event', () => {
      cache.subscribeEvents(vi.fn());

      expect(eventBus.on).toHaveBeenCalledWith('SessionReset', expect.any(Function));
    });

    it('should update discipline and set mode to sighting on SessionStarted', () => {
      cache.subscribeEvents(vi.fn());

      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline: Discipline.airRifle10m(),
        timestamp: Date.now(),
      });

      const context = cache.getContext();
      expect(context.discipline.value).toBe('AIR_RIFLE_10M');
      expect(context.mode.value).toBe('SIGHTING');
    });

    it('should call onSessionReset callback on SessionStarted', () => {
      const onReset = vi.fn();
      cache.subscribeEvents(onReset);

      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline: Discipline.airRifle10m(),
        timestamp: Date.now(),
      });

      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('should update mode on ModeSwitched', () => {
      cache.subscribeEvents(vi.fn());

      // First, start a session to set up context
      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline: Discipline.airRifle10m(),
        timestamp: Date.now(),
      });

      // Then switch mode
      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'ModeSwitched',
        aggregateId: 'session-1',
        previousMode: Mode.sighting(),
        newMode: Mode.match(),
        timestamp: Date.now(),
      });

      const context = cache.getContext();
      expect(context.mode.value).toBe('MATCH');
    });

    it('should update mode when the competition advances to a scored stage', () => {
      cache.subscribeEvents(vi.fn());
      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline: Discipline.beamPistol10m(),
        timestamp: Date.now(),
      });

      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'StageAdvanced',
        aggregateId: 'competition-1',
        previousStageIndex: 0,
        newStageIndex: 1,
        stageName: 'Match',
        scored: true,
        timestamp: Date.now(),
      });

      expect(cache.getContext().mode.value).toBe('MATCH');
    });

    it('should derive mode from the active competition phase', () => {
      cache.subscribeEvents(vi.fn());
      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline: Discipline.airRifle10m(),
        timestamp: Date.now(),
      });

      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'PhaseChanged',
        aggregateId: 'competition-1',
        previousPhase: 'STAGE_ENTERED',
        newPhase: 'ACTIVE',
        stageIndex: 1,
        seriesIndex: 0,
        stageName: 'Match',
        scored: true,
        timestamp: Date.now(),
      });
      expect(cache.getContext().mode.value).toBe('MATCH');

      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'PhaseChanged',
        aggregateId: 'competition-1',
        previousPhase: 'ACTIVE',
        newPhase: 'IDLE',
        stageIndex: 0,
        seriesIndex: 0,
        stageName: 'Sighting',
        scored: false,
        timestamp: Date.now(),
      });
      expect(cache.getContext().mode.value).toBe('SIGHTING');
    });

    it('should clear cache on SessionReset', () => {
      cache.subscribeEvents(vi.fn());

      // First, start a session
      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline: Discipline.airRifle10m(),
        timestamp: Date.now(),
      });

      // Then reset
      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionReset',
        aggregateId: 'session-1',
        timestamp: Date.now(),
      });

      expect(() => cache.getContext()).toThrow();
    });

    it('should call onSessionReset callback on SessionReset', () => {
      const onReset = vi.fn();
      cache.subscribeEvents(onReset);

      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionReset',
        aggregateId: 'session-1',
        timestamp: Date.now(),
      });

      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('should not call onSessionReset on ModeSwitched', () => {
      const onReset = vi.fn();
      cache.subscribeEvents(onReset);

      // Start session first
      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline: Discipline.airRifle10m(),
        timestamp: Date.now(),
      });

      onReset.mockClear();

      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'ModeSwitched',
        aggregateId: 'session-1',
        previousMode: Mode.sighting(),
        newMode: Mode.match(),
        timestamp: Date.now(),
      });

      expect(onReset).not.toHaveBeenCalled();
    });
  });
});
