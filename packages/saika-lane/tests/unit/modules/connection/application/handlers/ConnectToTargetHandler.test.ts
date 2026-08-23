// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConnectToTargetInput } from '@/main/composition/tokens';
import { createConnectToTargetHandler } from '@/main/modules/connection/application/handlers/ConnectToTargetHandler';
import { Connection } from '@/main/modules/connection/domain/Connection';
import { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { Mode } from '@/main/modules/session/domain/Mode';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

describe('createConnectToTargetHandler', () => {
  let handler: CommandHandler<ConnectToTargetInput>;
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

    // Create test connection
    testConnection = Connection.create({
      manufacturer: TargetManufacturer.sius(),
      portPath: 'COM3',
      baudRate: 9600,
    }).connect();

    // Create handler
    handler = createConnectToTargetHandler(mockConnectionRepository, mockUSBManager, mockEventBus, () =>
      Mode.sighting(),
    );
  });

  describe('Success cases', () => {
    it('should connect using USB connection manager and create a Connection entity', async () => {
      // Arrange
      const manufacturer = TargetManufacturer.sius();
      const portName = 'COM3';
      const baudRate = 9600;

      (mockUSBManager.connect as any).mockResolvedValue(testConnection);

      // Act
      await handler({ portName, manufacturer, baudRate });

      // Assert
      expect(mockUSBManager.connect).toHaveBeenCalledWith({
        portName,
        manufacturer,
        baudRate,
        deviceId: undefined,
      });
      expect(mockConnectionRepository.save).toHaveBeenCalledTimes(1);
      const savedConnection = (mockConnectionRepository.save as any).mock.calls[0][0];
      expect(savedConnection).toBeInstanceOf(Connection);
    });

    it('should emit a ConnectionEstablished event', async () => {
      // Arrange
      const manufacturer = TargetManufacturer.sius();
      const portName = 'COM3';
      const baudRate = 9600;

      (mockUSBManager.connect as any).mockResolvedValue(testConnection);

      // Act
      await handler({ portName, manufacturer, baudRate });

      // Assert
      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ConnectionEstablished',
          manufacturer,
          portPath: portName,
        }),
      );
    });

    it('should synchronize the target with the current match mode after connecting', async () => {
      (mockUSBManager.connect as any).mockResolvedValue(testConnection);
      const matchMode = Mode.match();
      handler = createConnectToTargetHandler(mockConnectionRepository, mockUSBManager, mockEventBus, () => matchMode);

      await handler({
        portName: 'COM3',
        manufacturer: TargetManufacturer.sius(),
        baudRate: 9600,
      });

      expect(mockUSBManager.sendMode).toHaveBeenCalledWith(matchMode);
    });

    it('should connect without specifying a baud rate', async () => {
      // Arrange
      const manufacturer = TargetManufacturer.sius();
      const portName = 'COM3';

      (mockUSBManager.connect as any).mockResolvedValue(testConnection);

      // Act
      await handler({ portName, manufacturer });

      // Assert
      expect(mockUSBManager.connect).toHaveBeenCalledWith({
        portName,
        manufacturer,
        baudRate: undefined,
        deviceId: undefined,
      });
    });
  });

  describe('Error cases', () => {
    it('should throw an error when USB connection fails', async () => {
      // Arrange
      const manufacturer = TargetManufacturer.sius();
      const portName = 'COM3';
      const baudRate = 9600;

      (mockUSBManager.connect as any).mockRejectedValue(new Error('USB connection failed'));

      // Act & Assert
      await expect(handler({ portName, manufacturer, baudRate })).rejects.toThrow('USB connection failed');
    });

    it('should throw an error when repository save fails', async () => {
      // Arrange
      const manufacturer = TargetManufacturer.sius();
      const portName = 'COM3';
      const baudRate = 9600;

      (mockUSBManager.connect as any).mockResolvedValue(testConnection);
      (mockConnectionRepository.save as any).mockRejectedValue(new Error('Repository save failed'));

      // Act & Assert
      await expect(handler({ portName, manufacturer, baudRate })).rejects.toThrow('Repository save failed');
    });

    it('should throw an error when event bus emit fails', async () => {
      // Arrange
      const manufacturer = TargetManufacturer.sius();
      const portName = 'COM3';
      const baudRate = 9600;

      (mockUSBManager.connect as any).mockResolvedValue(testConnection);
      (mockEventBus.emit as any).mockImplementation(() => {
        throw new Error('EventBus emit failed');
      });

      // Act & Assert
      await expect(handler({ portName, manufacturer, baudRate })).rejects.toThrow('EventBus emit failed');
    });
  });
});
