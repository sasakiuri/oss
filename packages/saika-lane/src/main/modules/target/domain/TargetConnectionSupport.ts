// SPDX-License-Identifier: MIT
import { findTargetDeviceDefinition } from './targetDeviceDefinitions';

export interface ITargetConnectionSupport {
  unavailableReason(manufacturerId: string, deviceId?: string): string | null;
}

/** Connection availability follows the installed readers, independently of target geometry and competition rules. */
export class TargetConnectionSupport implements ITargetConnectionSupport {
  constructor(
    private readonly adapters: {
      hasAdapter(manufacturerId: string): boolean;
      hasDeviceAdapter(deviceId: string): boolean;
    },
  ) {}

  unavailableReason(manufacturerId: string, deviceId?: string): string | null {
    if (deviceId !== undefined) {
      const definition = findTargetDeviceDefinition(deviceId);
      if (definition && definition.manufacturer !== manufacturerId)
        return `Device ${deviceId} belongs to ${definition.manufacturer}, not ${manufacturerId}`;
      if (!this.adapters.hasDeviceAdapter(deviceId)) return `No serial connection is available for device ${deviceId}`;
    } else if (!this.adapters.hasAdapter(manufacturerId)) {
      return `No serial connection is available for manufacturer ${manufacturerId}`;
    }
    return null;
  }
}
