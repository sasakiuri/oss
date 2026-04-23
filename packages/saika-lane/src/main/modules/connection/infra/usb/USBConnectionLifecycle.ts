// SPDX-License-Identifier: MIT
import { SerialPort } from 'serialport';

import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { Mode } from '@/main/modules/session/domain/Mode';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';

import type { USBConnectionConfig, USBPortInfo } from './IUSBConnectionManager';
import { USBDeviceDetector } from './USBDeviceDetector';
import type { USBEventEmitter } from './USBEventEmitter';

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

  /**
   * @param emitter - Event emitter
   * @param onPortReady - Callback invoked when the port opens successfully (for data pipeline attachment)
   */
  constructor(
    private readonly emitter: USBEventEmitter,
    private readonly onPortReady: (port: SerialPort, config: USBConnectionConfig) => void,
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

    // Disconnect if an existing connection is present
    if (this.port?.isOpen) {
      await this.disconnect();
    }

    // Save connection settings
    this.config = config;

    // Create Connection entity
    this.connection = Connection.create({
      manufacturer: config.manufacturer,
      portPath: config.portName,
      baudRate: config.baudRate || 9600,
      deviceId: config.deviceId,
    });

    // Create SerialPort instance
    this.port = new SerialPort({
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

    // Null safety: capture local references after initialization
    const port = this.port;
    const savedConfig = this.config;

    if (!port || !this.connection || !savedConfig) {
      throw ErrorCatalog.createError('CONNECTION_FAILED', {
        reason: 'Port or connection initialization failed',
      });
    }

    // Wait for connection completion as a Promise
    return new Promise((resolve, reject) => {
      // Register event listeners
      port.on('open', () => {
        logger.debug('[USB] port.on("open") fired - connection successful', 'usb');

        // Reset reconnect attempt count
        this.reconnectAttempts = 0;

        // Set up the data pipeline
        this.onPortReady(port, savedConfig);

        // Update Connection entity to connected state
        if (!this.connection) {
          reject(
            ErrorCatalog.createError('CONNECTION_FAILED', {
              reason: 'Connection lost during open',
            }),
          );
          return;
        }
        this.connection = this.connection.connect();

        // Emit connection success event
        this.emitter.emit('connected', this.connection);

        resolve(this.connection);
      });

      port.on('error', (error: Error) => {
        logger.error('[USB] port.on("error") fired', 'usb', {
          message: error.message,
          stack: error.stack,
        });

        // Update to error state
        if (this.connection) {
          this.connection = this.connection.setError(error.message);
        }

        // Emit error event
        this.emitter.emit('error', { error, recoverable: false });

        reject(error);
      });

      // Open the port
      port.open((error) => {
        logger.debug('[USB] port.open() callback', 'usb', {
          error: error?.message ?? 'none',
        });

        if (error) {
          // Update to error state
          if (this.connection) {
            this.connection = this.connection.setError(error.message);
          }

          // Emit error event
          this.emitter.emit('error', { error, recoverable: false });

          reject(error);
        }
      });
    });
  }

  /**
   * Disconnect from the target
   */
  async disconnect(): Promise<void> {
    const port = this.port;
    if (!port?.isOpen) {
      return;
    }

    // Remove all listeners to ensure OS port lock is released
    port.removeAllListeners();

    return new Promise((resolve) => {
      port.close((error) => {
        if (error) {
          // Even if an error occurs, treat disconnection as complete
          const logger = getLogger();
          logger.error(
            'Disconnect error',
            'usb',
            error instanceof Error ? { error: error.stack } : { error: String(error) },
          );
        }

        this.port = null;

        // Update Connection entity to disconnected state
        if (this.connection) {
          this.connection = this.connection.disconnect();
        }

        resolve();
      });
    });
  }

  /**
   * Reconnect to the target
   */
  async reconnect(): Promise<void> {
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

    // Increment reconnect attempt count
    this.reconnectAttempts++;

    // Disconnect existing connection
    await this.disconnect();

    // Reconnect
    await this.connect(this.config);
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
   * Send a mode byte to the device
   *
   * Sends 'S' for sighting mode (SIGHTING) or 'R' for match mode (MATCH).
   * Logs via logger.warn if the port is not open or if sending fails, without propagating exceptions.
   *
   * @param mode - The mode to send
   */
  async sendMode(mode: Mode): Promise<void> {
    const logger = getLogger();
    const byteChar = mode.isSighting() ? 'S' : 'R';

    if (!this.port?.isOpen) {
      logger.warn('[USB] sendMode: port is not open, skipping', 'usb', { mode: mode.value, byte: byteChar });
      return;
    }

    return new Promise<void>((resolve) => {
      this.port!.write(Buffer.from(byteChar), (err) => {
        if (err) {
          logger.warn('[USB] sendMode: write failed', 'usb', {
            mode: mode.value,
            byte: byteChar,
            error: err.message,
          });
        }
        resolve();
      });
    });
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
}
