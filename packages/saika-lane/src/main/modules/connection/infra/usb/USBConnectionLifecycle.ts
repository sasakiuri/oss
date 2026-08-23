// SPDX-License-Identifier: MIT
import { SerialPort } from 'serialport';

import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';

import type { USBConnectionConfig, USBPortInfo } from './IUSBConnectionManager';
import { USBDeviceDetector } from './USBDeviceDetector';
import type { USBEventEmitter } from './USBEventEmitter';

interface PendingConnect {
  readonly generation: number;
  readonly port: SerialPort;
  readonly connection: Connection;
  readonly resolve: (connection: Connection) => void;
  readonly reject: (error: Error) => void;
}

interface OpenCompletion {
  readonly port: SerialPort;
  readonly promise: Promise<void>;
}

/**
 * USBConnectionLifecycle
 *
 * Manages the lifecycle of USB connections (connect, disconnect, reconnect).
 * Responsible for SerialPort creation, opening, and closing, Connection entity state transitions,
 * and reconnect logic.
 */
export class USBConnectionLifecycle {
  port: SerialPort | null = null;
  config: USBConnectionConfig | null = null;
  connection: Connection | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private readonly deviceDetector: USBDeviceDetector;
  private generation = 0;
  private connectionOperationGeneration = 0;
  private pendingConnect: PendingConnect | null = null;
  private openCompletion: OpenCompletion | null = null;
  private readonly closeCompletions = new WeakMap<SerialPort, Promise<void>>();

  /**
   * @param emitter - Event emitter
   * @param onPortReady - Callback invoked when the port opens successfully (for data pipeline attachment)
   */
  constructor(
    private readonly emitter: USBEventEmitter,
    private readonly onPortReady: (port: SerialPort, config: USBConnectionConfig) => void | Promise<void>,
    private readonly onPortUnavailable: () => void = () => undefined,
  ) {
    this.deviceDetector = new USBDeviceDetector();
  }

  /**
   * Connect to the target
   *
   * @param config - USB connection settings
   * @returns Connection entity on successful connection
   */
  async connect(config: USBConnectionConfig): Promise<Connection> {
    const operationGeneration = ++this.connectionOperationGeneration;
    return await this.connectForOperation(config, operationGeneration);
  }

  private async connectForOperation(config: USBConnectionConfig, operationGeneration: number): Promise<Connection> {
    const logger = getLogger();
    logger.debug('[USB] connect() called', 'usb', {
      portName: config.portName,
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
      manufacturer: config.manufacturer,
      deviceId: config.deviceId,
    });

    // A closed/opening/closing stale port must also be fully disposed before a
    // new SerialPort instance is created for the same OS device path.
    while (this.port) {
      this.ensureCurrentConnectionOperation(operationGeneration);
      await this.disconnectCurrent();
    }
    this.ensureCurrentConnectionOperation(operationGeneration);

    // Save connection settings
    this.config = config;

    // Create Connection entity
    const connection = Connection.create({
      manufacturer: config.manufacturer,
      portPath: config.portName,
      baudRate: config.baudRate || 9600,
      deviceId: config.deviceId,
    });
    this.connection = connection;

    // Create SerialPort instance
    const port = new SerialPort({
      path: config.portName,
      baudRate: config.baudRate || 9600,
      dataBits: config.dataBits || 8,
      stopBits: config.stopBits || 1,
      parity: config.parity || 'none',
      autoOpen: false, // Open manually
      // Explicitly disable flow control (consistent with minicom)
      rtscts: false, // Hardware Flow Control
      xon: false, // Software Flow Control (XON)
      xoff: false, // Software Flow Control (XOFF)
    });
    this.port = port;
    const generation = ++this.generation;

    logger.debug('[USB] SerialPort instance created', 'usb', {
      path: config.portName,
      baudRate: config.baudRate || 9600,
      dataBits: config.dataBits || 8,
      stopBits: config.stopBits || 1,
      parity: config.parity || 'none',
      rtscts: false,
      xon: false,
      xoff: false,
    });

    const savedConfig = config;
    let openCompleted = false;
    let completeOpen!: () => void;
    const openPromise = new Promise<void>((resolveOpen) => {
      completeOpen = () => {
        if (openCompleted) {
          return;
        }
        openCompleted = true;
        resolveOpen();
      };
    });
    this.openCompletion = { port, promise: openPromise };

    // Wait for connection completion as a Promise
    return new Promise((resolve, reject) => {
      this.pendingConnect = { generation, port, connection, resolve, reject };

      // Register event listeners
      port.on('open', () => {
        void this.initializePort(port, savedConfig, connection, generation);
      });

      port.on('error', (error: Error) => {
        logger.error('[USB] port.on("error") fired', 'usb', {
          message: error.message,
          stack: error.stack,
        });
        void this.handlePortError(port, connection, generation, error);
      });

      port.on('close', () => {
        logger.debug('[USB] port.on("close") fired - connection closed', 'usb');
        void this.handlePortClose(port, connection, generation);
      });

      // Open the port
      port.open((error) => {
        completeOpen();
        if (this.openCompletion?.port === port) {
          this.openCompletion = null;
        }
        logger.debug('[USB] port.open() callback', 'usb', {
          error: error?.message ?? 'none',
        });

        if (error) {
          void this.failConnectionAttempt(port, connection, generation, error);
        }
      });
    });
  }

