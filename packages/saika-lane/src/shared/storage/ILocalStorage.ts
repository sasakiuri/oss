// SPDX-License-Identifier: MIT
import { StorageData, StorageKey, StorageValue } from './types';

/**
 * ILocalStorage interface
 *
 * Abstraction interface for local storage (electron-store).
 * Defined as an interface for testability and dependency injection.
 */
export interface ILocalStorage {
  /**
   * Get a value
   *
   * @param key - Storage key
   * @returns The value, or undefined if it does not exist
   * @throws STORAGE_READ_ERROR - If reading fails
   */
  get<T = StorageValue>(key: StorageKey): T | undefined;

  /**
   * Set a value
   *
   * @param key - Storage key
   * @param value - The value to set
   * @throws STORAGE_WRITE_ERROR - If writing fails
   */
  set(key: StorageKey, value: StorageValue): void;

  /**
   * Set multiple values at once
   *
   * In electron-store this is written in a single fs.writeFileSync call,
   * making it more efficient than calling set() multiple times when updating multiple keys simultaneously.
   *
   * @param entries - Key-value pairs
   * @throws STORAGE_WRITE_ERROR - If writing fails
   */
  setMany(entries: Record<StorageKey, StorageValue>): void;

  /**
   * Check whether a value exists
   *
   * @param key - Storage key
   * @returns true if the value exists
   */
  has(key: StorageKey): boolean;

  /**
   * Delete a value
   *
   * @param key - Storage key
   * @throws STORAGE_DELETE_ERROR - If deletion fails
   */
  delete(key: StorageKey): void;

  /**
   * Get all data
   *
   * @returns All storage data
   * @throws STORAGE_READ_ERROR - If reading fails
   */
  getAll(): StorageData;

  /**
   * Clear all data
   *
   * @throws STORAGE_DELETE_ERROR - If deletion fails
   */
  clear(): void;
}
