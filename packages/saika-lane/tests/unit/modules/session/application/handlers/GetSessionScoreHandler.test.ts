// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetSessionScoreInput } from '@/main/composition/tokens';
import type { SessionScoreDto } from '@/main/modules/session/application/dto';
import { createGetSessionScoreHandler } from '@/main/modules/session/application/handlers/GetSessionScoreHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import type { QueryHandler } from '@/main/shared-infra/cqrs';

describe('createGetSessionScoreHandler', () => {
  let handler: QueryHandler<GetSessionScoreInput, SessionScoreDto>;
  let mockSessionRepo: ISessionRepository;

  beforeEach(() => {
    // Create mock repository
    mockSessionRepo = {
      save: vi.fn(),
      saveShot: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      findActive: vi.fn(),
    };

    handler = createGetSessionScoreHandler(mockSessionRepo);
  });

  describe('Success cases', () => {
    it('should return a SessionScoreDto when session is found', async () => {
      // Arrange: Create test session
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline);

      // Switch to match mode
      let updatedSession = session.switchMode(Mode.match());

      // Add shots (10 shots)
      const shots = [
        { x: 0.1, y: 0.2, score: 105 },
        { x: 0.3, y: 0.4, score: 102 },
        { x: 0.5, y: 0.6, score: 98 },
        { x: 0.7, y: 0.8, score: 95 },
        { x: 0.9, y: 1.0, score: 99 },
        { x: 1.1, y: 1.2, score: 101 },
        { x: 1.3, y: 1.4, score: 100 },
        { x: 1.5, y: 1.6, score: 97 },
        { x: 1.7, y: 1.8, score: 94 },
        { x: 1.9, y: 2.0, score: 94 },
      ];

      for (const shot of shots) {
        const impactPoint = new ImpactPoint(shot.x, shot.y);
        const score = new Score(shot.score);
        updatedSession = updatedSession.recordShot(impactPoint, score, new Date());
      }

      // Set up repository mock
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(updatedSession);

      // Act: Execute handler
      const result = await handler({ sessionId: updatedSession.id });

      // Assert: DTO is returned correctly
      expect(result).toEqual({
        sessionId: updatedSession.id,
        totalScore: 985,
        seriesScores: [985],
        shotCount: 10,
        discipline: 'AIR_RIFLE_10M',
        mode: 'MATCH',
      });

      expect(mockSessionRepo.findById).toHaveBeenCalledWith(updatedSession.id);
      expect(mockSessionRepo.findById).toHaveBeenCalledTimes(1);
    });

    it('should include each series score in seriesScores for multiple series', async () => {
      // Arrange: Create session with multiple series
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline).switchMode(Mode.match());

      // Series 1 (10 shots, 100.0 points)
      for (let i = 0; i < 10; i++) {
        const impactPoint = new ImpactPoint(0.1, 0.2);
        const score = new Score(100);
        session = session.recordShot(impactPoint, score, new Date());
      }

      // Series 2 (10 shots, 95.0 points)
      for (let i = 0; i < 10; i++) {
        const impactPoint = new ImpactPoint(0.5, 0.6);
        const score = new Score(95);
        session = session.recordShot(impactPoint, score, new Date());
      }

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      // Act
      const result = await handler({ sessionId: session.id });

      // Assert: Each series score is included
      expect(result.seriesScores).toEqual([1000, 950]);
      expect(result.totalScore).toBe(1950);
      expect(result.shotCount).toBe(20);
    });

    it('should return a correct DTO for a sighting mode session', async () => {
      // Arrange: Sighting mode session
      const discipline = Discipline.airPistol10m();
      let session = Session.create(discipline);

      // Add sighting shots (5 shots)
      for (let i = 0; i < 5; i++) {
        const impactPoint = new ImpactPoint(0.1, 0.2);
        const score = new Score(95);
        session = session.recordShot(impactPoint, score, new Date());
      }

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      // Act
      const result = await handler({ sessionId: session.id });

      // Assert: Sighting mode is returned correctly (sighting shots are not counted in total score)
      expect(result.mode).toBe('SIGHTING');
      expect(result.shotCount).toBe(5);
      expect(result.totalScore).toBe(0); // Sighting shots are not included in total score
    });
  });

  describe('Error cases', () => {
    it('should throw an error when session is not found', async () => {
      // Arrange
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(handler({ sessionId: 'non-existent-id' })).rejects.toThrow('Session not found');
      expect(mockSessionRepo.findById).toHaveBeenCalledWith('non-existent-id');
    });

    it('should propagate the error when repository throws', async () => {
      // Arrange
      const error = new Error('Database connection error');
      vi.mocked(mockSessionRepo.findById).mockRejectedValue(error);

      // Act & Assert
      await expect(handler({ sessionId: 'some-id' })).rejects.toThrow('Database connection error');
    });
  });

  describe('DTO field conversion', () => {
    it('should correctly convert domain entities to DTOs', async () => {
      // Arrange
      const discipline = Discipline.rifle50m();
      let session = Session.create(discipline).switchMode(Mode.match());

      // Add 1 shot
      const impactPoint = new ImpactPoint(1.0, 2.0);
      const score = new Score(103);
      session = session.recordShot(impactPoint, score, new Date());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      // Act
      const result = await handler({ sessionId: session.id });

      // Assert: Each field is correctly converted to a primitive type
      expect(typeof result.sessionId).toBe('string');
      expect(typeof result.totalScore).toBe('number');
      expect(Array.isArray(result.seriesScores)).toBe(true);
      expect(result.seriesScores.every((s) => typeof s === 'number')).toBe(true);
      expect(typeof result.shotCount).toBe('number');
      expect(typeof result.discipline).toBe('string');
      expect(typeof result.mode).toBe('string');

      // Verify values
      expect(result.sessionId).toBe(session.id);
      expect(result.totalScore).toBe(103);
      expect(result.seriesScores).toEqual([103]);
      expect(result.shotCount).toBe(1);
      expect(result.discipline).toBe('RIFLE_50M');
      expect(result.mode).toBe('MATCH');
    });
  });
});
