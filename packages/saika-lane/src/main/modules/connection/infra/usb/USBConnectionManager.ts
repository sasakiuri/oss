// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';

import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { Mode } from '@/main/modules/session/domain/Mode';
import { DISAG_RED_DOT_RIFLE_DEVICE_ID } from '@/main/modules/target/domain/targetDeviceDefinitions';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import { DataConversionService } from '@/main/modules/target/infra/DataConversionService';
import { SerialDataParser } from '@/main/modules/target/infra/SerialDataParser';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type {
  IUSBConnectionManager,
  USBConnectionConfig,
  USBConnectionEvents,
  USBPortInfo,
} from './IUSBConnectionManager';
import { RedDotProtocolSession } from './reddot/RedDotProtocolSession';
import { USBConnectionLifecycle } from './USBConnectionLifecycle';
import { USBDataPipeline, type SessionContextProvider } from './USBDataPipeline';
import { USBEventEmitter } from './USBEventEmitter';

/**
 * USBConnectionManager class
 *
 * A facade responsible for managing the lifecycle of USB connections.
 * Implements the IUSBConnectionManager interface,
 * combining USBEventEmitter, USBConnectionLifecycle, and USBDataPipeline.
 *
 * @example
 * ```typescript
 * const manager = new USBConnectionManager(adapterRegistry);
 *
 * // Connect
 * const connection = await manager.connect({
 *   portName: 'COM3',
 *   manufacturer: TargetManufacturer.custom(),
 *   baudRate: 9600,
 * });
 *
 * // Data reception listener
 * manager.on('data', (data) => {
 *   console.log(`Impact point: X=${data.x}, Y=${data.y}`);
 * });
 *
 * // Disconnect
 * await manager.disconnect();
 * ```
 */
export class USBConnectionManager implements IUSBConnectionManager {
  private readonly emitter: USBEventEmitter;
  private readonly lifecycle: USBConnectionLifecycle;
  private readonly pipeline: USBDataPipeline;
  private redDotSession: RedDotProtocolSession | null = null;
  private redDotClosePort: SerialPort | null = null;
  private redDotCloseListener: (() => void) | null = null;

  constructor(adapterRegistry: AdapterRegistry) {
    this.emitter = new USBEventEmitter();
    const dataParser = new SerialDataParser(SerialDataParser.defaultParsers());
    const dataConversionService = new DataConversionService(adapterRegistry);
    this.pipeline = new USBDataPipeline(dataParser, dataConversionService, this.emitter);
    this.lifecycle = new USBConnectionLifecycle(
      this.emitter,
      (port, config) => this.attachReceiver(port, config),
      () => this.redDotSession?.stop(),
    );
  }

  async connect(config: USBConnectionConfig): Promise<Connection> {
    this.validateConfig(config);
    this.detachReceivers();
    return this.lifecycle.connect(config);
  }

  async disconnect(): Promise<void> {
    this.detachReceivers();
    return this.lifecycle.disconnect();
  }

  async reconnect(): Promise<void> {
    this.detachReceivers();
    return this.lifecycle.reconnect();
  }

  getStatus(): ConnectionStatus {
    return this.lifecycle.getStatus();
  }

  async listPorts(): Promise<USBPortInfo[]> {
    return this.lifecycle.listPorts();
  }

  on<E extends keyof USBConnectionEvents>(event: E, listener: (data: USBConnectionEvents[E]) => void): () => void {
    return this.emitter.on(event, listener);
  }

  setSessionContextProvider(provider: SessionContextProvider): void {
    this.pipeline.setSessionContextProvider(provider);
  }

  setOnShotDetected(callback: () => void): void {
    this.pipeline.setOnShotDetected(callback);
  }

  resetShotCounter(): void {
    this.pipeline.resetCounter();
  }

  async sendMode(mode: Mode): Promise<void> {
    return this.lifecycle.sendMode(mode);
  }

  private async attachReceiver(port: SerialPort, config: USBConnectionConfig): Promise<void> {
    if (config.deviceId !== DISAG_RED_DOT_RIFLE_DEVICE_ID) {
      this.pipeline.attach(port, config, () => this.lifecycle.attemptReconnect());
      return;
    }

    const session = new RedDotProtocolSession(port, {
      onFrame: (frame, receivedAt) => this.pipeline.processValidatedFrame(frame, receivedAt, config),
      onConnectionError: (error) => this.handleRedDotConnectionError(session, error),
    });

    const closeListener = (): void => {
      if (this.redDotSession !== session) {
        return;
      }
      this.detachRedDotReceiver();
      this.emitter.emit('disconnected');
      void this.lifecycle.attemptReconnect();
    };

    this.redDotSession = session;
    this.redDotClosePort = port;
    this.redDotCloseListener = closeListener;
    port.on('close', closeListener);

    try {
      await session.start();
    } catch (error) {
      if (this.redDotSession === session) {
        this.detachRedDotReceiver();
      }
      throw error;
    }
  }

  private handleRedDotConnectionError(session: RedDotProtocolSession, error: Error): void {
    if (this.redDotSession !== session) {
      return;
    }

    this.detachRedDotReceiver();
    this.emitter.emit('error', { error, recoverable: false });
    void this.lifecycle.attemptReconnect();
  }

  private detachReceivers(): void {
    this.detachRedDotReceiver();
    this.pipeline.detach();
  }

  private detachRedDotReceiver(): void {
    const session = this.redDotSession;
    const port = this.redDotClosePort;
    const closeListener = this.redDotCloseListener;

    session?.stop();
    if (port && closeListener) {
      port.removeListener('close', closeListener);
    }

    this.redDotSession = null;
    this.redDotClosePort = null;
    this.redDotCloseListener = null;
  }

  private validateConfig(config: USBConnectionConfig): void {
    const isDisag = config.manufacturer.value === 'DISAG';
    const isRedDot = config.deviceId === DISAG_RED_DOT_RIFLE_DEVICE_ID;

    if ((isDisag && !isRedDot) || (isRedDot && !isDisag)) {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'DISAG RedDot requires matching manufacturer and device ID',
        manufacturer: config.manufacturer.value,
        deviceId: config.deviceId,
      });
    }
  }
}
