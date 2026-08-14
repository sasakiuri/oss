// SPDX-License-Identifier: MIT
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import { BPT216TargetProtocol } from '../bpt216/BPT216TargetProtocol';
import type { USBConnectionConfig } from '../IUSBConnectionManager';
import { RedDotTargetProtocol } from '../reddot/RedDotTargetProtocol';

import { DirectSerialTargetProtocol } from './DirectSerialTargetProtocol';
import type { TargetProtocol } from './TargetProtocol';

/** Resolves a device configuration to its hardware protocol implementation. */
export class TargetProtocolRegistry {
  constructor(private readonly protocols: readonly TargetProtocol[]) {
    if (protocols.length === 0) {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'At least one target protocol is required',
      });
    }
  }

  static createDefault(): TargetProtocolRegistry {
    return new TargetProtocolRegistry([
      // Match DISAG identity mismatches here as well, so invalid RedDot
      // configurations fail before an OS port is opened.
      new RedDotTargetProtocol(),
      new BPT216TargetProtocol(),
      new DirectSerialTargetProtocol('MT201', (config) => config.deviceId === 'MT201'),
      // Preserve the established transparent serial behavior for existing
      // SIUS, Meyton, Custom, and manufacturer-routed configurations.
      new DirectSerialTargetProtocol('DIRECT_SERIAL', () => true),
    ]);
  }

  resolve(config: USBConnectionConfig): TargetProtocol {
    const protocol = this.protocols.find((candidate) => candidate.matches(config));
    if (!protocol) {
      throw ErrorCatalog.createError('INVALID_TARGET', {
        reason: 'No target protocol matches the connection configuration',
        manufacturer: config.manufacturer.value,
        deviceId: config.deviceId ?? 'unspecified',
      });
    }
    return protocol;
  }
}
