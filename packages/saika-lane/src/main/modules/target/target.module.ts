// SPDX-License-Identifier: MIT
/**
 * Target module definition
 *
 * Initializes the adapter registry and registers target adapters.
 */

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';

import { CustomAdapter } from './adapters/CustomAdapter';
import { DisagAdapter } from './adapters/DisagAdapter';
import { MT201Adapter } from './adapters/MT201Adapter';
import { DISAG_RED_DOT_DEVICE_IDS } from './domain/targetDeviceDefinitions';
import { TargetManufacturer } from './domain/TargetManufacturer';

type TargetDeps = 'adapterRegistry';

export const targetModule: ModuleDefinition<TargetDeps> = {
  name: 'target',
  deps: ['adapterRegistry'] as const,
  register({ adapterRegistry }) {
    // Create adapter instances
    const customAdapter = new CustomAdapter();
    const disagAdapter = new DisagAdapter();
    const mt201Adapter = new MT201Adapter();

    // Register by manufacturer ID
    adapterRegistry.registerAdapter(TargetManufacturer.custom().value, customAdapter);
    adapterRegistry.registerAdapter(TargetManufacturer.disag().value, disagAdapter);
    adapterRegistry.registerAdapter(TargetManufacturer.kohto().value, mt201Adapter);

    // Register by device ID (MT201 and BP216 share the same MT201Adapter)
    adapterRegistry.assignDeviceAdapter('MT201', TargetManufacturer.kohto().value);
    adapterRegistry.assignDeviceAdapter('BP216', TargetManufacturer.kohto().value);
    adapterRegistry.assignDeviceAdapter('CUSTOM', TargetManufacturer.custom().value);
    for (const deviceId of DISAG_RED_DOT_DEVICE_IDS) {
      adapterRegistry.assignDeviceAdapter(deviceId, TargetManufacturer.disag().value);
    }
  },
};
