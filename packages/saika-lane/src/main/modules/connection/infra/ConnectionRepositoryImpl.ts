// SPDX-License-Identifier: MIT
import { Connection } from '@/main/modules/connection/domain/Connection';
import { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import { withRepositoryErrorHandling } from '@/shared/errors/withRepositoryErrorHandling';
import { ILocalStorage } from '@/shared/storage/ILocalStorage';

/**
 * Type definition for connection data persisted in storage
 */
interface ConnectionStorageData {
  id: string;
  manufacturer: string;
  status: string;
  portPath: string;
  baudRate: number;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastError: string | null;
}

/**
 * ConnectionRepositoryImpl
 *
 * Implementation class for the connection repository.
 * Persists connection data using LocalStorageAdapter.
 */
export class ConnectionRepositoryImpl implements IConnectionRepository {
  private static readonly STORAGE_PREFIX = 'connection:';
  private static readonly ACTIVE_CONNECTION_KEY = 'connection:active';

  /**
   * Constructor
   *
   * @param storage - Local storage instance
   */
  constructor(private readonly storage: ILocalStorage) {
    Object.freeze(this);
  }

  /**
   * Save a connection
   *
   * @param connection - The connection to save
   * @returns Promise (resolves on completion)
   * @throws REPOSITORY_ERROR - If saving fails
   */
  async save(connection: Connection): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        const key = this.getStorageKey(connection.id);
        const data = this.toStorageData(connection);
        this.storage.set(key, data);

        // If connected, also update the active key
        if (connection.isConnected) {
          this.storage.set(ConnectionRepositoryImpl.ACTIVE_CONNECTION_KEY, connection.id);
        }
      },
      'REPOSITORY_ERROR',
      { connectionId: connection.id, operation: 'save' },
    );
  }

  /**
   * Find a connection by ID
   *
   * @param id - Connection ID (UUID)
   * @returns Promise (Connection if found, null if not found)
   * @throws REPOSITORY_ERROR - If retrieval fails
   */
  async findById(id: string): Promise<Connection | null> {
    return withRepositoryErrorHandling(
      async () => {
        const key = this.getStorageKey(id);
        const data = this.storage.get<ConnectionStorageData>(key);

        if (!data) {
          return null;
        }

        return this.toDomainEntity(data);
      },
      'REPOSITORY_ERROR',
      { connectionId: id, operation: 'findById' },
    );
  }

  /**
   * Find all connections
   *
   * @returns Promise (array of connections)
   * @throws REPOSITORY_ERROR - If retrieval fails
   */
  async findAll(): Promise<Connection[]> {
    return withRepositoryErrorHandling(
      async () => {
        const allData = this.storage.getAll();
        const connections: Connection[] = [];

        for (const [key, value] of Object.entries(allData)) {
          if (
            key.startsWith(ConnectionRepositoryImpl.STORAGE_PREFIX) &&
            key !== ConnectionRepositoryImpl.ACTIVE_CONNECTION_KEY
          ) {
            connections.push(this.toDomainEntity(value as ConnectionStorageData));
          }
        }

        return connections;
      },
      'REPOSITORY_ERROR',
      { operation: 'findAll' },
    );
  }

  /**
   * Delete a connection
   *
   * @param id - ID of the connection to delete (UUID)
   * @returns Promise (resolves on completion)
   * @throws REPOSITORY_ERROR - If deletion fails
   */
  async delete(id: string): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        const key = this.getStorageKey(id);
        this.storage.delete(key);

        // If the active connection was deleted, also clear the active key
        const activeId = this.storage.get<string>(ConnectionRepositoryImpl.ACTIVE_CONNECTION_KEY);
        if (activeId === id) {
          this.storage.delete(ConnectionRepositoryImpl.ACTIVE_CONNECTION_KEY);
        }
      },
      'REPOSITORY_ERROR',
      { connectionId: id, operation: 'delete' },
    );
  }

  /**
   * Find the currently active connection
   *
   * @returns Promise (Connection if an active connection exists, null otherwise)
   * @throws REPOSITORY_ERROR - If retrieval fails
   */
  async findActive(): Promise<Connection | null> {
    return withRepositoryErrorHandling(
      async () => {
        const activeId = this.storage.get<string>(ConnectionRepositoryImpl.ACTIVE_CONNECTION_KEY);

        if (!activeId) {
          return null;
        }

        return await this.findById(activeId);
      },
      'REPOSITORY_ERROR',
      { operation: 'findActive' },
    );
  }

  /**
   * Find connection history (latest N entries)
   *
   * @param limit - Number of entries to retrieve
   * @returns Promise (array of connections, sorted in descending order)
   * @throws REPOSITORY_ERROR - If retrieval fails
   */
  async findHistory(limit: number): Promise<Connection[]> {
    return withRepositoryErrorHandling(
      async () => {
        const allConnections = await this.findAll();

        // Sort descending by connectedAt (newest first)
        const sorted = allConnections.sort((a, b) => {
          const timeA = a.connectedAt?.getTime() || 0;
          const timeB = b.connectedAt?.getTime() || 0;
          return timeB - timeA;
        });

        // Limit to the specified count
        return sorted.slice(0, limit);
      },
      'REPOSITORY_ERROR',
      { operation: 'findHistory', limit },
    );
  }

  /**
   * Generate a storage key
   *
   * @param id - Connection ID
   * @returns Storage key
   */
  private getStorageKey(id: string): string {
    return `${ConnectionRepositoryImpl.STORAGE_PREFIX}${id}`;
  }

  /**
   * Convert a Connection entity to storage data format
   *
   * @param connection - Connection entity
   * @returns Storage data
   */
  private toStorageData(connection: Connection): ConnectionStorageData {
    return {
      id: connection.id,
      manufacturer: connection.manufacturer.value,
      status: connection.status.value,
      portPath: connection.portPath,
      baudRate: connection.baudRate,
      connectedAt: connection.connectedAt ? connection.connectedAt.toISOString() : null,
      disconnectedAt: connection.disconnectedAt ? connection.disconnectedAt.toISOString() : null,
      lastError: connection.lastError,
    };
  }

  /**
   * Convert storage data to a Connection entity
   *
   * @param data - Data retrieved from storage
   * @returns Connection entity
   */
  private toDomainEntity(data: ConnectionStorageData): Connection {
    return Connection.reconstruct(data);
  }
}
