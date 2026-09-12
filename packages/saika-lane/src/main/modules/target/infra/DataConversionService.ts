// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import { AdapterRegistry } from './AdapterRegistry';

/** Selects a device or manufacturer adapter and converts a received record to a shot. */
export class DataConversionService {
  private readonly registry: AdapterRegistry;

  constructor(registry: AdapterRegistry) {
    this.registry = registry;
  }

  /**
   * Converts RawData to a Shot object.
   *
   * Selects the appropriate adapter based on the manufacturer information in RawData,
   * and dispatches the conversion.
   *
   * @param rawData - RawData to convert
   * @param context - Adapter context (shot number, discipline, mode)
   * @returns Converted Shot entity
   * @throws DATA_CONVERSION_ERROR - If no corresponding adapter exists
   */
  convert(rawData: RawData, context: AdapterContext): Shot {
    const manufacturerValue = rawData.manufacturer.value;
    const adapter = this.registry.getAdapter(manufacturerValue);

    if (!adapter) {
      throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
        reason: 'Unsupported manufacturer',
        manufacturer: manufacturerValue,
        supportedManufacturers: this.registry.getRegisteredManufacturerIds(),
      });
    }

    return adapter.convert(rawData, context);
  }

  /**
   * Converts RawData to a Shot using a specified device ID.
   *
   * @param rawData - RawData to convert
   * @param deviceId - Device ID (MT201, BPT216, etc.)
   * @param context - Adapter context
   * @returns Converted Shot entity
   * @throws DATA_CONVERSION_ERROR - If no corresponding adapter exists
   */
  convertByDeviceId(rawData: RawData, deviceId: string, context: AdapterContext): Shot {
    const adapter = this.registry.getAdapterByDeviceId(deviceId);

    if (!adapter) {
      throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
        reason: 'Unknown or unsupported device ID',
        deviceId,
        supportedDevices: this.registry.getRegisteredDeviceIds(),
      });
    }

    return adapter.convert(rawData, context);
  }
}
