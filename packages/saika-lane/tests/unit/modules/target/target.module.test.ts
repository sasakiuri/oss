// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

    it('should register both BPT-216 connection profiles and the legacy ID with a dedicated adapter', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.registerDeviceAdapter).toHaveBeenCalledWith('BPT216', expect.any(BPT216Adapter));
      expect(adapterRegistry.registerDeviceAdapter).toHaveBeenCalledWith('BPT216_RS232', expect.any(BPT216Adapter));
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

    it('registers a device adapter for every definition that declares one, and none for the others', () => {
      targetModule.register({ adapterRegistry });

      const assigned = vi.mocked(adapterRegistry.assignDeviceAdapter).mock.calls;
      const registered = vi.mocked(adapterRegistry.registerDeviceAdapter).mock.calls.map(([deviceId]) => deviceId);
      expect(new Map(assigned)).toEqual(
        new Map([
          ['MT201', 'KOHTO'],
          ['DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG'],
          ['DISAG_KT_RDT_ZIE_1_PISTOL', 'DISAG'],
          ['CUSTOM', 'CUSTOM'],
        ]),
      );
      expect(registered.sort()).toEqual(['BP216', 'BPT216', 'BPT216_RS232']);
      expect(
        new Set(vi.mocked(adapterRegistry.registerDeviceAdapter).mock.calls.map(([, adapter]) => adapter)).size,
      ).toBe(1);
    });

    it('should assign 4 manufacturer-backed device adapters total', () => {
      targetModule.register({ adapterRegistry });

      expect(adapterRegistry.assignDeviceAdapter).toHaveBeenCalledTimes(4);
      expect(adapterRegistry.registerDeviceAdapter).toHaveBeenCalledTimes(3);
    });
  });
});