  /**
   * Disconnect from the target
   */
  async disconnect(): Promise<void> {
    this.connectionOperationGeneration += 1;
    await this.disconnectCurrent();
  }

  private async disconnectCurrent(): Promise<void> {
    const port = this.port;
    const connection = this.connection;
    this.generation += 1;
    this.onPortUnavailable();

    const pending = this.pendingConnect;
    if (pending && (!port || pending.port === port)) {
      this.pendingConnect = null;
      pending.reject(
        ErrorCatalog.createError('CONNECTION_FAILED', {
          reason: 'Connection attempt was cancelled',
        }),
      );
    }

    if (port) {
      await this.closePort(port);
      if (this.port === port) {
        this.port = null;
      }
    }

    if (connection && this.connection?.id === connection.id) {
      this.connection = this.connection.disconnect();
    }
  }

  /**
   * Reconnect to the target
   */
  async reconnect(): Promise<void> {
    const operationGeneration = ++this.connectionOperationGeneration;

    // Error if no connection settings are available
    if (!this.config) {
      throw ErrorCatalog.createError('CONNECTION_FAILED', {
        reason: 'No connection config available for reconnect',
      });
    }

    // Check maximum attempt count
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw ErrorCatalog.createError('MAX_RECONNECT_EXCEEDED');
    }

    const config = this.config;

    // Increment reconnect attempt count
    this.reconnectAttempts++;

    // Disconnect existing connection
    await this.disconnectCurrent();
    this.ensureCurrentConnectionOperation(operationGeneration);

