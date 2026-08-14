// SPDX-License-Identifier: MIT
import type { SerialPort } from 'serialport';

import type { Mode } from '@/main/modules/session/domain/Mode';
import { isBpt216DeviceId } from '@/main/modules/target/domain/targetDeviceDefinitions';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { toError } from '@/shared/errors/toError';

import type { SessionContextProvider, USBConnectionConfig } from '../IUSBConnectionManager';
import { writeModeCommand } from '../protocol/ModeCommandWriter';
import type { TargetProtocol, TargetProtocolHandlers, TargetProtocolSession } from '../protocol/TargetProtocol';

import { BPT216ProtocolSession } from './BPT216ProtocolSession';

/** Hardware protocol boundary for Kohto BPT-216 targets. */
export class BPT216TargetProtocol implements TargetProtocol {
  readonly id = 'BPT216';

  matches(config: USBConnectionConfig): boolean {
    return isBpt216DeviceId(config.deviceId);
  }

  validate(config: USBConnectionConfig, sessionContextProvider: SessionContextProvider | null): void {
    if (config.manufacturer.value !== 'KOHTO') {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'BPT-216 requires the KOHTO manufacturer',
        manufacturer: config.manufacturer.value,
        deviceId: config.deviceId,
      });
    }

    const currentDiscipline = readDiscipline(sessionContextProvider);
    if (currentDiscipline !== 'BEAM_PISTOL_10M') {
      throw ErrorCatalog.createError('INCOMPATIBLE_TARGET_DISCIPLINE', {
        deviceId: config.deviceId,
        currentDiscipline,
        requiredDiscipline: 'BEAM_PISTOL_10M',
      });
    }
  }

  createSession(
    port: SerialPort,
    config: USBConnectionConfig,
    getSessionContextProvider: () => SessionContextProvider | null,
    handlers: TargetProtocolHandlers,
  ): TargetProtocolSession {
    return new BPT216TargetProtocolSession(port, () => this.validate(config, getSessionContextProvider()), handlers);
  }
}

class BPT216TargetProtocolSession implements TargetProtocolSession {
  private readonly session: BPT216ProtocolSession;

  constructor(
    private readonly port: SerialPort,
    private readonly validateContext: () => void,
    handlers: TargetProtocolHandlers,
  ) {
    this.session = new BPT216ProtocolSession(port, {
      onFrame: (frame, receivedAt) => {
        try {
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
    this.validateContext();
    this.session.start();
  }

  stop(): void {
    this.session.stop();
  }

  sendMode(mode: Mode): Promise<void> {
    return writeModeCommand(this.port, mode, 'BPT216');
  }
}

function readDiscipline(sessionContextProvider: SessionContextProvider | null): string {
  try {
    return sessionContextProvider?.().discipline.value ?? 'NONE';
  } catch {
    return 'NONE';
  }
}
