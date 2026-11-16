import { describe, expect, it } from 'vitest';

import { ISSF_2026_AP60, ISSF_2026_AR60, identifyRulePack, sameRulePackIdentity, type RulePackIdentity } from '../src';

describe('sameRulePackIdentity', () => {
  const identity = identifyRulePack(ISSF_2026_AR60);

  it('accepts separately created identities of the same exact pack', () => {
    const copy = identifyRulePack(structuredClone(ISSF_2026_AR60));

    expect(copy).not.toBe(identity);
    expect(sameRulePackIdentity(identity, copy)).toBe(true);
    expect(sameRulePackIdentity(copy, identity)).toBe(true);
  });

  it('rejects identities of different packs', () => {
    expect(sameRulePackIdentity(identity, identifyRulePack(ISSF_2026_AP60))).toBe(false);
  });

  const changes: ReadonlyArray<readonly [string, RulePackIdentity]> = [
    ['ID', { ...identity, id: `${identity.id}-copy` }],
    ['schema version', { ...identity, schemaVersion: 2 as unknown as RulePackIdentity['schemaVersion'] }],
    [
      'fingerprint algorithm',
      {
        ...identity,
        fingerprint: {
          ...identity.fingerprint,
          algorithm: 'SHA-512' as unknown as RulePackIdentity['fingerprint']['algorithm'],
        },
      },
    ],
    ['fingerprint value', { ...identity, fingerprint: { ...identity.fingerprint, value: '0'.repeat(64) } }],
  ];

  it.each(changes)('rejects a different %s in either order', (_part, changed) => {
    expect(sameRulePackIdentity(identity, changed)).toBe(false);
    expect(sameRulePackIdentity(changed, identity)).toBe(false);
  });
});
