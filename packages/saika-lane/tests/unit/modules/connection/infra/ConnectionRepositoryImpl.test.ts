// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionRepositoryImpl } from '@/main/modules/connection/infra/ConnectionRepositoryImpl';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { ILocalStorage } from '@/shared/storage/ILocalStorage';

describe('ConnectionRepositoryImpl', () => {
  let repository: ConnectionRepositoryImpl;
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

    repository = new ConnectionRepositoryImpl(mockStorage);
  });

  describe('save()', () => {
    it('should save a connection successfully', async () => {
      const manufacturer = TargetManufacturer.sius();
      const connection = Connection.create({
        manufacturer,
        portPath: 'COM3',
        baudRate: 9600,
      }).connect();

      await repository.save(connection);

      expect(mockStorage.set).toHaveBeenCalledTimes(2); // connection data + active key
      expect(mockStorage.set).toHaveBeenCalledWith(
        `connection:${connection.id}`,
        expect.objectContaining({
          id: connection.id,
          manufacturer: 'SIUS',
          portPath: 'COM3',
          baudRate: 9600,
        }),
      );
      expect(mockStorage.set).toHaveBeenCalledWith('connection:active', connection.id);
    });

    it('should not update active key for disconnected connections', async () => {
      const manufacturer = TargetManufacturer.sius();
      const connection = Connection.create({
        manufacturer,
        portPath: 'COM3',
        baudRate: 9600,
      });

      await repository.save(connection);

      expect(mockStorage.set).toHaveBeenCalledTimes(1); // connection data only
      expect(mockStorage.set).toHaveBeenCalledWith(`connection:${connection.id}`, expect.any(Object));
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      const manufacturer = TargetManufacturer.sius();
      const connection = Connection.create({
        manufacturer,
        portPath: 'COM3',
        baudRate: 9600,
      });
      vi.mocked(mockStorage.set).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.save(connection)).rejects.toThrow('Repository operation failed');
    });
  });

  describe('findById()', () => {
    it('should retrieve a connection by ID', async () => {
      const connectionId = 'test-connection-id';
      const mockData = {
        id: connectionId,
        manufacturer: 'SIUS',
        status: 'DISCONNECTED',
        portPath: 'COM3',
        baudRate: 9600,
        connectedAt: null,
        disconnectedAt: null,
        lastError: null,
      };

      vi.mocked(mockStorage.get).mockReturnValue(mockData);

      const connection = await repository.findById(connectionId);

      expect(connection).not.toBeNull();
      expect(connection?.id).toBe(connectionId);
      expect(mockStorage.get).toHaveBeenCalledWith(`connection:${connectionId}`);
    });

    it('should return null for a non-existent ID', async () => {
      vi.mocked(mockStorage.get).mockReturnValue(undefined);

      const connection = await repository.findById('non-existent-id');

      expect(connection).toBeNull();
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      vi.mocked(mockStorage.get).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.findById('test-id')).rejects.toThrow('Repository operation failed');
    });
  });

  describe('findAll()', () => {
    it('should retrieve all connections', async () => {
      const mockData = {
        'connection:id1': {
          id: 'id1',
          manufacturer: 'SIUS',
          status: 'CONNECTED',
          portPath: 'COM3',
          baudRate: 9600,
          connectedAt: new Date().toISOString(),
          disconnectedAt: null,
          lastError: null,
        },
        'connection:id2': {
          id: 'id2',
          manufacturer: 'MEYTON',
          status: 'DISCONNECTED',
          portPath: 'COM4',
          baudRate: 19200,
          connectedAt: null,
          disconnectedAt: null,
          lastError: null,
        },
        'connection:active': 'id1', // This should be excluded
        'other:key': 'value', // This should also be excluded
      };

      vi.mocked(mockStorage.getAll).mockReturnValue(mockData);

      const connections = await repository.findAll();

      expect(connections).toHaveLength(2);
      expect(connections[0]?.id).toBe('id1');
      expect(connections[1]?.id).toBe('id2');
    });

    it('should return an empty array when no connections exist', async () => {
      vi.mocked(mockStorage.getAll).mockReturnValue({});

      const connections = await repository.findAll();

      expect(connections).toEqual([]);
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      vi.mocked(mockStorage.getAll).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.findAll()).rejects.toThrow('Repository operation failed');
    });
  });

  describe('delete()', () => {
    it('should delete a connection successfully', async () => {
      const connectionId = 'test-connection-id';
      vi.mocked(mockStorage.get).mockReturnValue('other-id'); // active connection is different

      await repository.delete(connectionId);

      expect(mockStorage.delete).toHaveBeenCalledWith(`connection:${connectionId}`);
      expect(mockStorage.delete).toHaveBeenCalledTimes(1);
    });

    it('should also clear active key when deleting an active connection', async () => {
      const connectionId = 'test-connection-id';
      vi.mocked(mockStorage.get).mockReturnValue(connectionId); // active connection matches

      await repository.delete(connectionId);

      expect(mockStorage.delete).toHaveBeenCalledWith(`connection:${connectionId}`);
      expect(mockStorage.delete).toHaveBeenCalledWith('connection:active');
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
    it('should retrieve the active connection', async () => {
      const connectionId = 'active-connection-id';
      const mockData = {
        id: connectionId,
        manufacturer: 'SIUS',
        status: 'CONNECTED',
        portPath: 'COM3',
        baudRate: 9600,
        connectedAt: new Date().toISOString(),
        disconnectedAt: null,
        lastError: null,
      };

      vi.mocked(mockStorage.get)
        .mockReturnValueOnce(connectionId) // first call returns active ID
        .mockReturnValueOnce(mockData); // second call returns connection data

      const connection = await repository.findActive();

      expect(connection).not.toBeNull();
      expect(connection?.id).toBe(connectionId);
    });

    it('should return null when no active connection exists', async () => {
      vi.mocked(mockStorage.get).mockReturnValue(undefined);

      const connection = await repository.findActive();

      expect(connection).toBeNull();
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      vi.mocked(mockStorage.get).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.findActive()).rejects.toThrow('Repository operation failed');
    });
  });

  describe('findHistory()', () => {
    it('should retrieve connection history sorted by newest first', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const twoHoursAgo = new Date(now.getTime() - 7200000);

      const mockData = {
        'connection:id1': {
          id: 'id1',
          manufacturer: 'SIUS',
          status: 'DISCONNECTED',
          portPath: 'COM3',
          baudRate: 9600,
          connectedAt: twoHoursAgo.toISOString(),
          disconnectedAt: null,
          lastError: null,
        },
        'connection:id2': {
          id: 'id2',
          manufacturer: 'MEYTON',
          status: 'DISCONNECTED',
          portPath: 'COM4',
          baudRate: 19200,
          connectedAt: now.toISOString(),
          disconnectedAt: null,
          lastError: null,
        },
        'connection:id3': {
          id: 'id3',
          manufacturer: 'DISAG',
          status: 'DISCONNECTED',
          portPath: 'COM5',
          baudRate: 38400,
          connectedAt: oneHourAgo.toISOString(),
          disconnectedAt: null,
          lastError: null,
        },
      };

      vi.mocked(mockStorage.getAll).mockReturnValue(mockData);

      const history = await repository.findHistory(2);

      expect(history).toHaveLength(2);
      expect(history[0]?.id).toBe('id2'); // Newest
      expect(history[1]?.id).toBe('id3'); // Second newest
    });

    it('should return all connections when count is less than limit', async () => {
      const mockData = {
        'connection:id1': {
          id: 'id1',
          manufacturer: 'SIUS',
          status: 'DISCONNECTED',
          portPath: 'COM3',
          baudRate: 9600,
          connectedAt: new Date().toISOString(),
          disconnectedAt: null,
          lastError: null,
        },
      };

      vi.mocked(mockStorage.getAll).mockReturnValue(mockData);

      const history = await repository.findHistory(10);

      expect(history).toHaveLength(1);
    });

    it('should return an empty array when no connection history exists', async () => {
      vi.mocked(mockStorage.getAll).mockReturnValue({});

      const history = await repository.findHistory(5);

      expect(history).toEqual([]);
    });

    it('should throw REPOSITORY_ERROR when a storage error occurs', async () => {
      vi.mocked(mockStorage.getAll).mockImplementation(() => {
        throw new Error('Storage error');
      });

      await expect(repository.findHistory(5)).rejects.toThrow('Repository operation failed');
    });
  });

  describe('toStorageData() and toDomainEntity() conversion', () => {
    it('should convert a Connection to storage data and restore it back', async () => {
      const manufacturer = TargetManufacturer.sius();
      const connection = Connection.create({
        manufacturer,
        portPath: 'COM3',
        baudRate: 9600,
      }).connect();

      // Save
      await repository.save(connection);

      // Get saved data
      const savedData = vi.mocked(mockStorage.set).mock.calls[0]?.[1];

      // Verify data structure
      expect(savedData).toMatchObject({
        id: connection.id,
        manufacturer: 'SIUS',
        status: 'CONNECTED',
        portPath: 'COM3',
        baudRate: 9600,
        connectedAt: expect.any(String),
        disconnectedAt: null,
        lastError: null,
      });

      // Restoration test
      vi.mocked(mockStorage.get).mockReturnValue(savedData);
      const restoredConnection = await repository.findById(connection.id);

      expect(restoredConnection).not.toBeNull();
      expect(restoredConnection?.id).toBe(connection.id);
      expect(restoredConnection?.manufacturer.value).toBe('SIUS');
      expect(restoredConnection?.portPath).toBe('COM3');
      expect(restoredConnection?.baudRate).toBe(9600);
      expect(restoredConnection?.isConnected).toBe(true);
    });
  });

  describe('Immutability', () => {
    it('should have a frozen repository instance', () => {
      expect(Object.isFrozen(repository)).toBe(true);
    });
  });
});
