// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecordShotInput } from '@/main/composition/tokens';
import { createRecordShotHandler } from '@/main/modules/session/application/handlers/RecordShotHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Score } from '@/main/modules/session/domain/Score';
import { ScoreCalculationService } from '@/main/modules/session/domain/ScoreCalculationService';
import { ScoreDiscrepancyDetector } from '@/main/modules/session/domain/ScoreDiscrepancyDetector';
import { Session } from '@/main/modules/session/domain/Session';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

// Mock getLogger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => mockLogger,
}));

describe('createRecordShotHandler', () => {
  let handler: CommandHandler<RecordShotInput>;
  let mockSessionRepository: ISessionRepository;
  let mockEventBus: IEventBus;
  let mockScoreService: ScoreCalculationService;
  let mockDiscrepancyDetector: ScoreDiscrepancyDetector;
  let testSession: Session;

  beforeEach(() => {
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();

    mockSessionRepository = {
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

    mockScoreService = {
      calculateScore: vi.fn(),
      getTargetDesign: vi.fn(),
      isInnerTen: vi.fn().mockReturnValue(false),
    };

    mockDiscrepancyDetector = {
      detect: vi.fn(),
    } as unknown as ScoreDiscrepancyDetector;

    testSession = Session.create(Discipline.airRifle10m());

    handler = createRecordShotHandler(mockSessionRepository, mockScoreService, mockEventBus, mockDiscrepancyDetector);
  });

  describe('Success cases', () => {
    it('should retrieve the session and record an impact point', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const score = new Score(105);

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockScoreService.calculateScore as any).mockReturnValue(score);

      await handler({
        sessionId: testSession.id,
        impactPoint,
        timestamp: new Date(),
      });

      expect(mockSessionRepository.findById).toHaveBeenCalledWith(testSession.id);
      expect(mockScoreService.calculateScore).toHaveBeenCalledWith(impactPoint, testSession.discipline);
      expect(mockSessionRepository.saveShot).toHaveBeenCalledTimes(1);
    });

    it('should emit a ShotRecorded event', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const score = new Score(105);

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockScoreService.calculateScore as any).mockReturnValue(score);

      await handler({
        sessionId: testSession.id,
        impactPoint,
        timestamp: new Date(),
      });

      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ShotRecorded',
          aggregateId: testSession.id,
        }),
      );
    });

    it('should record multiple impact points sequentially', async () => {
      const impactPoint1 = new ImpactPoint(5.2, -3.8);
      const impactPoint2 = new ImpactPoint(-2.1, 4.5);
      const score = new Score(105);

      (mockScoreService.calculateScore as any).mockReturnValue(score);

      let updatedSession = testSession;
      (mockSessionRepository.findById as any).mockResolvedValue(updatedSession);
      await handler({
        sessionId: testSession.id,
        impactPoint: impactPoint1,
        timestamp: new Date(),
      });

      const savedSession = (mockSessionRepository.saveShot as any).mock.calls[0][0];
      updatedSession = savedSession;
      (mockSessionRepository.findById as any).mockResolvedValue(updatedSession);
      await handler({
        sessionId: testSession.id,
        impactPoint: impactPoint2,
        timestamp: new Date(),
      });

      expect(mockSessionRepository.saveShot).toHaveBeenCalledTimes(2);
      expect(mockEventBus.emit).toHaveBeenCalledTimes(2);
    });

    it('should use the device score when provided', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const calculatedScore = new Score(105);
      const deviceScore = 103;

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockScoreService.calculateScore as any).mockReturnValue(calculatedScore);

      await handler({
        sessionId: testSession.id,
        impactPoint,
        timestamp: new Date(),
        deviceScore,
      });

      expect(mockSessionRepository.saveShot).toHaveBeenCalledTimes(1);
      const saved = (mockSessionRepository.saveShot as any).mock.calls[0][0];
      const lastShot = saved.allShots[saved.allShots.length - 1];
      expect(lastShot.score.value).toBe(103);
      expect(lastShot.deviceScore?.value).toBe(103);
    });

    it('should use the calculated score when device score is not provided', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const calculatedScore = new Score(105);

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockScoreService.calculateScore as any).mockReturnValue(calculatedScore);

      await handler({
        sessionId: testSession.id,
        impactPoint,
        timestamp: new Date(),
      });

      expect(mockSessionRepository.saveShot).toHaveBeenCalledTimes(1);
      const saved = (mockSessionRepository.saveShot as any).mock.calls[0][0];
      const lastShot = saved.allShots[saved.allShots.length - 1];
      expect(lastShot.score.value).toBe(105);
      expect(lastShot.deviceScore).toBeUndefined();
    });

    it('should call calculateScore for beam rifle discipline as well', async () => {
      const beamSession = Session.create(Discipline.beamRifle10m());
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const score = new Score(105);

      (mockSessionRepository.findById as any).mockResolvedValue(beamSession);
      (mockScoreService.calculateScore as any).mockReturnValue(score);

      await handler({
        sessionId: beamSession.id,
        impactPoint,
        timestamp: new Date(),
      });

      expect(mockScoreService.calculateScore).toHaveBeenCalledWith(impactPoint, beamSession.discipline);
    });

    it('should call discrepancyDetector.detect when device score is provided', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const calculatedScore = new Score(105);
      const deviceScore = 98;

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockScoreService.calculateScore as any).mockReturnValue(calculatedScore);

      await handler({
        sessionId: testSession.id,
        impactPoint,
        timestamp: new Date(),
        deviceScore,
      });

      expect(mockDiscrepancyDetector.detect).toHaveBeenCalledTimes(1);
      expect(mockDiscrepancyDetector.detect).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceScore: 98,
          calculatedScore,
          impactPoint,
          sessionId: testSession.id,
          discipline: testSession.discipline.value,
          mode: testSession.mode.value,
        }),
      );
    });

    it('should not call discrepancyDetector.detect when device score is not provided', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const calculatedScore = new Score(105);

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockScoreService.calculateScore as any).mockReturnValue(calculatedScore);

      await handler({
        sessionId: testSession.id,
        impactPoint,
        timestamp: new Date(),
      });

      expect(mockDiscrepancyDetector.detect).not.toHaveBeenCalled();
    });
  });

  describe('RING/DECIMAL scoring mode', () => {
    it('should store decimal score as-is in DECIMAL mode (9.7 -> 97)', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const deviceScore = 97;

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockScoreService.calculateScore as any).mockReturnValue(new Score(97));

      await handler({
        sessionId: testSession.id,
        impactPoint,
        timestamp: new Date(),
        deviceScore,
      });

      const saved = (mockSessionRepository.saveShot as any).mock.calls[0][0];
      const lastShot = saved.allShots[saved.allShots.length - 1];
      expect(lastShot.score.value).toBe(97);
    });

    it('should floor the device score in RING mode (97 -> 90)', async () => {
      const ringSession = Session.create(Discipline.beamRifle10m(), 'RING');
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const deviceScore = 97;

      (mockSessionRepository.findById as any).mockResolvedValue(ringSession);
      (mockScoreService.calculateScore as any).mockReturnValue(new Score(97));

      await handler({
        sessionId: ringSession.id,
        impactPoint,
        timestamp: new Date(),
        deviceScore,
      });

      const saved = (mockSessionRepository.saveShot as any).mock.calls[0][0];
      const lastShot = saved.allShots[saved.allShots.length - 1];
      expect(lastShot.score.value).toBe(90);
    });

    it('should floor the calculated score in RING mode (89 -> 80)', async () => {
      const ringSession = Session.create(Discipline.beamRifle10m(), 'RING');
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const calculatedScore = new Score(89);

      (mockSessionRepository.findById as any).mockResolvedValue(ringSession);
      (mockScoreService.calculateScore as any).mockReturnValue(calculatedScore);

      await handler({
        sessionId: ringSession.id,
        impactPoint,
        timestamp: new Date(),
      });

      const saved = (mockSessionRepository.saveShot as any).mock.calls[0][0];
      const lastShot = saved.allShots[saved.allShots.length - 1];
      expect(lastShot.score.value).toBe(80);
    });

    it('should keep integer score (100) as 100 in RING mode', async () => {
      const ringSession = Session.create(Discipline.beamRifle10m(), 'RING');
      const impactPoint = new ImpactPoint(0, 0);
      const deviceScore = 100;

      (mockSessionRepository.findById as any).mockResolvedValue(ringSession);
      (mockScoreService.calculateScore as any).mockReturnValue(new Score(100));

      await handler({
        sessionId: ringSession.id,
        impactPoint,
        timestamp: new Date(),
        deviceScore,
      });

      const saved = (mockSessionRepository.saveShot as any).mock.calls[0][0];
      const lastShot = saved.allShots[saved.allShots.length - 1];
      expect(lastShot.score.value).toBe(100);
    });
  });

  describe('Error cases', () => {
    it('should throw an error when session is not found', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      (mockSessionRepository.findById as any).mockResolvedValue(null);

      await expect(
        handler({
          sessionId: 'non-existent-id',
          impactPoint,
          timestamp: new Date(),
        }),
      ).rejects.toThrow('Session not found');
    });

    it('should throw an error when repository save fails', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const score = new Score(105);

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockScoreService.calculateScore as any).mockReturnValue(score);
      (mockSessionRepository.saveShot as any).mockRejectedValue(new Error('Repository save failed'));

      await expect(
        handler({
          sessionId: testSession.id,
          impactPoint,
          timestamp: new Date(),
        }),
      ).rejects.toThrow('Repository save failed');
    });

    it('should throw an error when event bus emit fails', async () => {
      const impactPoint = new ImpactPoint(5.2, -3.8);
      const score = new Score(105);

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockScoreService.calculateScore as any).mockReturnValue(score);
      (mockEventBus.emit as any).mockImplementation(() => {
        throw new Error('EventBus emit failed');
      });

      await expect(
        handler({
          sessionId: testSession.id,
          impactPoint,
          timestamp: new Date(),
        }),
      ).rejects.toThrow('EventBus emit failed');
    });
  });
});
