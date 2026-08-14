// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it } from 'vitest';

import { BPT216Adapter } from '@/main/modules/target/adapters/BPT216Adapter';
import { targetModule } from '@/main/modules/target/target.module';

import { createMockAdapterRegistry } from '../../../helpers/mockDependencies';

describe('target.module', () => {
  let adapterRegistry: ReturnType<typeof createMockAdapterRegistry>;

  beforeEach(() => {
    adapterRegistry = createMockAdapterRegistry();
  });

  describe('metadata', () => {
    it('should have name "target"', () => {
      expect(targetModule.name).toBe('target');
    });

    it('should declare adapterRegistry dependency', () => {
      expect(targetModule.deps).toEqual(['adapterRegistry']);
    });
  });

  describe('register', () => {
    it('should not throw when called with adapterRegistry', () => {
      expect(() => {
        targetModule.register({ adapterRegistry });
      }).not.toThrow();
    });

    it('should register CUSTOM adapter', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.registerAdapter).toHaveBeenCalledWith('CUSTOM', expect.any(Object));
    });

    it('should register KOHTO adapter', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.registerAdapter).toHaveBeenCalledWith('KOHTO', expect.any(Object));
    });

    it('should register DISAG adapter', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.registerAdapter).toHaveBeenCalledWith('DISAG', expect.any(Object));
    });

    it('should assign MT201 device to KOHTO adapter', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.assignDeviceAdapter).toHaveBeenCalledWith('MT201', 'KOHTO');
    });

    it('should register canonical and legacy BPT-216 IDs with a dedicated adapter', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.registerDeviceAdapter).toHaveBeenCalledWith('BPT216', expect.any(BPT216Adapter));
      expect(adapterRegistry.registerDeviceAdapter).toHaveBeenCalledWith('BP216', expect.any(BPT216Adapter));
    });

    it('should assign CUSTOM device to CUSTOM adapter', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.assignDeviceAdapter).toHaveBeenCalledWith('CUSTOM', 'CUSTOM');
    });

    it('should assign both supported RedDot profiles to the DISAG adapter', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.assignDeviceAdapter).toHaveBeenCalledWith('DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG');
      expect(adapterRegistry.assignDeviceAdapter).toHaveBeenCalledWith('DISAG_KT_RDT_ZIE_1_PISTOL', 'DISAG');
      expect(adapterRegistry.assignDeviceAdapter).not.toHaveBeenCalledWith('DISAG_DEFAULT', 'DISAG');
      expect(adapterRegistry.assignDeviceAdapter).not.toHaveBeenCalledWith('RDT_ZIE1_PISTOL', 'DISAG');
    });

    it('should register 3 manufacturer adapters total', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.registerAdapter).toHaveBeenCalledTimes(3);
    });

    it('should assign 4 manufacturer-backed device adapters total', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.assignDeviceAdapter).toHaveBeenCalledTimes(4);
      expect(adapterRegistry.registerDeviceAdapter).toHaveBeenCalledTimes(2);
    });
  });
});
