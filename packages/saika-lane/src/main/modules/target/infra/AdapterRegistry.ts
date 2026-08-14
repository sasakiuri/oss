// SPDX-License-Identifier: MIT
import type { ITargetAdapter } from '@/main/modules/target/adapters/ITargetAdapter';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * AdapterRegistry
 *
 * Registry managing ITargetAdapter instances per manufacturer.
 * Holds two mappings: manufacturer ID → adapter, and device ID → adapter.
 *
 * Responsibilities:
 * - Registering, removing, and looking up adapters
 * - Associating device IDs with adapters
 *
 * Adapter registration is performed in target.module.ts.
 *
 * @example
 * ```typescript
 * const registry = new AdapterRegistry();
 * registry.registerAdapter('CUSTOM', new CustomAdapter());
 * registry.registerAdapter('KOHTO', new MT201Adapter());
 * ```
 */
export class AdapterRegistry {
  /**
   * Adapter map keyed by manufacturer ID.
   * Holds ITargetAdapter instances keyed by TargetManufacturer.value.
   */
  private readonly adapters: Map<string, ITargetAdapter>;

  /**
   * Adapter map keyed by device ID.
   * Holds ITargetAdapter instances keyed by device ID (MT201, BPT216, etc.).
   */
  private readonly deviceAdapters: Map<string, ITargetAdapter>;

  /**
   * Creates an empty AdapterRegistry.
   *
   * Adapter registration is performed via register() in target.module.ts.
   */
  constructor() {
    this.adapters = new Map<string, ITargetAdapter>();
    this.deviceAdapters = new Map<string, ITargetAdapter>();
  }

  /**
   * Registers an adapter by manufacturer ID.
   *
   * @param manufacturerId - Manufacturer ID (TargetManufacturer.value)
   * @param adapter - Adapter to register
   */
  registerAdapter(manufacturerId: string, adapter: ITargetAdapter): void {
    this.adapters.set(manufacturerId, adapter);
  }

  /**
   * Removes an adapter by manufacturer ID.
   *
   * @param manufacturerId - Manufacturer ID to remove
   * @returns true if removal was successful
   */
  removeAdapter(manufacturerId: string): boolean {
    return this.adapters.delete(manufacturerId);
  }

  /**
   * Checks whether an adapter is registered for the specified manufacturer ID.
   *
   * @param manufacturerId - Manufacturer ID to check
   * @returns true if an adapter exists
   */
  hasAdapter(manufacturerId: string): boolean {
    return this.adapters.has(manufacturerId);
  }

  /**
   * Returns the number of registered adapters.
   *
   * @returns Number of registered adapters
   */
  getAdapterCount(): number {
    return this.adapters.size;
  }

  /**
   * Retrieves an adapter by manufacturer ID.
   *
   * @param manufacturerId - Manufacturer ID
   * @returns The adapter, or undefined if not registered
   */
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

  /**
   * Retrieves an adapter by device ID.
   *
   * @param deviceId - Device ID
   * @returns The adapter, or undefined if not registered
   */
  getAdapterByDeviceId(deviceId: string): ITargetAdapter | undefined {
    return this.deviceAdapters.get(deviceId);
  }

  /**
   * Returns the list of registered manufacturer IDs.
   *
   * @returns Array of manufacturer IDs
   */
  getRegisteredManufacturerIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Returns the list of registered device IDs.
   *
   * @returns Array of device IDs
   */
  getRegisteredDeviceIds(): string[] {
    return Array.from(this.deviceAdapters.keys());
  }
}
