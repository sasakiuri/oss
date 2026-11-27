import { describe, expect, it } from 'vitest';

import { CompetitionDefinitionCompatibilityPolicy } from '@/main/modules/mqtt/domain/CompetitionDefinitionCompatibilityPolicy';

const identity = {
  id: 'ISSF:2026:AR60:QUALIFICATION',
  schemaVersion: 1 as const,
  fingerprint: { algorithm: 'SHA-256' as const, value: 'a'.repeat(64) },
};

describe('CompetitionDefinitionCompatibilityPolicy', () => {
  const policy = new CompetitionDefinitionCompatibilityPolicy();

  it('requires an exact advertised Rule Pack in official mode', () => {
    expect(
      policy.assess(
        { protocolVersion: 1, compatibilityMode: 'REQUIRED', rulePack: identity },
        { competitionProtocolVersions: [1], rulePacks: [identity] },
      ),
    ).toMatchObject({ status: 'MATCH', joinAllowed: true });

    expect(
      policy.assess(
        { protocolVersion: 1, compatibilityMode: 'REQUIRED', rulePack: identity },
        {
          competitionProtocolVersions: [1],
          rulePacks: [{ ...identity, fingerprint: { ...identity.fingerprint, value: 'b'.repeat(64) } }],
        },
      ),
    ).toMatchObject({ status: 'MISMATCH', joinAllowed: false });
  });

  it('keeps advisory and legacy practice operation available', () => {
    expect(
      policy.assess({ protocolVersion: 1, compatibilityMode: 'ADVISORY', rulePack: identity }, undefined),
    ).toMatchObject({ status: 'UNAVAILABLE', joinAllowed: true });
    expect(policy.assess(undefined, undefined)).toMatchObject({ status: 'LEGACY', joinAllowed: true });
    expect(
      policy.assess({ protocolVersion: 1, compatibilityMode: 'DISABLED', rulePack: identity }, undefined),
    ).toMatchObject({ status: 'DISABLED', joinAllowed: true });
  });
});
