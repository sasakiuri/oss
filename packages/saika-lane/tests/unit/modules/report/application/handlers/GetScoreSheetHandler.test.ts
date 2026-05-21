// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetScoreSheetInput } from '@/main/composition/tokens';
import type { ScoreSheetDto } from '@/main/modules/report/application/dto';
import { createGetScoreSheetHandler } from '@/main/modules/report/application/handlers/GetScoreSheetHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import type { LocalStorageAdapter } from '@/main/modules/settings/infra/LocalStorageAdapter';
import type { QueryHandler } from '@/main/shared-infra/cqrs';

describe('createGetScoreSheetHandler', () => {
  let handler: QueryHandler<GetScoreSheetInput, ScoreSheetDto>;
  let mockSessionRepo: ISessionRepository;
  let mockStorage: LocalStorageAdapter;

  beforeEach(() => {
    mockSessionRepo = {
      save: vi.fn(),
      saveShot: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      findActive: vi.fn(),
    };

    mockStorage = {
      get: vi.fn().mockReturnValue({ laneNumber: 5 }),
      set: vi.fn(),
      delete: vi.fn(),
      has: vi.fn(),
      clear: vi.fn(),
    } as unknown as LocalStorageAdapter;

    handler = createGetScoreSheetHandler(mockSessionRepo, mockStorage);
  });

  describe('Normal cases', () => {
    it('should correctly generate ScoreSheetDto from a session', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline).switchMode(Mode.match());

      // Add 10 shots
      const scores = [105, 102, 98, 95, 99, 101, 100, 97, 94, 94];
      for (const scoreVal of scores) {
        session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(scoreVal), new Date());
      }

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.sessionId).toBe(session.id);
      expect(result.laneNumber).toBe(5);
      expect(result.relay).toBe(0);
      expect(result.playerName).toBe('');
      expect(result.affiliation).toBe('');
      expect(result.allShots).toHaveLength(10);
      expect(result.seriesScores).toHaveLength(1);
      expect(result.totalScore).toBe(985);
      expect(result.totalIntegerScore).toBe(94);
      expect(result.disciplineName).toBe('10m Air Rifle');
    });

    it('should have shotNumber as series-internal sequence (1-10)', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline).switchMode(Mode.match());

      for (let i = 0; i < 10; i++) {
        session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(100), new Date());
      }

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      // Series-internal sequence should be 1-10
      const shotNumbers = result.allShots.map((s) => s.shotNumber);
      expect(shotNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should reset shotNumber for each series in multiple-series case', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline).switchMode(Mode.match());

      // Series 1 (10 shots)— seriesNumber = 2 (series[0]=sighting, series[1]=match)
      for (let i = 0; i < 10; i++) {
        session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(100), new Date());
      }

      // Series 2 (5 shots)— seriesNumber = 3 (auto-created on series completion)
      for (let i = 0; i < 5; i++) {
        session = session.recordShot(new ImpactPoint(0.3, 0.4), new Score(95), new Date());
      }

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      // Series 1 (seriesNumber=2): 1-10
      const series1Shots = result.allShots.filter((s) => s.seriesNumber === 2);
      expect(series1Shots.map((s) => s.shotNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // Series 2 (seriesNumber=3): 1-5
      const series2Shots = result.allShots.filter((s) => s.seriesNumber === 3);
      expect(series2Shots.map((s) => s.shotNumber)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should print sighting shots when no match shots exist yet', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);

      session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(90), new Date());
      session = session.recordShot(new ImpactPoint(0.3, 0.4), new Score(95), new Date());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.allShots).toHaveLength(2);
      expect(result.allShots.map((s) => s.shotNumber)).toEqual([1, 2]);
      expect(result.allShots.map((s) => s.seriesNumber)).toEqual([0, 0]);
      expect(result.seriesScores).toEqual([185]);
      expect(result.totalScore).toBe(185);
      expect(result.totalIntegerScore).toBe(18);
    });

    it('should print sighting shots after switching to match when no match shots exist yet', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);

      session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(90), new Date());
      session = session.recordShot(new ImpactPoint(0.3, 0.4), new Score(95), new Date());
      session = session.switchMode(Mode.match());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.allShots).toHaveLength(2);
      expect(result.allShots.map((s) => s.shotNumber)).toEqual([1, 2]);
      expect(result.allShots.map((s) => s.seriesNumber)).toEqual([0, 0]);
      expect(result.seriesScores).toEqual([185]);
      expect(result.totalScore).toBe(185);
      expect(result.totalIntegerScore).toBe(18);
    });

    it('should exclude sighting shots when match shots exist', async () => {
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);

      // 3 sighting shots
      for (let i = 0; i < 3; i++) {
        session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(90), new Date());
      }

      // Switch to match
      session = session.switchMode(Mode.match());

      // 2 match shots
      for (let i = 0; i < 2; i++) {
        session = session.recordShot(new ImpactPoint(0.3, 0.4), new Score(100), new Date());
      }

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      // Only match shots are included
      expect(result.allShots).toHaveLength(2);
      expect(result.totalScore).toBe(200);
    });

    it('should correctly handle an empty session (no shots)', async () => {
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline).switchMode(Mode.match());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.allShots).toHaveLength(0);
      expect(result.seriesScores).toHaveLength(0);
      expect(result.totalScore).toBe(0);
      expect(result.totalIntegerScore).toBe(0);
    });

    it('should default laneNumber to 1 when storage has no settings', async () => {
      vi.mocked(mockStorage.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline).switchMode(Mode.match());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.laneNumber).toBe(1);
    });

    it('should retrieve laneNumber even when only laneNumber exists in userPreferences', async () => {
      vi.mocked(mockStorage.get as ReturnType<typeof vi.fn>).mockReturnValue({ laneNumber: 3 });

      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline).switchMode(Mode.match());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.laneNumber).toBe(3);
    });

    it('should default to 1 when laneNumber is not in userPreferences', async () => {
      vi.mocked(mockStorage.get as ReturnType<typeof vi.fn>).mockReturnValue({});

      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline).switchMode(Mode.match());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.laneNumber).toBe(1);
    });

    it('should use the value when laneNumber is included in userPreferences', async () => {
      vi.mocked(mockStorage.get as ReturnType<typeof vi.fn>).mockReturnValue({
        laneNumber: 7,
      });

      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline).switchMode(Mode.match());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.laneNumber).toBe(7);
    });

    it('should fall back to default value when safeParse fails for string storage value', async () => {
      vi.mocked(mockStorage.get as ReturnType<typeof vi.fn>).mockReturnValue('invalid');

      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline).switchMode(Mode.match());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.laneNumber).toBe(1);
    });
  });

  describe('Error cases', () => {
    it('should throw an error when session is not found', async () => {
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

      await expect(handler({ sessionId: 'non-existent-id' })).rejects.toThrow('Session not found');
    });
  });
});
