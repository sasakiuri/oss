// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StartSessionInput } from '@/main/composition/tokens';
import { createStartSessionHandler } from '@/main/modules/session/application/handlers/StartSessionHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Session } from '@/main/modules/session/domain/Session';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createStartSessionHandler', () => {
  let handler: CommandHandler<StartSessionInput>;
  let mockSessionRepository: ISessionRepository;
  let mockEventBus: IEventBus;

  beforeEach(() => {
    // Create mock repository
    mockSessionRepository = {
      save: vi.fn(),
      saveShot: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      findActive: vi.fn(),
    };

    // Create mock event bus
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };

    // Create handler
    handler = createStartSessionHandler(mockSessionRepository, mockEventBus);
  });

  describe('Success cases', () => {
    it('should create a new session and save it to the repository', async () => {
      // Arrange
      const discipline = Discipline.airRifle10m();

      // Act
      await handler({ discipline });

      // Assert
      expect(mockSessionRepository.save).toHaveBeenCalledTimes(1);
      const savedSession = (mockSessionRepository.save as any).mock.calls[0][0];
      expect(savedSession).toBeInstanceOf(Session);
      expect(savedSession.discipline).toBe(discipline);
      expect(savedSession.isFinished).toBe(false);
    });

    it('should emit a SessionStarted event', async () => {
      // Arrange
      const discipline = Discipline.airRifle10m();

      // Act
      await handler({ discipline });

      // Assert
      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SessionStarted',
          discipline,
        }),
      );
    });

    it('should create multiple sessions with different disciplines', async () => {
      // Act
      await handler({ discipline: Discipline.airRifle10m() });
      await handler({ discipline: Discipline.airPistol10m() });

      // Assert
      expect(mockSessionRepository.save).toHaveBeenCalledTimes(2);
      expect(mockEventBus.emit).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error cases', () => {
    it('should throw an error when repository save fails', async () => {
      // Arrange
      const discipline = Discipline.airRifle10m();
      const error = new Error('Repository save failed');
      (mockSessionRepository.save as any).mockRejectedValue(error);

      // Act & Assert
      await expect(handler({ discipline })).rejects.toThrow('Repository save failed');
    });

    it('should throw an error when event bus emit fails', async () => {
      // Arrange
      const discipline = Discipline.airRifle10m();
      const error = new Error('EventBus emit failed');
      (mockEventBus.emit as any).mockImplementation(() => {
        throw error;
      });

      // Act & Assert
      await expect(handler({ discipline })).rejects.toThrow('EventBus emit failed');
    });
  });
});
