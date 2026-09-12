// SPDX-License-Identifier: MIT
import { Connection } from '@/main/modules/connection/domain/Connection';

export interface IConnectionRepository {
  save(connection: Connection): Promise<void>;

  findById(id: string): Promise<Connection | null>;

  findAll(): Promise<Connection[]>;

  delete(id: string): Promise<void>;

  findActive(): Promise<Connection | null>;

  /** Returns the latest connections first, up to limit entries. */
  findHistory(limit: number): Promise<Connection[]>;
}
