// SPDX-License-Identifier: MIT
import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { Mode } from '@/main/modules/session/domain/Mode';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import { DataConversionService } from '@/main/modules/target/infra/DataConversionService';
import { SerialDataParser } from '@/main/modules/target/infra/SerialDataParser';

import type {
  IUSBConnectionManager,
  USBConnectionConfig,
  USBConnectionEvents,
  USBPortInfo,
} from './IUSBConnectionManager';
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

  constructor(adapterRegistry: AdapterRegistry) {
    this.emitter = new USBEventEmitter();
    const dataParser = new SerialDataParser(SerialDataParser.defaultParsers());
    const dataConversionService = new DataConversionService(adapterRegistry);
    this.pipeline = new USBDataPipeline(dataParser, dataConversionService, this.emitter);
    this.lifecycle = new USBConnectionLifecycle(this.emitter, (port, config) => {
      this.pipeline.attach(port, config, () => this.lifecycle.attemptReconnect());
    });
  }

  async connect(config: USBConnectionConfig): Promise<Connection> {
    return this.lifecycle.connect(config);
  }

  async disconnect(): Promise<void> {
    this.pipeline.detach();
    return this.lifecycle.disconnect();
  }

  async reconnect(): Promise<void> {
    this.pipeline.detach();
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
}
