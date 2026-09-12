// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Immutable electronic-target connection state. */
export class ConnectionStatus {
  /**
   * Connection state value (DISCONNECTED | CONNECTING | CONNECTED | ERROR)
   */
  readonly value: string;

  readonly displayName: string;

  readonly isConnected: boolean;

  private constructor(value: string, displayName: string, isConnected: boolean) {
    this.value = value;
    this.displayName = displayName;
    this.isConnected = isConnected;

    Object.freeze(this);
  }

  static disconnected(): ConnectionStatus {
    return new ConnectionStatus('DISCONNECTED', 'Disconnected', false);
  }

  static connecting(): ConnectionStatus {
    return new ConnectionStatus('CONNECTING', 'Connecting', false);
  }

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
