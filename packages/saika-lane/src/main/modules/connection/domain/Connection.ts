// SPDX-License-Identifier: MIT
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * Connection aggregate root
 *
 * Aggregate root that manages USB/serial connections.
 * Responsible for connection state management, error handling, and connection history.
 */
export class Connection {
  /**
   * Connection ID (UUID)
   */
  readonly id: string;

  /**
   * Target manufacturer
   */
  readonly manufacturer: TargetManufacturer;

  /**
   * Connection state
   */
  readonly status: ConnectionStatus;

  /**
   * COM port path (e.g. "COM3", "/dev/ttyUSB0")
   */
  readonly portPath: string;

  /**
   * Baud rate (e.g. 9600, 19200, 38400, 57600, 115200)
   */
  readonly baudRate: number;

  /**
   * Device ID (optional, e.g. MT201, BP216, HS10)
   * Used to select the adapter during data conversion
   */
  readonly deviceId: string | null;

  /**
   * Time the connection was established
   */
  readonly connectedAt: Date | null;

  /**
   * Time the connection was disconnected
   */
  readonly disconnectedAt: Date | null;

  /**
   * Last error message
   */
  readonly lastError: string | null;

  /**
   * Creates a Connection instance (private constructor pattern)
   */
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

    // Guarantee immutability: freeze the object
    Object.freeze(this);
  }

  /**
   * Create a new connection instance
   *
   * @param props - Connection properties
   * @returns Connection instance
   * @throws When port path is an empty string
   * @throws When baud rate is not a positive integer
   */
  static create(props: {
    manufacturer: TargetManufacturer;
    portPath: string;
    baudRate: number;
    deviceId?: string;
  }): Connection {
    // Business rule: port path must be a non-empty string
    if (!props.portPath || props.portPath.trim().length === 0) {
      throw ErrorCatalog.createError('INVALID_PORT_PATH', { detail: 'Port path must be a non-empty string' });
    }

    // Business rule: baud rate must be a positive integer
    if (props.baudRate <= 0) {
      throw ErrorCatalog.createError('INVALID_BAUD_RATE', { detail: 'Baud rate must be a positive integer' });
    }

    const id = crypto.randomUUID();

    return new Connection(
      id,
      props.manufacturer,
      ConnectionStatus.disconnected(), // Initial state is DISCONNECTED
      props.portPath,
      props.baudRate,
      props.deviceId ?? null, // null if no device ID is specified
      null, // Not connected in initial state
      null,
      null, // No error in initial state
    );
  }

  /**
   * Establish connection (transition to CONNECTED)
   *
   * @returns A new connection instance in the connected state
   */
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

  /**
   * Disconnect (transition to DISCONNECTED)
   *
   * @returns A new connection instance in the disconnected state
   */
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

  /**
   * Transition to error state
   *
   * @param errorMessage - Error message
   * @returns A new connection instance in the error state
   */
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

  /**
   * Whether the connection is connected
   *
   * @returns true if connected
   */
  get isConnected(): boolean {
    return this.status.equals(ConnectionStatus.connected());
  }

  /**
   * Whether the connection is disconnected
   *
   * @returns true if disconnected
   */
  get isDisconnected(): boolean {
    return this.status.equals(ConnectionStatus.disconnected());
  }

  /**
   * Whether the connection is in an error state
   *
   * @returns true if in error state
   */
  get hasError(): boolean {
    return this.status.equals(ConnectionStatus.error());
  }

  /**
   * Check equality with another Connection
   *
   * @param other - The Connection to compare against
   * @returns true if equal, false otherwise
   */
  equals(other: Connection): boolean {
    return this.id === other.id;
  }

  /**
   * Reconstruct a Connection from storage data (static factory method)
   *
   * @param data - Serialized data retrieved from storage
   * @returns Reconstructed Connection instance
   * @throws {Error} If the data is invalid
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
    // Reconstruct TargetManufacturer
    const manufacturer = TargetManufacturer.fromValue(data.manufacturer);

    // Reconstruct ConnectionStatus
    const status = ConnectionStatus.fromValue(data.status);

    // Reconstruct dates
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
