// SPDX-License-Identifier: MIT
import Store from 'electron-store';

import { getLogger } from '@/main/shared-infra/logging';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';
import { ILocalStorage } from '@/shared/storage/ILocalStorage';
import { StorageData, StorageKey, StorageOptions, StorageValue } from '@/shared/storage/types';

/**
 * LocalStorageAdapter
 *
 * Wrapper class for electron-store. Implements the ILocalStorage interface.
 * Provides unified error handling and logging.
 */
export class LocalStorageAdapter implements ILocalStorage {
  private readonly store: Store;

  /**
   * Constructor
   *
   * @param options - Storage options
   */
  constructor(options: StorageOptions) {
    this.store = new Store({
      name: options.name,
      encryptionKey: options.encryptionKey,
      clearInvalidConfig: true,
    });

    Object.freeze(this);
  }

  /**
   * Retrieves a value
   *
   * @param key - Storage key
   * @returns The value (undefined if not found)
   * @throws STORAGE_READ_ERROR - If reading fails
   */
  get<T = StorageValue>(key: StorageKey): T | undefined {
    try {
      return this.store.get(key) as T | undefined;
    } catch (error) {
      throw ErrorCatalog.createError('STORAGE_READ_ERROR', { key }, toError(error));
    }
  }

  /**
   * Sets a value
   *
   * @param key - Storage key
   * @param value - Value to set
   * @throws STORAGE_WRITE_ERROR - If writing fails
   */
  set(key: StorageKey, value: StorageValue): void {
    try {
      this.store.set(key, value);
    } catch (error) {
      getLogger().error('[LocalStorage] Failed to write to store', 'module', { key, error });
      throw ErrorCatalog.createError('STORAGE_WRITE_ERROR', { key }, toError(error));
    }
  }

  /**
   * Sets multiple values at once
   *
   * Uses electron-store's store.set(object) to write in a single fs.writeFileSync call.
   *
   * @param entries - Key-value pairs
   * @throws STORAGE_WRITE_ERROR - If writing fails
   */
  setMany(entries: Record<StorageKey, StorageValue>): void {
    try {
      this.store.set(entries as Record<string, unknown>);
    } catch (error) {
      getLogger().error('[LocalStorage] Failed to write batch to store', 'module', {
        keys: Object.keys(entries),
        error,
      });
      throw ErrorCatalog.createError('STORAGE_WRITE_ERROR', { key: Object.keys(entries).join(',') }, toError(error));
    }
  }

  /**
   * Checks whether a value exists
   *
   * @param key - Storage key
   * @returns true if the value exists
   */
  has(key: StorageKey): boolean {
    return this.store.has(key);
  }

  /**
   * Deletes a value
   *
   * @param key - Storage key
   * @throws STORAGE_DELETE_ERROR - If deletion fails
   */
  delete(key: StorageKey): void {
    try {
      this.store.delete(key);
    } catch (error) {
      throw ErrorCatalog.createError('STORAGE_DELETE_ERROR', { key }, toError(error));
    }
  }

  /**
   * Retrieves all data
   *
   * @returns All storage data
   * @throws STORAGE_READ_ERROR - If reading fails
   */
  getAll(): StorageData {
    try {
      return this.store.store as StorageData;
    } catch (error) {
      throw ErrorCatalog.createError('STORAGE_READ_ERROR', {}, toError(error));
    }
  }

  /**
   * Clears all data
   *
   * @throws STORAGE_DELETE_ERROR - If deletion fails
   */
  clear(): void {
    try {
      this.store.clear();
    } catch (error) {
      throw ErrorCatalog.createError('STORAGE_DELETE_ERROR', {}, toError(error));
    }
  }
}
