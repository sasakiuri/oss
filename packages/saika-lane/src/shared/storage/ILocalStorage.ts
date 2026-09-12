// SPDX-License-Identifier: MIT
import { StorageData, StorageKey, StorageValue } from './types';

/** Local key-value storage. */
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
   * Writes multiple keys in one storage operation.
   * @throws STORAGE_WRITE_ERROR - If writing fails
   */
  setMany(entries: Record<StorageKey, StorageValue>): void;

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
