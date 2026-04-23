// SPDX-License-Identifier: MIT
import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { Mode } from '@/main/modules/session/domain/Mode';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

import type { SessionContextProvider } from './USBDataPipeline';

export interface USBConnectionEvents {
  connected: Connection;
  /** Fired when the underlying port closes unexpectedly. */
  disconnected: void;
  data: ShotData;
  error: { error: Error; recoverable: boolean };
  reconnectFailed: { attempts: number; lastError: Error };
}

/**
 * Type definition for USB connection settings
 *
 * Defines the configuration information required for a serial port connection.
 */
export interface USBConnectionConfig {
  /**
   * Port name (e.g. "COM3", "/dev/ttyUSB0")
   */
  portName: string;

  /**
   * Target manufacturer
   */
  manufacturer: TargetManufacturer;

  /**
   * Device ID (optional, e.g. MT201, BP216, HS10)
   * When specified, the adapter corresponding to this ID is used during data conversion
   */
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

/**
 * Type definition for USB port information
 *
 * Defines the information for available serial ports.
 */
export interface USBPortInfo {
  /**
   * Port path (e.g. "COM3", "/dev/ttyUSB0")
   */
  path: string;

  /**
   * Manufacturer name (optional)
   */
  manufacturer?: string;

  /**
   * Serial number (optional)
   */
  serialNumber?: string;

  /**
   * Vendor ID (optional)
   */
  vendorId?: string;

  /**
   * Product ID (optional)
   */
  productId?: string;
}

/**
 * Type definition for impact point data
 *
 * Defines the raw impact point data received from an electronic target.
 */
export interface ShotData {
  /**
   * X coordinate (in mm). null for miss shots.
   */
  x: number | null;

  /**
   * Y coordinate (in mm). null for miss shots.
   */
  y: number | null;

  /**
   * Reception timestamp
   */
  timestamp: Date;

  /**
   * Score (score received from MT201)
   */
  score?: number;

  /**
   * Mode notified by the device (SIGHTING=sighting shot, MATCH=match shot).
   * Set by devices that notify mode, such as MT201.
   * When omitted, the Session's mode is used.
   */
  mode?: 'SIGHTING' | 'MATCH';

  /**
   * Raw data (for debugging)
   */
  raw?: Buffer;
}

/**
 * IUSBConnectionManager interface
 *
 * Interface responsible for managing the lifecycle of USB connections.
 * Abstracts communication with electronic targets, providing connect, disconnect, reconnect, and data reception.
 *
 * Design principles:
 * - Acts as a port in hexagonal architecture
 * - Hides the details of concrete communication implementations (serialport, etc.)
 * - Data reception via event-driven approach
 */
export interface IUSBConnectionManager {
  /**
   * Connect to the target
   *
   * Establishes a connection with the electronic target using the specified settings.
   * Returns a Connection entity on successful connection.
   *
   * @param config - USB connection settings
   * @returns Connection entity on successful connection
   * @throws USB_PORT_NOT_FOUND - If the port is not found
   * @throws USB_OPEN_FAILED - If opening the port fails
   * @throws USB_DEVICE_BUSY - If the device is in use
   *
   * @example
   * ```typescript
   * const connection = await usbManager.connect({
   *   portName: 'COM3',
   *   manufacturer: TargetManufacturer.sius(),
   *   baudRate: 9600,
   * });
   * ```
   */
  connect(config: USBConnectionConfig): Promise<Connection>;

  /**
   * Disconnect from the target
   *
   * Gracefully disconnects the current connection.
   * Does nothing if not connected.
   *
   * @returns Promise (waits for disconnection to complete)
   * @throws USB_WRITE_FAILED - If sending the disconnect command fails
   *
   * @example
   * ```typescript
   * await usbManager.disconnect();
   * ```
   */
  disconnect(): Promise<void>;

  /**
   * Reconnect to the target
   *
   * Attempts to reconnect using the existing settings.
   * Throws an error if no connection settings are available.
   *
   * @returns Promise (waits for reconnection to complete)
   * @throws USB_PORT_NOT_FOUND - If the port is not found
   * @throws USB_OPEN_FAILED - If opening the port fails
   *
   * @example
   * ```typescript
   * await usbManager.reconnect();
   * ```
   */
  reconnect(): Promise<void>;

  /**
   * Get the current connection state
   *
   * @returns Current connection state
   *
   * @example
   * ```typescript
   * const status = usbManager.getStatus();
   * if (status.isConnected) {
   *   console.log('Connected');
   * }
   * ```
   */
  getStatus(): ConnectionStatus;

  /**
   * Get a list of available USB ports
   *
   * Scans and returns the serial ports available on the system.
   *
   * @returns Array of available port information
   *
   * @example
   * ```typescript
   * const ports = await usbManager.listPorts();
   * ports.forEach(port => {
   *   console.log(`${port.path} - ${port.manufacturer}`);
   * });
   * ```
   */
  listPorts(): Promise<USBPortInfo[]>;

  on<E extends keyof USBConnectionEvents>(event: E, listener: (data: USBConnectionEvents[E]) => void): () => void;

  /**
   * Set the session context provider
   *
   * @param provider - Synchronous callback that returns discipline/mode
   */
  setSessionContextProvider(provider: SessionContextProvider): void;

  /**
   * Set the callback invoked when raw data is received (called before parsing)
   *
   * @param callback - Callback invoked immediately upon data reception
   */
  setOnShotDetected(callback: () => void): void;

  /**
   * Reset the shot number counter
   */
  resetShotCounter(): void;

  /**
   * Send a mode byte to the device
   *
   * Sends the 'S' byte for sighting mode (SIGHTING) or the 'R' byte for match mode (MATCH).
   * Fails silently on send failure (does not propagate error to the caller).
   *
   * @param mode - The mode to send
   */
  sendMode(mode: Mode): Promise<void>;
}
