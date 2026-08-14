// SPDX-License-Identifier: MIT
import { app } from 'electron';
import type { SerialPort } from 'serialport';

import type { Mode } from '@/main/modules/session/domain/Mode';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

import type { SessionContextProvider, USBConnectionConfig } from '../IUSBConnectionManager';

import { writeModeCommand } from './ModeCommandWriter';
import type { TargetProtocol, TargetProtocolHandlers, TargetProtocolSession } from './TargetProtocol';

/**
 * Operationally proven MT-201 receive path.
 *
 * The same transparent stream behavior remains the compatibility fallback for
 * manufacturers that do not yet need a framed or polled protocol session.
 */
export class DirectSerialTargetProtocol implements TargetProtocol {
  constructor(
    readonly id: string,
    private readonly matcher: (config: USBConnectionConfig) => boolean,
  ) {}

  matches(config: USBConnectionConfig): boolean {
    return this.matcher(config);
  }

  validate(_config: USBConnectionConfig, _sessionContextProvider: SessionContextProvider | null): void {
    // The established MT-201 path relies on device selection to constrain the
    // discipline and performs record validation in the adapter.
  }

  createSession(
    port: SerialPort,
    config: USBConnectionConfig,
    _getSessionContextProvider: () => SessionContextProvider | null,
    handlers: TargetProtocolHandlers,
  ): TargetProtocolSession {
    return new DirectSerialTargetProtocolSession(this.id, port, config, handlers);
  }
}

export class DirectSerialTargetProtocolSession implements TargetProtocolSession {
  private running = false;

  private readonly dataListener = (chunk: Buffer): void => {
    const logger = getLogger();
    if (logger.isLevelEnabled('debug')) {
      logger.debug('[USB] data event received', 'usb', {
        protocolId: this.protocolId,
        chunkLength: chunk.length,
        chunkHexPreview: chunk.subarray(0, 32).toString('hex'),
      });
    }
    this.handlers.onStreamData(chunk);
  };

  private readonly readableListener = (): void => {
    const logger = getLogger();
    logger.debug('[USB] readable event fired - attempting to read', 'usb', { protocolId: this.protocolId });

    let chunk: Buffer | null;
    while ((chunk = this.port.read()) !== null) {
      if (logger.isLevelEnabled('debug')) {
        logger.debug('[USB] read() returned chunk', 'usb', {
          protocolId: this.protocolId,
          chunkLength: chunk.length,
          chunkHexPreview: chunk.subarray(0, 32).toString('hex'),
        });
      }
      this.handlers.onStreamData(chunk);
    }
  };

  constructor(
    private readonly protocolId: string,
    private readonly port: SerialPort,
    private readonly config: USBConnectionConfig,
    private readonly handlers: TargetProtocolHandlers,
  ) {}

  async start(): Promise<void> {
    if (this.running) {
      this.stop();
    }

    const logger = getLogger();
    const useReadableMode = !app.isPackaged && process.env.USE_READABLE_MODE === 'true';
    logger.debug('[USB] Direct protocol session starting', 'usb', {
      protocolId: this.protocolId,
      deviceId: this.config.deviceId,
      eventMode: useReadableMode ? 'readable' : 'data',
    });

    this.running = true;
    if (useReadableMode) {
      this.port.on('readable', this.readableListener);
    } else {
      this.port.on('data', this.dataListener);
    }
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.port.removeListener('data', this.dataListener);
    this.port.removeListener('readable', this.readableListener);
    this.running = false;
  }

  sendMode(mode: Mode): Promise<void> {
    return writeModeCommand(this.port, mode, this.protocolId);
  }
}
