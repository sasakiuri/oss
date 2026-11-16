// SPDX-License-Identifier: MIT
import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { DEVICE_DEFINITIONS } from '@/shared/target/targetDevices';

import { BPT216Adapter } from './adapters/BPT216Adapter';
import { CustomAdapter } from './adapters/CustomAdapter';
import { DisagAdapter } from './adapters/DisagAdapter';
import { MT201Adapter } from './adapters/MT201Adapter';
import { TargetManufacturer } from './domain/TargetManufacturer';

type TargetDeps = 'adapterRegistry';

export const targetModule: ModuleDefinition<TargetDeps> = {
  name: 'target',
  deps: ['adapterRegistry'] as const,
  register({ adapterRegistry }) {
    // Register by manufacturer ID
    adapterRegistry.registerAdapter(TargetManufacturer.custom().value, new CustomAdapter());
    adapterRegistry.registerAdapter(TargetManufacturer.disag().value, new DisagAdapter());
    adapterRegistry.registerAdapter(TargetManufacturer.kohto().value, new MT201Adapter());

    // Register by device ID and alias as each definition declares. Both BPT-216
    // connection profiles are isolated from MT201 and share one adapter that
    // understands their two wire formats.
    const bpt216Adapter = new BPT216Adapter();
    for (const definition of DEVICE_DEFINITIONS) {
      for (const deviceId of [definition.id, ...(definition.aliases ?? [])]) {
        if (definition.adapter === 'MANUFACTURER') {
          adapterRegistry.assignDeviceAdapter(deviceId, definition.manufacturer);
        } else if (definition.adapter === 'BPT216') {
          adapterRegistry.registerDeviceAdapter(deviceId, bpt216Adapter);
        }
      }
    }
  },
};
