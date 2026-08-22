// SPDX-License-Identifier: MIT
/**
 * Target module definition
 *
 * Initializes the adapter registry and registers target adapters.
 */

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';

import { BPT216Adapter } from './adapters/BPT216Adapter';
import { CustomAdapter } from './adapters/CustomAdapter';
import { DisagAdapter } from './adapters/DisagAdapter';
import { MT201Adapter } from './adapters/MT201Adapter';
import {
  BPT216_DEVICE_ID,
  BPT216_RS232_DEVICE_ID,
  DISAG_RED_DOT_DEVICE_IDS,
  LEGACY_BP216_DEVICE_ID,
} from './domain/targetDeviceDefinitions';
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
    const bpt216Adapter = new BPT216Adapter();

    // Register by manufacturer ID
    adapterRegistry.registerAdapter(TargetManufacturer.custom().value, customAdapter);
    adapterRegistry.registerAdapter(TargetManufacturer.disag().value, disagAdapter);
    adapterRegistry.registerAdapter(TargetManufacturer.kohto().value, mt201Adapter);

    // Register by device ID. Both BPT-216 connection profiles are isolated
    // from MT201 and share a parser that understands their two wire formats.
    adapterRegistry.assignDeviceAdapter('MT201', TargetManufacturer.kohto().value);
    adapterRegistry.registerDeviceAdapter(BPT216_DEVICE_ID, bpt216Adapter);
    adapterRegistry.registerDeviceAdapter(BPT216_RS232_DEVICE_ID, bpt216Adapter);
    adapterRegistry.registerDeviceAdapter(LEGACY_BP216_DEVICE_ID, bpt216Adapter);
    adapterRegistry.assignDeviceAdapter('CUSTOM', TargetManufacturer.custom().value);
    for (const deviceId of DISAG_RED_DOT_DEVICE_IDS) {
      adapterRegistry.assignDeviceAdapter(deviceId, TargetManufacturer.disag().value);
    }
  },
};
