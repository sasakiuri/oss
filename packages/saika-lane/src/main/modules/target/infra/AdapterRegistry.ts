// SPDX-License-Identifier: MIT
import type { ITargetAdapter } from '@/main/modules/target/adapters/ITargetAdapter';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Maps manufacturer and device IDs to adapters registered in target.module.ts. */
export class AdapterRegistry {
  private readonly adapters: Map<string, ITargetAdapter>;

  private readonly deviceAdapters: Map<string, ITargetAdapter>;

  constructor() {
    this.adapters = new Map<string, ITargetAdapter>();
    this.deviceAdapters = new Map<string, ITargetAdapter>();
  }

  registerAdapter(manufacturerId: string, adapter: ITargetAdapter): void {
    this.adapters.set(manufacturerId, adapter);
  }

  removeAdapter(manufacturerId: string): boolean {
    return this.adapters.delete(manufacturerId);
  }

  hasAdapter(manufacturerId: string): boolean {
    return this.adapters.has(manufacturerId);
  }

  getAdapterCount(): number {
    return this.adapters.size;
  }

  getAdapter(manufacturerId: string): ITargetAdapter | undefined {
    return this.adapters.get(manufacturerId);
  }

  /**
   * Assigns a manufacturer adapter to a device ID.
   *
   * @param deviceId - Device ID (MT201, BPT216, etc.)
   * @param manufacturerId - Manufacturer ID
   * @throws DATA_CONVERSION_ERROR - If the manufacturer is not registered
   */
  assignDeviceAdapter(deviceId: string, manufacturerId: string): void {
    const adapter = this.adapters.get(manufacturerId);

    if (!adapter) {
      throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
        reason: 'Cannot assign device adapter: manufacturer not registered',
        manufacturerId,
        deviceId,
      });
    }

    this.deviceAdapters.set(deviceId, adapter);
  }

  /**
   * Registers a device-specific adapter without changing the manufacturer
   * fallback adapter.
   */
  registerDeviceAdapter(deviceId: string, adapter: ITargetAdapter): void {
    this.deviceAdapters.set(deviceId, adapter);
  }

  getAdapterByDeviceId(deviceId: string): ITargetAdapter | undefined {
    return this.deviceAdapters.get(deviceId);
  }

  hasDeviceAdapter(deviceId: string): boolean {
    return this.deviceAdapters.has(deviceId);
  }

  getRegisteredManufacturerIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  getRegisteredDeviceIds(): string[] {
    return Array.from(this.deviceAdapters.keys());
  }
}
