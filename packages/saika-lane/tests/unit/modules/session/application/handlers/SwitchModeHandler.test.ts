// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SwitchModeInput } from '@/main/composition/tokens';
import { createSwitchModeHandler } from '@/main/modules/session/application/handlers/SwitchModeHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Session } from '@/main/modules/session/domain/Session';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createSwitchModeHandler', () => {
  let handler: CommandHandler<SwitchModeInput>;
  let mockSessionRepository: ISessionRepository;
  let mockEventBus: IEventBus;
  let testSession: Session;

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

    // Create test session (starting in sighting mode)
    testSession = Session.create(Discipline.airRifle10m());

    // Create handler
    handler = createSwitchModeHandler(mockSessionRepository, mockEventBus);
  });

  describe('Success cases', () => {
    it('should switch from sighting mode to match mode', async () => {
      // Arrange
      const newMode = Mode.match();

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);

      // Act
      await handler({ sessionId: testSession.id, mode: newMode });

      // Assert
      expect(mockSessionRepository.findById).toHaveBeenCalledWith(testSession.id);
      expect(mockSessionRepository.save).toHaveBeenCalledTimes(1);

      const savedSession = (mockSessionRepository.save as any).mock.calls[0][0];
      expect(savedSession.mode).toBe(newMode);
    });

    it('should switch from match mode to sighting mode', async () => {
      // Arrange
      // First switch to match mode
      const matchSession = testSession.switchMode(Mode.match());
      const newMode = Mode.sighting();

      (mockSessionRepository.findById as any).mockResolvedValue(matchSession);

      // Act
      await handler({ sessionId: matchSession.id, mode: newMode });

      // Assert
      const savedSession = (mockSessionRepository.save as any).mock.calls[0][0];
      expect(savedSession.mode).toBe(newMode);
    });

    it('should emit a ModeSwitched event', async () => {
      // Arrange
      const newMode = Mode.match();

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);

      // Act
      await handler({ sessionId: testSession.id, mode: newMode });

      // Assert
      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ModeSwitched',
          aggregateId: testSession.id,
          previousMode: testSession.mode,
          newMode,
        }),
      );
    });
  });

  describe('Error cases', () => {
    it('should throw an error when session is not found', async () => {
      // Arrange
      const newMode = Mode.match();

      (mockSessionRepository.findById as any).mockResolvedValue(null);

      // Act & Assert
      await expect(handler({ sessionId: 'non-existent-id', mode: newMode })).rejects.toThrow('Session not found');
    });

    it('should throw an error when repository save fails', async () => {
      // Arrange
      const newMode = Mode.match();

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockSessionRepository.save as any).mockRejectedValue(new Error('Repository save failed'));

      // Act & Assert
      await expect(handler({ sessionId: testSession.id, mode: newMode })).rejects.toThrow('Repository save failed');
    });

    it('should throw an error when event bus emit fails', async () => {
      // Arrange
      const newMode = Mode.match();

      (mockSessionRepository.findById as any).mockResolvedValue(testSession);
      (mockEventBus.emit as any).mockImplementation(() => {
        throw new Error('EventBus emit failed');
      });

      // Act & Assert
      await expect(handler({ sessionId: testSession.id, mode: newMode })).rejects.toThrow('EventBus emit failed');
    });
  });
});
