// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';

import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type {
  IUSBConnectionManager,
  SessionContextProvider,
  USBConnectionConfig,
  USBConnectionEvents,
  USBPortInfo,
} from '@/main/modules/connection/domain/IUSBConnectionManager';
import type { Mode } from '@/main/modules/session/domain/Mode';
import type { ISerialDataParser } from '@/main/modules/target/domain/ISerialDataParser';
import type { ITargetDataConverter } from '@/main/modules/target/domain/ITargetDataConverter';
import {
  TargetConnectionSupport,
  type TargetAdapterAvailability,
} from '@/main/modules/target/domain/TargetConnectionSupport';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { TargetProtocolSession } from './protocol/TargetProtocol';
import { TargetProtocolRegistry } from './protocol/TargetProtocolRegistry';
import { USBConnectionLifecycle } from './USBConnectionLifecycle';
import { USBDataPipeline } from './USBDataPipeline';
import { USBEventEmitter } from './USBEventEmitter';

/**
 * USBConnectionManager class
 *
 * A facade responsible for managing the lifecycle of USB connections.
 * Implements the IUSBConnectionManager interface,
 * combining USBEventEmitter, USBConnectionLifecycle, and USBDataPipeline.
 */
export class USBConnectionManager implements IUSBConnectionManager {
  private readonly emitter: USBEventEmitter;
  private readonly lifecycle: USBConnectionLifecycle;
  private readonly pipeline: USBDataPipeline;
  private readonly targetConnectionSupport: TargetConnectionSupport;
  private sessionContextProvider: SessionContextProvider | null = null;
  private activeProtocol: { readonly port: SerialPort; readonly session: TargetProtocolSession } | null = null;

  constructor(
    target: {
      /** The registered target adapters, which decide whether a device can be connected. */
      adapters: TargetAdapterAvailability;
      dataParser: ISerialDataParser;
      dataConverter: ITargetDataConverter;
    },
    private readonly protocolRegistry = TargetProtocolRegistry.createDefault(),
  ) {
    this.targetConnectionSupport = new TargetConnectionSupport(target.adapters);
    this.emitter = new USBEventEmitter();
    this.pipeline = new USBDataPipeline(target.dataParser, target.dataConverter, this.emitter);
    this.lifecycle = new USBConnectionLifecycle(
      this.emitter,
      (port, config) => this.attachProtocol(port, config),
      () => this.detachProtocol(),
    );
  }

  async connect(config: USBConnectionConfig): Promise<Connection> {
    this.validateConfig(config);
    this.detachProtocol();
    return this.lifecycle.connect(config);
  }

  async disconnect(): Promise<void> {
    this.detachProtocol();
    return this.lifecycle.disconnect();
  }

  async reconnect(): Promise<void> {
    if (this.lifecycle.config) {
      this.validateConfig(this.lifecycle.config);
    }
    this.detachProtocol();
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
    this.sessionContextProvider = provider;
    this.pipeline.setSessionContextProvider(provider);
  }

  setOnShotDetected(callback: () => void): void {
    this.pipeline.setOnShotDetected(callback);
  }

  resetShotCounter(): void {
    this.pipeline.resetCounter();
  }

  async sendMode(mode: Mode): Promise<void> {
    const activeProtocol = this.activeProtocol;
    if (!activeProtocol) {
      getLogger().warn('[USB] sendMode: target protocol is not active, skipping', 'usb', { mode: mode.value });
      return;
    }
    return activeProtocol.session.sendMode(mode);
  }

  private async attachProtocol(port: SerialPort, config: USBConnectionConfig): Promise<void> {
    const protocol = this.protocolRegistry.resolve(config);
    protocol.validate(config, this.sessionContextProvider);
    const session = protocol.createSession(port, config, () => this.sessionContextProvider, {
      onStreamData: (chunk) => this.pipeline.processReceivedData(chunk, config),
      onShotFrame: (frame, receivedAt) => this.pipeline.processShotFrame(frame, receivedAt, config),
      onConnectionError: (error) => {
        void this.lifecycle.handleConnectionError(port, error);
      },
    });
    this.activeProtocol = { port, session };

    try {
      await session.start();
    } catch (error) {
      if (this.activeProtocol?.session === session) {
        this.detachProtocol();
      }
      throw error;
    }
  }

  private detachProtocol(): void {
    const activeProtocol = this.activeProtocol;
    this.activeProtocol = null;
    if (!activeProtocol) {
      return;
    }

    try {
      activeProtocol.session.stop();
    } finally {
      this.pipeline.clearBufferedData();
    }
  }

  private validateConfig(config: USBConnectionConfig): void {
    const reason = this.targetConnectionSupport.unavailableReason(config.manufacturer.value, config.deviceId);
    if (reason) throw ErrorCatalog.createError('INVALID_TARGET', { reason });
    this.protocolRegistry.resolve(config).validate(config, this.sessionContextProvider);
  }
}
