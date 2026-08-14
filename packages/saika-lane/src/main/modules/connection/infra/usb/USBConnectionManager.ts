// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';

import { Connection } from '@/main/modules/connection/domain/Connection';
import { ConnectionStatus } from '@/main/modules/connection/domain/ConnectionStatus';
import type { Mode } from '@/main/modules/session/domain/Mode';
import {
  isBpt216DeviceId,
  getDisagRedDotDiscipline,
  getDisagRedDotTargetType,
  isDisagRedDotDeviceId,
} from '@/main/modules/target/domain/targetDeviceDefinitions';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import { DataConversionService } from '@/main/modules/target/infra/DataConversionService';
import { SerialDataParser } from '@/main/modules/target/infra/SerialDataParser';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';

import { BPT216ProtocolSession } from './bpt216/BPT216ProtocolSession';
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
  private sessionContextProvider: SessionContextProvider | null = null;
  private redDotReceiver: { readonly port: SerialPort; readonly session: RedDotProtocolSession } | null = null;
  private bpt216Receiver: { readonly port: SerialPort; readonly session: BPT216ProtocolSession } | null = null;

  constructor(adapterRegistry: AdapterRegistry) {
    this.emitter = new USBEventEmitter();
    const dataParser = new SerialDataParser(SerialDataParser.defaultParsers());
    const dataConversionService = new DataConversionService(adapterRegistry);
    this.pipeline = new USBDataPipeline(dataParser, dataConversionService, this.emitter);
    this.lifecycle = new USBConnectionLifecycle(
      this.emitter,
      (port, config) => this.attachReceiver(port, config),
      () => this.detachReceivers(),
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
    if (this.lifecycle.config) {
      this.validateConfig(this.lifecycle.config);
    }
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
    return this.lifecycle.sendMode(mode);
  }

  private async attachReceiver(port: SerialPort, config: USBConnectionConfig): Promise<void> {
    if (isBpt216DeviceId(config.deviceId)) {
      this.validateBpt216SessionContext(config);
      const session = new BPT216ProtocolSession(port, {
        onFrame: (frame, receivedAt) => {
          try {
            this.validateBpt216SessionContext(config);
            this.pipeline.processBpt216Frame(frame, receivedAt, config);
          } catch (error) {
            void this.lifecycle.handleConnectionError(port, toError(error));
          }
        },
        onConnectionError: (error) => {
          void this.lifecycle.handleConnectionError(port, error);
        },
      });
      this.bpt216Receiver = { port, session };
      session.start();
      return;
    }

    if (!isDisagRedDotDeviceId(config.deviceId)) {
      this.pipeline.attach(port, config);
      return;
    }

    this.validateRedDotSessionContext(config);
    const targetType = getDisagRedDotTargetType(config.deviceId);
    if (targetType === null) {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'Unsupported RedDot target type',
        deviceId: config.deviceId,
      });
    }

    const session = new RedDotProtocolSession(port, {
      targetType,
      onFrame: (frame, receivedAt) => {
        try {
          // The active session can be reset or replaced while the serial port
          // remains open. Recheck it for every accepted frame so a post-ACK
          // conversion failure cannot remain a silent shot loss.
          this.validateRedDotSessionContext(config);
          this.pipeline.processValidatedFrame(frame, receivedAt, config);
        } catch (error) {
          void this.lifecycle.handleConnectionError(port, toError(error));
        }
      },
      onConnectionError: (error) => {
        void this.lifecycle.handleConnectionError(port, error);
      },
    });

    this.redDotReceiver = { port, session };

    try {
      await session.start();
    } catch (error) {
      if (this.redDotReceiver?.session === session) {
        this.detachRedDotReceiver();
      }
      throw error;
    }
  }

  private detachReceivers(): void {
    this.detachBpt216Receiver();
    this.detachRedDotReceiver();
    this.pipeline.detach();
  }

  private detachRedDotReceiver(): void {
    this.redDotReceiver?.session.stop();
    this.redDotReceiver = null;
  }

  private detachBpt216Receiver(): void {
    this.bpt216Receiver?.session.stop();
    this.bpt216Receiver = null;
  }

  private validateConfig(config: USBConnectionConfig): void {
    const isDisag = config.manufacturer.value === 'DISAG';
    const isRedDot = isDisagRedDotDeviceId(config.deviceId);
    const isBpt216 = isBpt216DeviceId(config.deviceId);

    if ((isDisag && !isRedDot) || (isRedDot && !isDisag)) {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'DISAG RedDot requires matching manufacturer and device ID',
        manufacturer: config.manufacturer.value,
        deviceId: config.deviceId,
      });
    }

    if (isRedDot) {
      this.validateRedDotSessionContext(config);
    }
    if (isBpt216 && config.manufacturer.value !== 'KOHTO') {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'BPT-216 requires the KOHTO manufacturer',
        manufacturer: config.manufacturer.value,
        deviceId: config.deviceId,
      });
    }
    if (isBpt216) {
      this.validateBpt216SessionContext(config);
    }
  }

  private validateBpt216SessionContext(config: USBConnectionConfig): void {
    let currentDiscipline = 'NONE';
    try {
      currentDiscipline = this.sessionContextProvider?.().discipline.value ?? 'NONE';
    } catch {
      // Report the same actionable configuration error for a missing session.
    }

    if (currentDiscipline !== 'BEAM_PISTOL_10M') {
      throw ErrorCatalog.createError('INCOMPATIBLE_TARGET_DISCIPLINE', {
        deviceId: config.deviceId,
        currentDiscipline,
        requiredDiscipline: 'BEAM_PISTOL_10M',
      });
    }
  }

  private validateRedDotSessionContext(config: USBConnectionConfig): void {
    let currentDiscipline = 'NONE';
    const requiredDiscipline = getDisagRedDotDiscipline(config.deviceId);

    if (requiredDiscipline === null) {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'Unsupported RedDot device ID',
        deviceId: config.deviceId,
      });
    }

    try {
      currentDiscipline = this.sessionContextProvider?.().discipline.value ?? 'NONE';
    } catch {
      // The dedicated configuration error below gives the renderer one
      // actionable message for both missing and incompatible sessions.
    }

    if (currentDiscipline !== requiredDiscipline) {
      throw ErrorCatalog.createError('INCOMPATIBLE_TARGET_DISCIPLINE', {
        deviceId: config.deviceId,
        currentDiscipline,
        requiredDiscipline,
      });
    }
  }
}