    // Reconnect
    await this.connectForOperation(config, operationGeneration);
  }

  /**
   * Get the current connection state
   */
  getStatus(): ConnectionStatus {
    if (!this.port) {
      return ConnectionStatus.disconnected();
    }

    if (this.connection?.hasError) {
      return ConnectionStatus.error();
    }

    return this.port.isOpen ? ConnectionStatus.connected() : ConnectionStatus.disconnected();
  }

  /**
   * Get a list of available USB ports
   */
  async listPorts(): Promise<USBPortInfo[]> {
    return await this.deviceDetector.listPorts();
  }

  /**
   * Attempt automatic reconnection
   */
  async attemptReconnect(): Promise<void> {
    const logger = getLogger();
    logger.debug('[USB] attemptReconnect() called', 'usb', {
      currentAttempts: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
    });

    try {
      await this.reconnect();
    } catch (error) {
      logger.error('[USB] reconnect() failed', 'usb', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Emit reconnect failure event
      this.emitter.emit('reconnectFailed', { attempts: this.reconnectAttempts, lastError: toError(error) });
    }
  }

  /**
   * Recover an established connection after a protocol-level failure.
   * The same path is also used by SerialPort error/close events so cleanup,
   * disconnect bookkeeping, and reconnect ordering cannot diverge.
   */
  async handleConnectionError(port: SerialPort, error: Error): Promise<void> {
    await this.recoverEstablishedConnection(port, error);
  }

  private async initializePort(
    port: SerialPort,
    config: USBConnectionConfig,
    connection: Connection,
    generation: number,
  ): Promise<void> {
    if (!this.isCurrent(port, generation, connection)) {
      return;
    }

    try {
      await this.onPortReady(port, config);
      if (!this.isCurrent(port, generation, connection)) {
        return;
      }

      if (!port.isOpen) {
        throw ErrorCatalog.createError('CONNECTION_FAILED', {
          reason: 'Port closed during initialization',
        });
      }

      const connectedConnection = connection.connect();
      this.reconnectAttempts = 0;
      this.connection = connectedConnection;
      this.resolvePendingConnect(generation, port, connectedConnection);
      this.emitter.emit('connected', connectedConnection);
    } catch (error) {
      await this.failConnectionAttempt(port, connection, generation, toError(error));
    }
  }

  private async handlePortError(
    port: SerialPort,
    connection: Connection,
    generation: number,
    error: Error,
  ): Promise<void> {
    if (!this.isCurrent(port, generation, connection)) {
      return;
    }

    if (this.connection?.id === connection.id && this.connection.isConnected) {
      await this.recoverEstablishedConnection(port, error);
      return;
    }

    await this.failConnectionAttempt(port, connection, generation, error);
  }

  private async handlePortClose(port: SerialPort, connection: Connection, generation: number): Promise<void> {
    if (!this.isCurrent(port, generation, connection)) {
      return;
    }

    if (this.connection?.id === connection.id && this.connection.isConnected) {
      await this.recoverEstablishedConnection(port);
      return;
    }

    await this.failConnectionAttempt(
      port,
      connection,
      generation,
      ErrorCatalog.createError('CONNECTION_FAILED', { reason: 'Port closed during initialization' }),
    );
  }

  private async failConnectionAttempt(
    port: SerialPort,
    connection: Connection,
    generation: number,
    error: Error,
  ): Promise<void> {
    if (!this.isCurrent(port, generation, connection)) {
      return;
    }

    this.generation += 1;
    this.onPortUnavailable();
    if (this.connection?.id === connection.id) {
      this.connection = this.connection.setError(error.message);
    }
    this.emitter.emit('error', { error, recoverable: false });

    await this.closePort(port);
    if (this.port === port) {
      this.port = null;
    }
    this.rejectPendingConnect(generation, port, error);
  }

  private async recoverEstablishedConnection(port: SerialPort, error?: Error): Promise<void> {
    const generation = this.generation;
    const connection = this.connection;
    if (!connection || !connection.isConnected || !this.isCurrent(port, generation, connection)) {
      return;
    }

    // Invalidate every callback belonging to this port before stopping the
    // receiver. Pending writes may settle synchronously during stop().
    const recoveryGeneration = ++this.generation;
    this.onPortUnavailable();

    const terminalConnection = error ? connection.setError(error.message).disconnect() : connection.disconnect();
    this.connection = terminalConnection;
    if (error) {
      this.emitter.emit('error', { error, recoverable: false });
    }
    this.emitter.emit('disconnected');

    await this.closePort(port);
    if (this.port === port) {
      this.port = null;
    }

    // An explicit disconnect or a newer connect attempt supersedes this
    // recovery while the old port is closing. Do not reopen a connection after
    // the caller has changed the lifecycle generation.
    if (this.generation !== recoveryGeneration) {
      return;
    }

    await this.attemptReconnect();
  }

  private isCurrent(port: SerialPort, generation: number, connection: Connection): boolean {
    return this.generation === generation && this.port === port && this.connection?.id === connection.id;
  }

  private ensureCurrentConnectionOperation(operationGeneration: number): void {
    if (operationGeneration === this.connectionOperationGeneration) {
      return;
    }

    throw ErrorCatalog.createError('CONNECTION_FAILED', {
      reason: 'Connection attempt was cancelled',
    });
  }

  private resolvePendingConnect(generation: number, port: SerialPort, connection: Connection): void {
    const pending = this.pendingConnect;
    if (!pending || pending.generation !== generation || pending.port !== port) {
      return;
    }

    this.pendingConnect = null;
    pending.resolve(connection);
  }

  private rejectPendingConnect(generation: number, port: SerialPort, error: Error): void {
    const pending = this.pendingConnect;
    if (!pending || pending.generation !== generation || pending.port !== port) {
      return;
    }

    this.pendingConnect = null;
    pending.reject(error);
  }

  private async closePort(port: SerialPort): Promise<void> {
    const existingCompletion = this.closeCompletions.get(port);
    if (existingCompletion) {
      await existingCompletion;
      return;
    }

    const completion = this.performClosePort(port);
    this.closeCompletions.set(port, completion);
    try {
      await completion;
    } finally {
      if (this.closeCompletions.get(port) === completion) {
        this.closeCompletions.delete(port);
      }
    }
  }

  private async performClosePort(port: SerialPort): Promise<void> {
    const openCompletion = this.openCompletion?.port === port ? this.openCompletion.promise : null;
    port.removeAllListeners();

    if (port.opening && openCompletion) {
      await openCompletion;
    }

    if (port.closing) {
      await new Promise<void>((resolve) => {
        const finish = (): void => {
          port.removeListener('close', finish);
          port.removeListener('error', finish);
          resolve();
        };
        port.once('close', finish);
        port.once('error', finish);
      });
    }

    if (!port.isOpen) {
      return;
    }

    await new Promise<void>((resolve) => {
      port.close((error) => {
        if (error) {
          const logger = getLogger();
          logger.error(
            'Disconnect error',
            'usb',
            error instanceof Error ? { error: error.stack } : { error: String(error) },
          );
        }
        resolve();
      });
    });
  }
}
