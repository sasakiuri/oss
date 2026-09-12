// SPDX-License-Identifier: MIT
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** USB/serial connection state, timestamps, and last error. */
export class Connection {
  /** Connection ID (UUID). */
  readonly id: string;

  readonly manufacturer: TargetManufacturer;

  readonly status: ConnectionStatus;

  /** Serial port path, such as "COM3" or "/dev/ttyUSB0". */
  readonly portPath: string;

  readonly baudRate: number;

  /** Selects the device adapter during data conversion; null when unspecified. */
  readonly deviceId: string | null;

  readonly connectedAt: Date | null;

  readonly disconnectedAt: Date | null;

  readonly lastError: string | null;

  private constructor(
    id: string,
    manufacturer: TargetManufacturer,
    status: ConnectionStatus,
    portPath: string,
    baudRate: number,
    deviceId: string | null,
    connectedAt: Date | null,
    disconnectedAt: Date | null,
    lastError: string | null,
  ) {
    this.id = id;
    this.manufacturer = manufacturer;
    this.status = status;
    this.portPath = portPath;
    this.baudRate = baudRate;
    this.deviceId = deviceId;
    this.connectedAt = connectedAt;
    this.disconnectedAt = disconnectedAt;
    this.lastError = lastError;

    Object.freeze(this);
  }

  /**
   * Creates a disconnected connection.
   * @throws If the port path is empty or the baud rate is zero or negative.
   */
  static create(props: {
    manufacturer: TargetManufacturer;
    portPath: string;
    baudRate: number;
    deviceId?: string;
  }): Connection {
    if (!props.portPath || props.portPath.trim().length === 0) {
      throw ErrorCatalog.createError('INVALID_PORT_PATH', { detail: 'Port path must be a non-empty string' });
    }

    if (props.baudRate <= 0) {
      throw ErrorCatalog.createError('INVALID_BAUD_RATE', { detail: 'Baud rate must be a positive integer' });
    }

    const id = crypto.randomUUID();

    return new Connection(
      id,
      props.manufacturer,
      ConnectionStatus.disconnected(),
      props.portPath,
      props.baudRate,
      props.deviceId ?? null,
      null, // Not connected in initial state
      null,
      null, // No error in initial state
    );
  }

  /** Returns a connected state with a new connection timestamp and clears the error. */
  connect(): Connection {
    return new Connection(
      this.id,
      this.manufacturer,
      ConnectionStatus.connected(),
      this.portPath,
      this.baudRate,
      this.deviceId,
      new Date(), // Record connection time
      this.disconnectedAt,
      null, // Clear error
    );
  }

  /** Records disconnection while retaining the connection timestamp and last error. */
  disconnect(): Connection {
    return new Connection(
      this.id,
      this.manufacturer,
      ConnectionStatus.disconnected(),
      this.portPath,
      this.baudRate,
      this.deviceId,
      this.connectedAt, // Retain connection time
      new Date(), // Record disconnection time
      this.lastError,
    );
  }

  setError(errorMessage: string): Connection {
    return new Connection(
      this.id,
      this.manufacturer,
      ConnectionStatus.error(),
      this.portPath,
      this.baudRate,
      this.deviceId,
      this.connectedAt,
      this.disconnectedAt,
      errorMessage,
    );
  }

  get isConnected(): boolean {
    return this.status.equals(ConnectionStatus.connected());
  }

  get isDisconnected(): boolean {
    return this.status.equals(ConnectionStatus.disconnected());
  }

  get hasError(): boolean {
    return this.status.equals(ConnectionStatus.error());
  }

  /** Compares connection IDs. */
  equals(other: Connection): boolean {
    return this.id === other.id;
  }

  /**
   * Restores a connection from stored values.
   * @throws If the manufacturer or connection status is unknown.
   */
  static reconstruct(data: {
    id: string;
    manufacturer: string;
    status: string;
    portPath: string;
    baudRate: number;
    deviceId?: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
    lastError: string | null;
  }): Connection {
    const manufacturer = TargetManufacturer.fromValue(data.manufacturer);

    const status = ConnectionStatus.fromValue(data.status);

    const connectedAt = data.connectedAt ? new Date(data.connectedAt) : null;
    const disconnectedAt = data.disconnectedAt ? new Date(data.disconnectedAt) : null;

    return new Connection(
      data.id,
      manufacturer,
      status,
      data.portPath,
      data.baudRate,
      data.deviceId ?? null,
      connectedAt,
      disconnectedAt,
      data.lastError,
    );
  }
}
