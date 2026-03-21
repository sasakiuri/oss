// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GetShotHistoryInput } from '@/main/composition/tokens';
import type { ShotHistoryDto } from '@/main/modules/session/application/dto';
import { createGetShotHistoryHandler } from '@/main/modules/session/application/handlers/GetShotHistoryHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Session } from '@/main/modules/session/domain/Session';
import type { QueryHandler } from '@/main/shared-infra/cqrs';

describe('createGetShotHistoryHandler', () => {
  let handler: QueryHandler<GetShotHistoryInput, ShotHistoryDto>;
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

    handler = createGetShotHistoryHandler(mockSessionRepo);
  });

  describe('Success cases', () => {
    it('should return a ShotHistoryDto when session is found', async () => {
      // Arrange: Create test session
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline).switchMode(Mode.match());

      // Add shots (3 shots)
      const shotData = [
        { x: 0.1, y: 0.2, score: 105 },
        { x: 0.3, y: 0.4, score: 102 },
        { x: 0.5, y: 0.6, score: 98 },
      ];

      for (const shot of shotData) {
        const impactPoint = new ImpactPoint(shot.x, shot.y);
        const score = new Score(shot.score);
        session = session.recordShot(impactPoint, score, new Date());
      }

      // Set up repository mock
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      // Act: Execute handler
      const result = await handler({ sessionId: session.id });

      // Assert: DTO is returned correctly
      expect(result.sessionId).toBe(session.id);
      expect(result.shots).toHaveLength(3);

      // Verify each shot
      result.shots.forEach((shot, index) => {
        expect(shot.id).toBe(session.allShots[index]?.id);
        expect(shot.shotNumber).toBe(index + 1);
        expect(shot.x).toBe(shotData[index]?.x);
        expect(shot.y).toBe(shotData[index]?.y);
        expect(shot.score).toBe(shotData[index]!.score);
        expect(shot.mode).toBe('MATCH');
        expect(shot.isRecorded).toBe(true);
        expect(typeof shot.timestamp).toBe('string');
        expect(new Date(shot.timestamp).toString()).not.toBe('Invalid Date');
      });

      expect(mockSessionRepo.findById).toHaveBeenCalledWith(session.id);
      expect(mockSessionRepo.findById).toHaveBeenCalledTimes(1);
    });

    it('should set isRecorded to false for sighting shots', async () => {
      // Arrange: Sighting mode session
      const discipline = Discipline.airPistol10m();
      let session = Session.create(discipline); // Default is sighting mode

      // Add sighting shots
      const impactPoint = new ImpactPoint(1.0, 2.0);
      const score = new Score(95);
      session = session.recordShot(impactPoint, score, new Date());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      // Act
      const result = await handler({ sessionId: session.id });

      // Assert: Sighting shots have isRecorded=false
      expect(result.shots).toHaveLength(1);
      expect(result.shots[0]?.mode).toBe('SIGHTING');
      expect(result.shots[0]?.isRecorded).toBe(false);
    });

    it('should set flags correctly when sighting and match shots are mixed', async () => {
      // Arrange: Session with mixed sighting and match shots
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline);

      // Sighting shots (2 shots)
      for (let i = 0; i < 2; i++) {
        const impactPoint = new ImpactPoint(0.1, 0.2);
        const score = new Score(95);
        session = session.recordShot(impactPoint, score, new Date());
      }

      // Switch to match mode
      session = session.switchMode(Mode.match());

      // Match shots (3 shots)
      for (let i = 0; i < 3; i++) {
        const impactPoint = new ImpactPoint(0.3, 0.4);
        const score = new Score(100);
        session = session.recordShot(impactPoint, score, new Date());
      }

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      // Act
      const result = await handler({ sessionId: session.id });

      // Assert: Distinguish between sighting and match shots
      expect(result.shots).toHaveLength(5);
      expect(result.shots[0]?.isRecorded).toBe(false); // Sighting
      expect(result.shots[1]?.isRecorded).toBe(false); // Sighting
      expect(result.shots[2]?.isRecorded).toBe(true); // Match
      expect(result.shots[3]?.isRecorded).toBe(true); // Match
      expect(result.shots[4]?.isRecorded).toBe(true); // Match
    });

    it('should return an empty array when there are no shots', async () => {
      // Arrange: Session with no shots
      const discipline = Discipline.airRifle10m();
      const session = Session.create(discipline);

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      // Act
      const result = await handler({ sessionId: session.id });

      // Assert: Empty array
      expect(result.sessionId).toBe(session.id);
      expect(result.shots).toEqual([]);
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
    it('should correctly convert domain Shot entities to ShotDtos', async () => {
      // Arrange
      const discipline = Discipline.rifle50m();
      let session = Session.create(discipline).switchMode(Mode.match());

      // Add 1 shot
      const impactPoint = new ImpactPoint(1.5, 2.5);
      const score = new Score(103);
      session = session.recordShot(impactPoint, score, new Date());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      // Act
      const result = await handler({ sessionId: session.id });

      // Assert: Each field is correctly converted to a primitive type
      expect(result.shots).toHaveLength(1);

      const shotDto = result.shots[0];
      if (shotDto) {
        expect(typeof shotDto.id).toBe('string');
        expect(typeof shotDto.shotNumber).toBe('number');
        expect(typeof shotDto.x).toBe('number');
        expect(typeof shotDto.y).toBe('number');
        expect(typeof shotDto.score).toBe('number');
        expect(typeof shotDto.timestamp).toBe('string');
        expect(typeof shotDto.mode).toBe('string');
        expect(typeof shotDto.isRecorded).toBe('boolean');

        // Verify values
        expect(shotDto.shotNumber).toBe(1);
        expect(shotDto.x).toBe(1.5);
        expect(shotDto.y).toBe(2.5);
        expect(shotDto.score).toBe(103);
        expect(shotDto.mode).toBe('MATCH');
        expect(shotDto.isRecorded).toBe(true);

        // Timestamp should be an ISO format string
        expect(() => new Date(shotDto.timestamp)).not.toThrow();
      }
    });

    it('should convert timestamp to ISO format string', async () => {
      // Arrange
      const discipline = Discipline.airRifle10m();
      let session = Session.create(discipline).switchMode(Mode.match());

      const impactPoint = new ImpactPoint(0.1, 0.2);
      const score = new Score(100);
      session = session.recordShot(impactPoint, score, new Date());

      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session);

      // Act
      const result = await handler({ sessionId: session.id });

      // Assert: ISO format string
      const shot = result.shots[0];
      if (shot) {
        expect(shot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

        // Should be convertible from ISO format to Date
        const date = new Date(shot.timestamp);
        expect(date.toString()).not.toBe('Invalid Date');
      }
    });
  });
});
