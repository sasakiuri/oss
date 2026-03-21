// SPDX-License-Identifier: MIT
import { Connection } from '@/main/modules/connection/domain/Connection';

/**
 * IConnectionRepository (connection repository) interface
 *
 * A repository interface that abstracts the persistence of connection information.
 * Implementations are provided in the Infrastructure layer; the Domain layer depends on this interface.
 */
export interface IConnectionRepository {
  /**
   * Save a connection
   *
   * @param connection - The connection to save
   * @returns Promise (resolves on completion)
   */
  save(connection: Connection): Promise<void>;

  /**
   * Find a connection by ID
   *
   * @param id - Connection ID (UUID)
   * @returns Promise (Connection if found, null if not found)
   */
  findById(id: string): Promise<Connection | null>;

  /**
   * Find all connections
   *
   * @returns Promise (array of connections)
   */
  findAll(): Promise<Connection[]>;

  /**
   * Delete a connection
   *
   * @param id - ID of the connection to delete (UUID)
   * @returns Promise (resolves on completion)
   */
  delete(id: string): Promise<void>;

  /**
   * Find the currently active connection
   *
   * @returns Promise (Connection if an active connection exists, null otherwise)
   */
  findActive(): Promise<Connection | null>;

  /**
   * Find connection history (latest N entries)
   *
   * @param limit - Number of entries to retrieve
   * @returns Promise (array of connections, sorted in descending order)
   */
  findHistory(limit: number): Promise<Connection[]>;
}
