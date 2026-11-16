import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canonicalJson,
  ISSF_2026_AP60,
  ISSF_2026_AR60,
  ISSF_2026_RULE_PACKS,
  identifyRulePack,
  sameRulePackIdentity,
  type RulePackIdentity,
} from '../src';

describe('canonicalJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('orders keys by UTF-16 code units', () => {
    expect(canonicalJson({ b: 1, a_b: 2, aB: 3, A: 4, a: 5, _: 6, nested: [{ z: 1, Z: 2 }] })).toBe(
      '{"A":4,"_":6,"a":5,"aB":3,"a_b":2,"b":1,"nested":[{"Z":2,"z":1}]}',
    );
  });

  it('does not depend on the process locale', () => {
    const identities = ISSF_2026_RULE_PACKS.map(identifyRulePack);
    const compare = String.prototype.localeCompare;
    // Hawaiian collation sorts vowels before consonants, unlike the default locale.
    vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (
      this: string,
      that: string,
      locales?: Intl.LocalesArgument,
      options?: Intl.CollatorOptions,
    ) {
      return compare.call(this, that, locales ?? 'haw', options);
    });
    expect('h'.localeCompare('i')).toBeGreaterThan(0);

    expect(canonicalJson({ i: 1, h: 2 })).toBe('{"h":2,"i":1}');
    expect(ISSF_2026_RULE_PACKS.map(identifyRulePack)).toEqual(identities);
  });
});

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
