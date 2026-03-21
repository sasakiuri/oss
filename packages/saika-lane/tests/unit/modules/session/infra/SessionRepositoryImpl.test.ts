// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import { SessionRepositoryImpl } from '@/main/modules/session/infra/SessionRepositoryImpl';
import { ILocalStorage } from '@/shared/storage/ILocalStorage';

describe('SessionRepositoryImpl', () => {
  let repository: SessionRepositoryImpl;
  let mockStorage: ILocalStorage;

  beforeEach(() => {
    // Create mock storage
    mockStorage = {
      get: vi.fn(),
      set: vi.fn(),
      setMany: vi.fn(),
      has: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
      clear: vi.fn(),
    };

    repository = new SessionRepositoryImpl(mockStorage);
  });

  describe('save()', () => {
    it('should save a session successfully', async () => {
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline);

      await repository.save(session);

      expect(mockStorage.set).toHaveBeenCalledTimes(2); // session data + active key
      expect(mockStorage.set).toHaveBeenCalledWith(
        `session:${session.id}`,
        expect.objectContaining({
          id: session.id,
          discipline: 'AIR_RIFLE_10M',
        }),
      );
      expect(mockStorage.set).toHaveBeenCalledWith('session:active', session.id);
    });

    it('should not update active key for finished sessions', async () => {
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline).finish();

      await repository.save(session);

      expect(mockStorage.set).toHaveBeenCalledTimes(1); // session data only
      expect(mockStorage.set).toHaveBeenCalledWith(`session:${session.id}`, expect.any(Object));
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline);
      vi.mocked(mockStorage.set).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.save(session)).rejects.toThrow('Repository operation failed');
    });
  });

  describe('findById()', () => {
    it('should retrieve a session by ID', async () => {
      const sessionId = 'test-session-id';
      const mockData = {
        id: sessionId,
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
        series: [{ seriesNumber: 1, totalScore: 0 }],
        allShots: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
      };

      vi.mocked(mockStorage.get).mockReturnValue(mockData);

      const session = await repository.findById(sessionId);

      expect(session).not.toBeNull();
      expect(session?.id).toBe(sessionId);
      expect(mockStorage.get).toHaveBeenCalledWith(`session:${sessionId}`);
    });

    it('should return null for a non-existent ID', async () => {
      vi.mocked(mockStorage.get).mockReturnValue(undefined);

      const session = await repository.findById('non-existent-id');

      expect(session).toBeNull();
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      vi.mocked(mockStorage.get).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.findById('test-id')).rejects.toThrow('Repository operation failed');
    });
  });

  describe('findAll()', () => {
    it('should retrieve all sessions', async () => {
      const mockData = {
        'session:id1': {
          id: 'id1',
          discipline: 'AIR_RIFLE_10M',
          mode: 'SIGHTING',
          series: [{ seriesNumber: 1, totalScore: 0 }],
          allShots: [],
          startedAt: new Date().toISOString(),
          finishedAt: null,
        },
        'session:id2': {
          id: 'id2',
          discipline: 'AIR_PISTOL_10M',
          mode: 'MATCH',
          series: [{ seriesNumber: 1, totalScore: 0 }],
          allShots: [],
          startedAt: new Date().toISOString(),
          finishedAt: null,
        },
        'session:active': 'id1', // This should be excluded
        'other:key': 'value', // This should also be excluded
      };

      vi.mocked(mockStorage.getAll).mockReturnValue(mockData);

      const sessions = await repository.findAll();

      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.id).toBe('id1');
      expect(sessions[1]?.id).toBe('id2');
    });

    it('should return an empty array when no sessions exist', async () => {
      vi.mocked(mockStorage.getAll).mockReturnValue({});

      const sessions = await repository.findAll();

      expect(sessions).toEqual([]);
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      vi.mocked(mockStorage.getAll).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.findAll()).rejects.toThrow('Repository operation failed');
    });
  });

  describe('delete()', () => {
    it('should delete a session successfully', async () => {
      const sessionId = 'test-session-id';
      vi.mocked(mockStorage.get).mockReturnValue('other-id'); // active session is different

      await repository.delete(sessionId);

      expect(mockStorage.delete).toHaveBeenCalledWith(`session:${sessionId}`);
      expect(mockStorage.delete).toHaveBeenCalledTimes(1);
    });

    it('should also clear active key when deleting an active session', async () => {
      const sessionId = 'test-session-id';
      vi.mocked(mockStorage.get).mockReturnValue(sessionId); // active session matches

      await repository.delete(sessionId);

      expect(mockStorage.delete).toHaveBeenCalledWith(`session:${sessionId}`);
      expect(mockStorage.delete).toHaveBeenCalledWith('session:active');
      expect(mockStorage.delete).toHaveBeenCalledTimes(2);
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      vi.mocked(mockStorage.delete).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.delete('test-id')).rejects.toThrow('Repository operation failed');
    });
  });

  describe('findActive()', () => {
    it('should retrieve the active session', async () => {
      const sessionId = 'active-session-id';
      const mockData = {
        id: sessionId,
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
        series: [{ seriesNumber: 1, totalScore: 0 }],
        allShots: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
      };

      vi.mocked(mockStorage.get)
        .mockReturnValueOnce(sessionId) // first call returns active ID
        .mockReturnValueOnce(mockData); // second call returns session data

      const session = await repository.findActive();

      expect(session).not.toBeNull();
      expect(session?.id).toBe(sessionId);
    });

    it('should return null when no active session exists', async () => {
      vi.mocked(mockStorage.get).mockReturnValue(undefined);

      const session = await repository.findActive();

      expect(session).toBeNull();
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      vi.mocked(mockStorage.get).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.findActive()).rejects.toThrow('Repository operation failed');
    });
  });

  describe('toStorageData() and toDomainEntity() conversion', () => {
    it('should convert a Session to storage data and restore it back', async () => {
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline);

      // Add a shot
      const impactPoint = new ImpactPoint(0.5, 0.5);
      const score = new Score(105);
      const sessionWithShot = session.recordShot(impactPoint, score, new Date());

      // Save
      await repository.save(sessionWithShot);

      // Get saved data
      const savedData = vi.mocked(mockStorage.set).mock.calls[0]?.[1];

      // Verify data structure
      expect(savedData).toMatchObject({
        id: sessionWithShot.id,
        discipline: 'AIR_RIFLE_10M',
        mode: expect.any(String),
        series: expect.any(Array),
        allShots: expect.any(Array),
        startedAt: expect.any(String),
        finishedAt: null,
      });

      // Restoration test
      vi.mocked(mockStorage.get).mockReturnValue(savedData);
      const restoredSession = await repository.findById(sessionWithShot.id);

      expect(restoredSession).not.toBeNull();
      expect(restoredSession?.id).toBe(sessionWithShot.id);
      expect(restoredSession?.shotCount).toBe(sessionWithShot.shotCount);
    });
  });

  describe('Immutability', () => {
    it('should have a frozen repository instance', () => {
      expect(Object.isFrozen(repository)).toBe(true);
    });
  });

  describe('Bug fix for same score across multiple series', () => {
    it('should correctly save and restore when the same score exists in multiple series', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);
      session = session.switchMode(Mode.match());

      // Series 1: 10 shots including 10.4 points
      session = session.recordShot(new ImpactPoint(0, 0), new Score(104), new Date());
      for (let i = 1; i < 10; i++) {
        session = session.recordShot(new ImpactPoint(0, 0), new Score(100), new Date());
      }

      // Series 2: Including the same 10.4 points
      session = session.recordShot(new ImpactPoint(0, 0), new Score(104), new Date());

      // Save
      await repository.save(session);
      const savedData = vi.mocked(mockStorage.set).mock.calls[0]?.[1] as any;

      // Verify: First shot has seriesNumber 2 (after sighting series 1)
      expect(savedData.allShots[0].seriesNumber).toBe(2);
      // Verify: 11th shot has seriesNumber 3
      expect(savedData.allShots[10].seriesNumber).toBe(3);

      // Restore
      vi.mocked(mockStorage.get).mockReturnValue(savedData);
      const restored = await repository.findById(session.id);

      // Verify that series 2 (after sighting) also has 10.4 points
      expect(restored?.series[1]?.scores[0]?.value).toBe(104);
      // Verify that series 3 also has 10.4 points
      expect(restored?.series[2]?.scores[0]?.value).toBe(104);

      // Confirm that series totals match between original and restored sessions
      expect(restored?.series[1]?.total).toBeCloseTo(session.series[1]?.total ?? 0);
      expect(restored?.series[2]?.total).toBeCloseTo(session.series[2]?.total ?? 0);
    });
  });
});
