// SPDX-License-Identifier: MIT
import { Connection } from '@/main/modules/connection/domain/Connection';
import { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import { withRepositoryErrorHandling } from '@/shared/errors/withRepositoryErrorHandling';
import { ILocalStorage } from '@/shared/storage/ILocalStorage';

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

/** Stores connection settings and history through LocalStorageAdapter. */
export class ConnectionRepositoryImpl implements IConnectionRepository {
  private static readonly STORAGE_PREFIX = 'connection:';
  private static readonly ACTIVE_CONNECTION_KEY = 'connection:active';

  constructor(private readonly storage: ILocalStorage) {
    Object.freeze(this);
  }

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

  /** Returns the latest connections first, up to limit entries. */
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

  private getStorageKey(id: string): string {
    return `${ConnectionRepositoryImpl.STORAGE_PREFIX}${id}`;
  }

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

  private toDomainEntity(data: ConnectionStorageData): Connection {
    return Connection.reconstruct(data);
  }
}
