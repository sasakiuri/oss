// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';

import type { Mode } from '@/main/modules/session/domain/Mode';
import {
  getDisagRedDotDiscipline,
  getDisagRedDotTargetType,
  isDisagRedDotDeviceId,
} from '@/main/modules/target/domain/targetDeviceDefinitions';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';

import type { SessionContextProvider, USBConnectionConfig } from '../IUSBConnectionManager';
import type { TargetProtocol, TargetProtocolHandlers, TargetProtocolSession } from '../protocol/TargetProtocol';

import { RedDotProtocolSession } from './RedDotProtocolSession';

/** Hardware protocol boundary for both KT RDT ZIE 1 target profiles. */
export class RedDotTargetProtocol implements TargetProtocol {
  readonly id = 'DISAG_RED_DOT';

  matches(config: USBConnectionConfig): boolean {
    return config.manufacturer.value === 'DISAG' || isDisagRedDotDeviceId(config.deviceId);
  }

  validate(config: USBConnectionConfig, sessionContextProvider: SessionContextProvider | null): void {
    const isDisag = config.manufacturer.value === 'DISAG';
    const isRedDot = isDisagRedDotDeviceId(config.deviceId);
    if ((isDisag && !isRedDot) || (isRedDot && !isDisag)) {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'DISAG RedDot requires matching manufacturer and device ID',
        manufacturer: config.manufacturer.value,
        deviceId: config.deviceId,
      });
    }

    const requiredDiscipline = getDisagRedDotDiscipline(config.deviceId);
    if (requiredDiscipline === null) {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'Unsupported RedDot device ID',
        deviceId: config.deviceId,
      });
    }

    const currentDiscipline = readDiscipline(sessionContextProvider);
    if (currentDiscipline !== requiredDiscipline) {
      throw ErrorCatalog.createError('INCOMPATIBLE_TARGET_DISCIPLINE', {
        deviceId: config.deviceId,
        currentDiscipline,
        requiredDiscipline,
      });
    }
  }

  createSession(
    port: SerialPort,
    config: USBConnectionConfig,
    getSessionContextProvider: () => SessionContextProvider | null,
    handlers: TargetProtocolHandlers,
  ): TargetProtocolSession {
    const targetType = getDisagRedDotTargetType(config.deviceId);
    if (targetType === null) {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'Unsupported RedDot target type',
        deviceId: config.deviceId,
      });
    }

    return new RedDotTargetProtocolSession(
      port,
      targetType,
      () => this.validate(config, getSessionContextProvider()),
      handlers,
    );
  }
}

class RedDotTargetProtocolSession implements TargetProtocolSession {
  private readonly session: RedDotProtocolSession;
  private generation = 0;
  private running = false;

  constructor(
    private readonly port: SerialPort,
    targetType: 'RIFLE' | 'PISTOL',
    private readonly validateContext: () => void,
    handlers: TargetProtocolHandlers,
  ) {
    this.session = new RedDotProtocolSession(port, {
      targetType,
      onFrame: (frame, receivedAt) => {
        try {
          // The active competition can change while the port remains open.
          this.validateContext();
          handlers.onShotFrame(frame, receivedAt);
        } catch (error) {
          handlers.onConnectionError(toError(error));
        }
      },
      onConnectionError: handlers.onConnectionError,
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      this.stop();
    }

    const generation = ++this.generation;
    this.running = true;

    try {
      this.validateContext();
      await disableControlSignals(this.port);
      this.ensureActive(generation);

      // The active competition may have changed while the asynchronous port
      // control operation was pending.
      this.validateContext();
      await this.session.start();
      this.ensureActive(generation);

      // The handshake can take more than a second when the Rifle fallback is
      // used. Do not report a ready connection if the active competition
      // changed while the target type was being initialized.
      this.validateContext();
    } catch (error) {
      if (this.isActive(generation)) {
        this.running = false;
        this.generation += 1;
        this.session.stop();
      }
      throw error;
    }
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    this.session.stop();
  }

  sendMode(_mode: Mode): Promise<void> {
    getLogger().debug('[USB] sendMode: RedDot uses session mode; serial write skipped', 'usb');
    return Promise.resolve();
  }

  private ensureActive(generation: number): void {
    if (this.isActive(generation)) {
      return;
    }

    throw ErrorCatalog.createError('CONNECTION_FAILED', {
      reason: 'RedDot target protocol initialization was cancelled',
    });
  }

  private isActive(generation: number): boolean {
    return this.running && this.generation === generation;
  }
}

function readDiscipline(sessionContextProvider: SessionContextProvider | null): string {
  try {
    return sessionContextProvider?.().discipline.value ?? 'NONE';
  } catch {
    return 'NONE';
  }
}

function disableControlSignals(port: SerialPort): Promise<void> {
  const configurablePort = port as SerialPort & {
    set?: (options: { dtr: boolean; rts: boolean }, callback: (error?: Error | null) => void) => void;
  };
  if (typeof configurablePort.set !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    configurablePort.set?.({ dtr: false, rts: false }, (error) => {
      if (error) {
        reject(
          ErrorCatalog.createError('CONNECTION_FAILED', { reason: 'Failed to disable DTR/RTS for RedDot' }, error),
        );
        return;
      }
      resolve();
    });
  });
}
