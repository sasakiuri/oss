// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStartCompetitionHandler } from '@/main/modules/competition/application/handlers/StartCompetitionHandler';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { CompetitionTypeRegistry } from '@/main/modules/competition/domain/CompetitionTypeRegistry';
import { AR60, BP60, BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createStartCompetitionHandler', () => {
  let registry: CompetitionTypeRegistry;
  let mockCompetitionRepo: ICompetitionRepository;
  let mockSessionRepo: ISessionRepository;
  let mockEventBus: IEventBus;

  beforeEach(() => {
    registry = new CompetitionTypeRegistry();
    registry.register(AR60);
    registry.register(BR60S);
    registry.register(BP60);

    mockCompetitionRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      findActive: vi.fn(),
      delete: vi.fn(),
    };

    mockSessionRepo = {
      save: vi.fn(),
      saveShot: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      findActive: vi.fn(),
    };

    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
  });

  it('starts competition and saves CompetitionState and Session', async () => {
    const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
    const result = await handler({ competitionTypeId: 'BR60S' });

    expect(result.competitionId).toBeDefined();
    expect(result.sessionId).toBeDefined();
    expect(mockSessionRepo.save).toHaveBeenCalledTimes(1);
    expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);
  });

  it('SessionStarted and CompetitionStarted events are emitted', async () => {
    const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await handler({ competitionTypeId: 'BR60S' });

    expect(mockEventBus.emit).toHaveBeenCalledTimes(2);
    expect(mockEventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'SessionStarted' }));
    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CompetitionStarted',
        competitionTypeId: 'BR60S',
      }),
    );
  });

  it('session discipline is correctly derived from definition', async () => {
    const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await handler({ competitionTypeId: 'BR60S' });

    const savedSession = vi.mocked(mockSessionRepo.save).mock.calls[0]![0];
    expect(savedSession.discipline.value).toBe('BEAM_RIFLE_10M');
  });

  it('creates an air-rifle session for AR60', async () => {
    const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await handler({ competitionTypeId: 'AR60' });

    const savedSession = vi.mocked(mockSessionRepo.save).mock.calls[0]![0];
    expect(savedSession.discipline.value).toBe('AIR_RIFLE_10M');
    expect(savedSession.scoringMode).toBe('DECIMAL');
  });

  it('should derive the SessionStarted event discipline from the definition', async () => {
    const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await handler({ competitionTypeId: 'BR60S' });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SessionStarted',
        discipline: expect.objectContaining({ value: 'BEAM_RIFLE_10M' }),
      }),
    );
  });

  describe('Session scoringMode derivation', () => {
    it('should call Session.create() with RING scoringMode when starting a BP60 competition', async () => {
      const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
      await handler({ competitionTypeId: 'BP60' });

      const savedSession = vi.mocked(mockSessionRepo.save).mock.calls[0]![0];
      expect(savedSession.scoringMode).toBe('RING');
    });

    it('should call Session.create() with DECIMAL scoringMode when starting a BR60S competition', async () => {
      const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
      await handler({ competitionTypeId: 'BR60S' });

      const savedSession = vi.mocked(mockSessionRepo.save).mock.calls[0]![0];
      expect(savedSession.scoringMode).toBe('DECIMAL');
    });
  });

  it('should throw an error for an unregistered competition type', async () => {
    const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
    await expect(handler({ competitionTypeId: 'NONEXISTENT' })).rejects.toThrow();
  });

  describe('Active competition/session cleanup', () => {
    it('should finish and save existing active competition', async () => {
      const activeCompetition = CompetitionState.create('old-comp', 'old-session', BR60S.config);
      vi.mocked(mockCompetitionRepo.findActive).mockResolvedValue(activeCompetition);
      vi.mocked(mockSessionRepo.findActive).mockResolvedValue(null);

      const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
      await handler({ competitionTypeId: 'BR60S' });

      // Old competition finish + new competition = 2 saves
      expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(2);
      const finishedComp = vi.mocked(mockCompetitionRepo.save).mock.calls[0]![0];
      expect(finishedComp.phase).toBe('FINISHED');
      expect(finishedComp.id).toBe('old-comp');
    });

    it('should finish and save existing active session', async () => {
      vi.mocked(mockCompetitionRepo.findActive).mockResolvedValue(null);

      const { Session: SessionClass } = await import('@/main/modules/session/domain/Session');
      const { Discipline: DisciplineClass } = await import('@/main/modules/session/domain/Discipline');
      const activeSession = SessionClass.create(DisciplineClass.airRifle10m());
      vi.mocked(mockSessionRepo.findActive).mockResolvedValue(activeSession);

      const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
      await handler({ competitionTypeId: 'BR60S' });

      // Old session finish + new session = 2 saves
      expect(mockSessionRepo.save).toHaveBeenCalledTimes(2);
      const finishedSession = vi.mocked(mockSessionRepo.save).mock.calls[0]![0];
      expect(finishedSession.isFinished).toBe(true);
    });

    it('should skip cleanup when there are no active competitions or sessions', async () => {
      vi.mocked(mockCompetitionRepo.findActive).mockResolvedValue(null);
      vi.mocked(mockSessionRepo.findActive).mockResolvedValue(null);

      const handler = createStartCompetitionHandler(registry, mockCompetitionRepo, mockSessionRepo, mockEventBus);
      await handler({ competitionTypeId: 'BR60S' });

      // Only new competition + new session
      expect(mockCompetitionRepo.save).toHaveBeenCalledTimes(1);
      expect(mockSessionRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
