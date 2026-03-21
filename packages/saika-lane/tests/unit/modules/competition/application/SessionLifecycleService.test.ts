// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionLifecycleService } from '@/main/modules/competition/application/SessionLifecycleService';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Session } from '@/main/modules/session/domain/Session';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('SessionLifecycleService', () => {
  let mockSessionRepo: ISessionRepository;
  let mockEventBus: IEventBus;
  let service: SessionLifecycleService;

  beforeEach(() => {
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
    service = new SessionLifecycleService(mockSessionRepo, mockEventBus);
  });

  describe('rotateSession', () => {
    it('finishes the old session', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      await service.rotateSession(oldSession.id);

      const firstSave = vi.mocked(mockSessionRepo.save).mock.calls[0]![0];
      expect(firstSave.isFinished).toBe(true);
      expect(firstSave.id).toBe(oldSession.id);
    });

    it('creates a new session with the same discipline', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      await service.rotateSession(oldSession.id);

      const secondSave = vi.mocked(mockSessionRepo.save).mock.calls[1]![0];
      expect(secondSave.isFinished).toBe(false);
      expect(secondSave.discipline.value).toBe('AIR_RIFLE_10M');
    });

    it('returns the new session ID', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      const newSessionId = await service.rotateSession(oldSession.id);

      const secondSave = vi.mocked(mockSessionRepo.save).mock.calls[1]![0];
      expect(newSessionId).toBe(secondSave.id);
    });

    it('new session ID differs from old session', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      const newSessionId = await service.rotateSession(oldSession.id);

      expect(newSessionId).not.toBe(oldSession.id);
    });

    it('saves to session repository 2 times (finish + new)', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      await service.rotateSession(oldSession.id);

      expect(mockSessionRepo.save).toHaveBeenCalledTimes(2);
    });

    it('emits SessionStarted event', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      const newSessionId = await service.rotateSession(oldSession.id);

      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SessionStarted',
          aggregateId: newSessionId,
        }),
      );
    });

    it('SessionStarted event has correct discipline', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      await service.rotateSession(oldSession.id);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SessionStarted',
          discipline: expect.objectContaining({ value: 'AIR_RIFLE_10M' }),
        }),
      );
    });

    it('SessionStarted event has timestamp', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      await service.rotateSession(oldSession.id);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SessionStarted',
          timestamp: expect.any(Number),
        }),
      );
    });

    it('correctly rotates for air pistol discipline', async () => {
      const oldSession = Session.create(Discipline.airPistol10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      await service.rotateSession(oldSession.id);

      const secondSave = vi.mocked(mockSessionRepo.save).mock.calls[1]![0];
      expect(secondSave.discipline.value).toBe('AIR_PISTOL_10M');
    });

    it('RING scoring mode is maintained after rotation', async () => {
      const oldSession = Session.create(Discipline.airPistol10m(), 'RING');
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      await service.rotateSession(oldSession.id);

      const secondSave = vi.mocked(mockSessionRepo.save).mock.calls[1]![0];
      expect(secondSave.scoringMode).toBe('RING');
    });

    it('DECIMAL scoring mode is maintained after rotation', async () => {
      const oldSession = Session.create(Discipline.airRifle10m(), 'DECIMAL');
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      await service.rotateSession(oldSession.id);

      const secondSave = vi.mocked(mockSessionRepo.save).mock.calls[1]![0];
      expect(secondSave.scoringMode).toBe('DECIMAL');
    });

    it('throws error for non-existent session ID', async () => {
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

      await expect(service.rotateSession('nonexistent')).rejects.toThrow();
    });

    it('throws with SESSION_NOT_FOUND error code', async () => {
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

      await expect(service.rotateSession('nonexistent')).rejects.toMatchObject({
        code: 'SESSION_NOT_FOUND',
      });
    });

    it('save is not called when session is not found', async () => {
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

      await expect(service.rotateSession('nonexistent')).rejects.toThrow();
      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    });

    it('event is not emitted when session is not found', async () => {
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

      await expect(service.rotateSession('nonexistent')).rejects.toThrow();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('searches for session with the correct ID', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      await service.rotateSession('target-session-id');

      expect(mockSessionRepo.findById).toHaveBeenCalledWith('target-session-id');
    });

    it('operation order: findById → save(finished) → save(new) → emit', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);

      const callOrder: string[] = [];
      vi.mocked(mockSessionRepo.findById).mockImplementation(async () => {
        callOrder.push('findById');
        return oldSession;
      });
      vi.mocked(mockSessionRepo.save).mockImplementation(async () => {
        callOrder.push('save');
      });
      vi.mocked(mockEventBus.emit).mockImplementation(() => {
        callOrder.push('emit');
      });

      await service.rotateSession(oldSession.id);

      expect(callOrder).toEqual(['findById', 'save', 'save', 'emit']);
    });

    it('event is not emitted when save throws an error', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);
      vi.mocked(mockSessionRepo.save).mockRejectedValue(new Error('save failed'));

      await expect(service.rotateSession(oldSession.id)).rejects.toThrow('save failed');
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('new session is not created when save after finish fails', async () => {
      const oldSession = Session.create(Discipline.airRifle10m());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(oldSession);
      vi.mocked(mockSessionRepo.save).mockRejectedValueOnce(new Error('save failed'));

      await expect(service.rotateSession(oldSession.id)).rejects.toThrow('save failed');
      expect(mockSessionRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
