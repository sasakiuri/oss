// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { ISSF_2026_AR60, RulePackRegistry, type RulePack } from '../src';

function pack(id: string, effectiveFrom: string, effectiveUntil?: string): RulePack {
  return {
    ...ISSF_2026_AR60,
    id,
    authority: { ...ISSF_2026_AR60.authority, effectiveFrom, effectiveUntil },
  };
}

describe('Rule Pack selection', () => {
  it('starts empty and preserves explicitly registered definitions', () => {
    const registry = new RulePackRegistry();
    expect(registry.getAll()).toEqual([]);
    expect(registry.findForEvent('AR60', '2026-07-01')).toBeNull();
    expect(() => registry.getById('missing')).toThrow('Rule Pack "missing" is not registered');
    registry.register(ISSF_2026_AR60);
    expect(registry.getById(ISSF_2026_AR60.id)).toBe(ISSF_2026_AR60);
    expect(registry.getAll()).toEqual([ISSF_2026_AR60]);
    const snapshot = registry.getAll();
    snapshot.pop();
    expect(registry.getAll()).toEqual([ISSF_2026_AR60]);
    expect(() => registry.register({ ...ISSF_2026_AR60, displayName: 'Duplicate' })).toThrow(
      `Rule Pack "${ISSF_2026_AR60.id}" is already registered`,
    );
    expect(registry.getById(ISSF_2026_AR60.id)).toBe(ISSF_2026_AR60);
  });

  it('selects the latest effective definition independently of registration order', () => {
    const old = pack('old', '2026-01-01', '2026-12-31');
    const current = pack('current', '2026-07-01');
    const future = pack('future', '2027-01-01');
    for (const definitions of [
      [old, current, future],
      [future, current, old],
    ]) {
      const registry = new RulePackRegistry(definitions);
      expect(registry.findForEvent('AR60', '2026-06-30')).toBe(old);
      expect(registry.findForEvent('AR60', '2026-07-01')).toBe(current);
      expect(registry.findForEvent('AR60', '2026-12-31')).toBe(current);
      expect(registry.findForEvent('AR60', '2027-01-01')).toBe(future);
      expect(registry.findForEvent('AP60', '2026-07-01')).toBeNull();
    }
  });

  it('includes both effective boundaries and excludes dates outside them', () => {
    const bounded = pack('bounded', '2026-07-01', '2026-12-31');
    const registry = new RulePackRegistry([bounded]);
    expect(registry.findForEvent('AR60', '2026-06-30')).toBeNull();
    expect(registry.findForEvent('AR60', '2026-07-01')).toBe(bounded);
    expect(registry.findForEvent('AR60', '2026-12-31')).toBe(bounded);
    expect(registry.findForEvent('AR60', '2027-01-01')).toBeNull();
  });
});
