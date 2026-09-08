// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { CustomAdapter } from '@/main/modules/target/adapters/CustomAdapter';
import { TargetConnectionSupport } from '@/main/modules/target/domain/TargetConnectionSupport';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import { targetModule } from '@/main/modules/target/target.module';

describe('TargetConnectionSupport', () => {
  it('resolves installed device readers and preserves registered legacy aliases', () => {
    const adapterRegistry = new AdapterRegistry();
    targetModule.register({ adapterRegistry });
    const support = new TargetConnectionSupport(adapterRegistry);
    for (const deviceId of ['MT201', 'BPT216', 'BPT216_RS232', 'BP216'])
      expect(support.unavailableReason('KOHTO', deviceId)).toBeNull();
    expect(support.unavailableReason('SIUS', 'HS10')).toContain('No serial connection');
    expect(support.unavailableReason('SIUS', 'MT201')).toContain('belongs to KOHTO');
    expect(support.unavailableReason('KOHTO', 'unknown')).toContain('No serial connection');
  });

  it('reflects a newly registered reader without a manufacturer-specific allowlist', () => {
    const registry = new AdapterRegistry();
    const support = new TargetConnectionSupport(registry);
    expect(support.unavailableReason('CUSTOM', 'CUSTOM')).not.toBeNull();
    registry.registerDeviceAdapter('CUSTOM', new CustomAdapter());
    expect(support.unavailableReason('CUSTOM', 'CUSTOM')).toBeNull();
    expect(support.unavailableReason('CUSTOM')).not.toBeNull();
    registry.registerAdapter('CUSTOM', new CustomAdapter());
    expect(support.unavailableReason('CUSTOM')).toBeNull();
    registry.removeAdapter('CUSTOM');
    expect(support.unavailableReason('CUSTOM')).not.toBeNull();
    expect(support.unavailableReason('CUSTOM', 'CUSTOM')).toBeNull();
  });
});
