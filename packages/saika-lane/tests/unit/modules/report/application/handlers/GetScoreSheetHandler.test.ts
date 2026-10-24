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
      saveReset: vi.fn(),
      readResetEpoch: vi.fn().mockResolvedValue(null),
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
      expect(result.allShots.map((s) => s.seriesNumber)).toEqual([1, 1]);
      expect(result.seriesScores).toEqual([185]);
      expect(result.totalScore).toBe(185);
      expect(result.totalIntegerScore).toBe(18);
    });

    it.each([
      Discipline.beamPistol10m(),
      Discipline.beamRifle10m(),
      Discipline.airPistol10m(),
      Discipline.airRifle10m(),
    ])('should print sighting shots in ten-shot series for $value', async (discipline) => {
      let session = Session.create(discipline);
      const scores = [...Array<number>(10).fill(100), ...Array<number>(10).fill(90), 80];
      for (const score of scores) {
        session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(score), new Date());
      }
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.allShots).toHaveLength(21);
      expect(result.seriesScores).toEqual([1000, 900, 80]);
      expect(result.totalScore).toBe(1980);
      expect(result.totalIntegerScore).toBe(198);
      for (const seriesNumber of [1, 2]) {
        expect(
          result.allShots.filter((shot) => shot.seriesNumber === seriesNumber).map((shot) => shot.shotNumber),
        ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      }
      expect(result.allShots[20]).toEqual({
        shotNumber: 1,
        value: 80,
        integerValue: 8,
        seriesNumber: 3,
        x: 0.1,
        y: 0.2,
      });
      expect(session.sightingShots.every((shot) => shot.seriesNumber === 0)).toBe(true);
    });

    it('should keep six ten-shot beam pistol match series and exclude sighting shots', async () => {
      let session = Session.create(Discipline.beamPistol10m(), 'RING');
      session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(100), new Date());
      session = session.switchMode(Mode.match());
      for (const score of [100, 90, 80, 70, 60, 50]) {
        for (let i = 0; i < 10; i++) {
          session = session.recordShot(new ImpactPoint(0.3, 0.4), new Score(score), new Date());
        }
      }
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.allShots).toHaveLength(60);
      expect(result.seriesScores).toEqual([1000, 900, 800, 700, 600, 500]);
      expect(result.totalScore).toBe(4500);
      expect(result.totalIntegerScore).toBe(450);
      for (const seriesNumber of [2, 3, 4, 5, 6, 7]) {
        expect(
          result.allShots.filter((shot) => shot.seriesNumber === seriesNumber).map((shot) => shot.shotNumber),
        ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      }
    });

    it('should preserve five-shot and single-shot match series', async () => {
      let session = Session.create(Discipline.beamPistol10m()).switchMode(Mode.match(), 5);
      for (const score of [...Array<number>(5).fill(100), ...Array<number>(5).fill(90)]) {
        session = session.recordShot(new ImpactPoint(0.1, 0.2), new Score(score), new Date());
      }
      session = session.resetSeries(1);
      session = session.recordShot(null, new Score(0), new Date());
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      const result = await handler({ sessionId: session.id });

      expect(result.seriesScores).toEqual([500, 450, 0]);
      expect(result.allShots.filter((shot) => shot.seriesNumber === 2)).toHaveLength(5);
      expect(result.allShots.filter((shot) => shot.seriesNumber === 3)).toHaveLength(5);
      expect(result.allShots[10]).toEqual({
        shotNumber: 1,
        value: 0,
        integerValue: 0,
        seriesNumber: 4,
        x: null,
        y: null,
      });
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
      expect(result.allShots.map((s) => s.seriesNumber)).toEqual([1, 1]);
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
