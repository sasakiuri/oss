// SPDX-License-Identifier: MIT
/**
 * Storage Layer type definitions
 *
 * Provides type safety while maintaining compatibility with electron-store.
 */

/**
 * Storage key (string)
 */
export type StorageKey = string;

/**
 * Storage value (any type, effectively JSON serializable)
 */
export type StorageValue = unknown;

/**
 * Storage data (key-value pairs)
 */
export interface StorageData {
  [key: string]: StorageValue;
}

/**
 * Storage options
 */
export interface StorageOptions {
  /**
   * Storage file name
   */
  name: string;

  /**
   * Encryption key (optional)
   */
  encryptionKey?: string;

  /**
   * Clear-text storage (default: false)
   */
  clearText?: boolean;
}
