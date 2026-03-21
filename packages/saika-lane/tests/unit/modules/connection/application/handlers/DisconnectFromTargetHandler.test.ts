// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DisconnectFromTargetInput } from '@/main/composition/tokens';
import { createDisconnectFromTargetHandler } from '@/main/modules/connection/application/handlers/DisconnectFromTargetHandler';
import { Connection } from '@/main/modules/connection/domain/Connection';
import { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createDisconnectFromTargetHandler', () => {
  let handler: CommandHandler<DisconnectFromTargetInput>;
  let mockConnectionRepository: IConnectionRepository;
  let mockEventBus: IEventBus;
  let mockUSBManager: IUSBConnectionManager;
  let testConnection: Connection;

  beforeEach(() => {
    // Create mock repository
    mockConnectionRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      findActive: vi.fn(),
      findHistory: vi.fn(),
    };

    // Create mock event bus
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };

    // Create mock USB connection manager
    mockUSBManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      reconnect: vi.fn(),
      getStatus: vi.fn(),
      listPorts: vi.fn(),
      on: vi.fn().mockReturnValue(vi.fn()),
      setSessionContextProvider: vi.fn(),
      setOnShotDetected: vi.fn(),
      resetShotCounter: vi.fn(),
      sendMode: vi.fn().mockResolvedValue(undefined),
    };

    // Create test connection (connected state)
    testConnection = Connection.create({
      manufacturer: TargetManufacturer.sius(),
      portPath: 'COM3',
      baudRate: 9600,
    }).connect();

    // Create handler
    handler = createDisconnectFromTargetHandler(mockConnectionRepository, mockUSBManager, mockEventBus);
  });

  describe('Success cases', () => {
    it('should retrieve the connection and disconnect using USB connection manager', async () => {
      // Arrange
      (mockConnectionRepository.findById as any).mockResolvedValue(testConnection);

      // Act
      await handler({ connectionId: testConnection.id });

      // Assert
      expect(mockConnectionRepository.findById).toHaveBeenCalledWith(testConnection.id);
      expect(mockUSBManager.disconnect).toHaveBeenCalledTimes(1);
      expect(mockConnectionRepository.save).toHaveBeenCalledTimes(1);

      const savedConnection = (mockConnectionRepository.save as any).mock.calls[0][0];
      expect(savedConnection.isDisconnected).toBe(true);
    });

    it('should emit a ConnectionLost event', async () => {
      // Arrange
      (mockConnectionRepository.findById as any).mockResolvedValue(testConnection);

      // Act
      await handler({ connectionId: testConnection.id });

      // Assert
      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ConnectionLost',
          aggregateId: testConnection.id,
          reason: 'User requested disconnection',
        }),
      );
    });
  });

  describe('Error cases', () => {
    it('should throw an error when connection is not found', async () => {
      // Arrange
      (mockConnectionRepository.findById as any).mockResolvedValue(null);

      // Act & Assert
      await expect(handler({ connectionId: 'non-existent-id' })).rejects.toThrow('Connection not found');
    });

    it('should throw an error when USB disconnection fails', async () => {
      // Arrange
      (mockConnectionRepository.findById as any).mockResolvedValue(testConnection);
      (mockUSBManager.disconnect as any).mockRejectedValue(new Error('USB disconnection failed'));

      // Act & Assert
      await expect(handler({ connectionId: testConnection.id })).rejects.toThrow('USB disconnection failed');
    });

    it('should throw an error when repository save fails', async () => {
      // Arrange
      (mockConnectionRepository.findById as any).mockResolvedValue(testConnection);
      (mockConnectionRepository.save as any).mockRejectedValue(new Error('Repository save failed'));

      // Act & Assert
      await expect(handler({ connectionId: testConnection.id })).rejects.toThrow('Repository save failed');
    });

    it('should throw an error when event bus emit fails', async () => {
      // Arrange
      (mockConnectionRepository.findById as any).mockResolvedValue(testConnection);
      (mockEventBus.emit as any).mockImplementation(() => {
        throw new Error('EventBus emit failed');
      });

      // Act & Assert
      await expect(handler({ connectionId: testConnection.id })).rejects.toThrow('EventBus emit failed');
    });
  });
});
