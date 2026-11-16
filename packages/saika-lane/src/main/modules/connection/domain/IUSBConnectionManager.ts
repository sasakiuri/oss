// SPDX-License-Identifier: MIT
import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { ShotData } from '@/main/modules/connection/domain/ShotData';
import type { Mode } from '@/main/modules/session/domain/Mode';
import type { AdapterContext } from '@/main/modules/target/domain/AdapterContext';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

/** Synchronously supplies the discipline and mode of the active competition. */
export type SessionContextProvider = () => Pick<AdapterContext, 'discipline' | 'mode'>;

export interface USBConnectionEvents {
  connected: Connection;
  /** Fired when the underlying port closes unexpectedly. */
  disconnected: void;
  data: ShotData;
  error: { error: Error; recoverable: boolean };
  reconnectFailed: { attempts: number; lastError: Error };
}

export interface USBConnectionConfig {
  /**
   * Port name (e.g. "COM3", "/dev/ttyUSB0")
   */
  portName: string;

  manufacturer: TargetManufacturer;

  /** Selects the device-specific adapter when provided. */
  deviceId?: string;

  /**
   * Baud rate (default: 9600)
   */
  baudRate?: number;

  /**
   * Data bits (default: 8)
   */
  dataBits?: 5 | 6 | 7 | 8;

  /**
   * Stop bits (default: 1)
   */
  stopBits?: 1 | 1.5 | 2;

  /**
   * Parity (default: 'none')
   */
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
}

export interface USBPortInfo {
  /**
   * Port path (e.g. "COM3", "/dev/ttyUSB0")
   */
  path: string;

  manufacturer?: string;

  serialNumber?: string;

  vendorId?: string;

  productId?: string;
}

/** Opens and closes target connections and delivers received data through events. */
export interface IUSBConnectionManager {
  /**
   * Opens the configured target port.
   * @throws INVALID_TARGET for an unsupported device configuration, CONNECTION_FAILED when the attempt is
   *   cancelled or the port closes during initialization, or the error raised while opening or initializing the port.
   */
  connect(config: USBConnectionConfig): Promise<Connection>;

  /**
   * Closes the current connection; does nothing when disconnected. Port close errors are logged, not thrown.
   */
  disconnect(): Promise<void>;

  /**
   * Reconnects using the saved configuration; rejects missing settings.
   * @throws CONNECTION_FAILED without a saved configuration, MAX_RECONNECT_EXCEEDED after too many attempts,
   *   or any `connect()` failure (including INVALID_TARGET).
   */
  reconnect(): Promise<void>;

  getStatus(): ConnectionStatus;

  listPorts(): Promise<USBPortInfo[]>;

  on<E extends keyof USBConnectionEvents>(event: E, listener: (data: USBConnectionEvents[E]) => void): () => void;

  setSessionContextProvider(provider: SessionContextProvider): void;

  /** Runs once per converted shot before persistence, for immediate sound feedback. */
  setOnShotDetected(callback: () => void): void;

  resetShotCounter(): void;

  /**
   * Sends ASCII S for sighting or R for match. Devices without mode commands
   * ignore this call. Send failures are not propagated to the caller.
   */
  sendMode(mode: Mode): Promise<void>;
}
