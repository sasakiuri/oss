// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { FiringPointNumberResolver } from '@/main/modules/mqtt/application/FiringPointNumberResolver';

describe('FiringPointNumberResolver', () => {
  it('updates a mapping when the Lane alias changes', () => {
    const resolver = new FiringPointNumberResolver();

    expect(resolver.resolve('lane-a', 'Lane 1')).toBe(1);
    expect(resolver.resolve('lane-a', 'Lane 10')).toBe(10);
  });

  it('replaces a fallback mapping after the hardware alias becomes available', () => {
    const resolver = new FiringPointNumberResolver();

    expect(resolver.resolve('lane-a', '')).toBe(1);
    expect(resolver.resolve('lane-a', 'Lane 10')).toBe(10);
  });

  it('gives an alias-derived number priority over an existing fallback mapping', () => {
    const resolver = new FiringPointNumberResolver();

    expect(resolver.resolve('fallback-lane', '')).toBe(1);
    expect(resolver.resolve('explicit-lane', 'Lane 1')).toBe(1);
    expect(resolver.resolve('fallback-lane', '')).toBe(2);
  });

  it('reclaims a preferred number after the previous owner changes aliases', () => {
    const resolver = new FiringPointNumberResolver();

    expect(resolver.resolve('lane-a', 'Lane 1')).toBe(1);
    expect(resolver.resolve('lane-b', 'Lane 2')).toBe(2);
    expect(resolver.resolve('lane-a', 'Lane 2')).toBe(1);
    expect(resolver.resolve('lane-b', 'Lane 1')).toBe(1);
    expect(resolver.resolve('lane-a', 'Lane 2')).toBe(2);
  });

  it('releases all mappings when the MQTT session is reset', () => {
    const resolver = new FiringPointNumberResolver();
    expect(resolver.resolve('lane-a', 'Lane 1')).toBe(1);

    resolver.reset();

    expect(resolver.resolve('lane-b', 'Lane 1')).toBe(1);
  });

  it('allows a replacement Lane to claim the number of a forgotten offline Lane', () => {
    const resolver = new FiringPointNumberResolver();
    expect(resolver.resolve('offline-lane', 'Lane 1')).toBe(1);

    resolver.forget('offline-lane');

    expect(resolver.resolve('replacement-lane', 'Lane 1')).toBe(1);
  });
});
