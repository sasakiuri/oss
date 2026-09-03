// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  CommandAuthorizationPolicy,
  commandAuthorizationPolicyFromEnvironment,
} from '@/main/modules/mqtt/domain/CommandAuthorizationPolicy';

describe('CommandAuthorizationPolicy', () => {
  it('rejects an untrusted or missing issuer in required mode', () => {
    const policy = new CommandAuthorizationPolicy('REQUIRED', ['director-a']);

    expect(policy.assess({ issuerId: 'director-a', issuedBy: 'Chief Range Officer' }).allowed).toBe(true);
    expect(policy.assess({ issuerId: 'director-b', issuedBy: 'Unknown' })).toMatchObject({ allowed: false });
    expect(policy.assess({ issuedBy: 'Legacy Director' })).toMatchObject({ allowed: false });
  });

  it('allows an unverified issuer with an auditable warning in advisory mode', () => {
    const policy = new CommandAuthorizationPolicy('ADVISORY', ['director-a']);

    expect(policy.assess({ issuerId: 'director-b', issuedBy: 'Operator' })).toMatchObject({
      allowed: true,
      warning: expect.stringContaining('command_issuer_unverified'),
    });
  });

  it('keeps legacy deployments operational in disabled mode', () => {
    expect(new CommandAuthorizationPolicy('DISABLED').assess({ issuedBy: 'Legacy Director' })).toEqual({
      allowed: true,
      reason: 'Command issuer verification is disabled.',
    });
  });

  it('loads a normalized trust list and defaults to advisory mode', () => {
    const policy = commandAuthorizationPolicyFromEnvironment({
      SAIKA_TRUSTED_DIRECTOR_IDS: ' director-a, director-b, ',
    });

    expect(policy.assess({ issuerId: 'director-b', issuedBy: 'Operator' }).allowed).toBe(true);
    expect(policy.assess({ issuedBy: 'Legacy Director' }).warning).toContain('command_issuer_unverified');
  });

  it('fails closed when required mode has no trusted Director identity', () => {
    expect(() => commandAuthorizationPolicyFromEnvironment({ SAIKA_COMMAND_AUTHORIZATION_MODE: 'REQUIRED' })).toThrow(
      'at least one trusted Director ID',
    );
  });

  it('rejects an invalid authorization mode instead of silently weakening policy', () => {
    expect(() => commandAuthorizationPolicyFromEnvironment({ SAIKA_COMMAND_AUTHORIZATION_MODE: 'REQUIERD' })).toThrow(
      'SAIKA_COMMAND_AUTHORIZATION_MODE must be DISABLED, ADVISORY, or REQUIRED',
    );
  });
});
