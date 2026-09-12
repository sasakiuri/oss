// SPDX-License-Identifier: MIT
import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { Mode } from '@/main/modules/session/domain/Mode';
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { ShotTimestampSource } from '@/shared/types/ShotTimestampSource';

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

/** Decoded target coordinates and reception metadata. */
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
   * Reception timestamp unless timestampSource explicitly identifies another source.
   */
  timestamp: Date;
  timestampSource?: ShotTimestampSource;

  /**
   * Score reported by the target device (×10 integer)
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

/** Opens and closes target connections and delivers received data through events. */
export interface IUSBConnectionManager {
  /**
   * Opens the configured target port.
   * @throws USB_PORT_NOT_FOUND, USB_OPEN_FAILED, or USB_DEVICE_BUSY.
   */
  connect(config: USBConnectionConfig): Promise<Connection>;

  /**
   * Closes the current connection; does nothing when disconnected.
   * @throws USB_WRITE_FAILED if the disconnect command fails.
   */
  disconnect(): Promise<void>;

  /**
   * Reconnects using the saved configuration; rejects missing settings.
   * @throws USB_PORT_NOT_FOUND or USB_OPEN_FAILED.
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
