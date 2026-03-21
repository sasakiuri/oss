// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * ConnectionStatus value object
 *
 * An immutable object representing the connection state with an electronic target.
 * Has four states: disconnected, connecting, connected, and error.
 */
export class ConnectionStatus {
  /**
   * Connection state value (DISCONNECTED | CONNECTING | CONNECTED | ERROR)
   */
  readonly value: string;

  /**
   * Display name
   */
  readonly displayName: string;

  /**
   * Whether the connection is connected
   */
  readonly isConnected: boolean;

  /**
   * Creates a ConnectionStatus instance (private constructor pattern)
   *
   * @param value - Connection state value
   * @param displayName - Display name
   * @param isConnected - Whether the connection is connected
   */
  private constructor(value: string, displayName: string, isConnected: boolean) {
    this.value = value;
    this.displayName = displayName;
    this.isConnected = isConnected;

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Create a disconnected state
   *
   * @returns A disconnected state instance
   */
  static disconnected(): ConnectionStatus {
    return new ConnectionStatus('DISCONNECTED', 'Disconnected', false);
  }

  /**
   * Create a connecting state
   *
   * @returns A connecting state instance
   */
  static connecting(): ConnectionStatus {
    return new ConnectionStatus('CONNECTING', 'Connecting', false);
  }

  /**
   * Create a connected state
   *
   * @returns A connected state instance
   */
  static connected(): ConnectionStatus {
    return new ConnectionStatus('CONNECTED', 'Connected', true);
  }

  /**
   * Create an error state
   *
   * @returns An error state instance
   */
  static error(): ConnectionStatus {
    return new ConnectionStatus('ERROR', 'Error', false);
  }

  /**
   * Check equality with another ConnectionStatus
   *
   * @param other - The ConnectionStatus to compare against
   * @returns true if equal, false otherwise
   */
  equals(other: ConnectionStatus): boolean {
    return this.value === other.value;
  }

  /**
   * Reconstruct a ConnectionStatus from a string value
   *
   * @param value - Connection state value (DISCONNECTED | CONNECTING | CONNECTED | ERROR)
   * @returns ConnectionStatus instance
   * @throws {Error} If the value is invalid
   */
  static fromValue(value: string): ConnectionStatus {
    const mapping: { [key: string]: () => ConnectionStatus } = {
      DISCONNECTED: () => ConnectionStatus.disconnected(),
      CONNECTING: () => ConnectionStatus.connecting(),
      CONNECTED: () => ConnectionStatus.connected(),
      ERROR: () => ConnectionStatus.error(),
    };

    const factory = mapping[value];
    if (!factory) {
      throw ErrorCatalog.createError('UNKNOWN_CONNECTION_STATUS', {
        detail: `Unknown connection status value: ${value}`,
      });
    }

    return factory();
  }
}
