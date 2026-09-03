import { describe, expect, it } from 'vitest';

import { CompetitionDefinitionCompatibilityPolicy } from '@/main/modules/mqtt/domain/CompetitionDefinitionCompatibilityPolicy';

const identity = {
  id: 'ISSF:2026:AR60:QUALIFICATION',
  schemaVersion: 1 as const,
  fingerprint: { algorithm: 'SHA-256' as const, value: 'a'.repeat(64) },
};

describe('CompetitionDefinitionCompatibilityPolicy', () => {
  const policy = new CompetitionDefinitionCompatibilityPolicy();

  it('permits a Lane only when required content matches exactly', () => {
    const state = {
      competitionTypeId: 'AR60',
      definitionBinding: { protocolVersion: 1 as const, compatibilityMode: 'REQUIRED' as const, rulePack: identity },
    };

    expect(policy.assess(state, { id: 'AR60', rulePackIdentity: identity })).toMatchObject({
      status: 'MATCH',
      joinAllowed: true,
    });
    expect(
      policy.assess(state, {
        id: 'AR60',
        rulePackIdentity: { ...identity, fingerprint: { ...identity.fingerprint, value: 'b'.repeat(64) } },
      }),
    ).toMatchObject({ status: 'MISMATCH', joinAllowed: false });
  });

  it('allows advisory, disabled, and legacy definitions for flexible practice use', () => {
    expect(
      policy.assess(
        {
          competitionTypeId: 'LOCAL',
          definitionBinding: { protocolVersion: 1, compatibilityMode: 'ADVISORY', rulePack: identity },
        },
        { id: 'LOCAL' },
      ),
    ).toMatchObject({ status: 'UNKNOWN_RULE_PACK', joinAllowed: true });
    expect(policy.assess({ competitionTypeId: 'LOCAL' }, undefined)).toMatchObject({
      status: 'LEGACY',
      joinAllowed: true,
    });
  });
});
