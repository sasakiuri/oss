// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { OfficialSigningPolicy, type SigningActor } from '@/main/modules/official-signing';

function setup() {
  const account = { id: '11111111-1111-4111-8111-111111111111', name: 'Technical Delegate' };
  let actor: SigningActor | null = account;
  let required = true;
  let external = true;
  const policy = new OfficialSigningPolicy(
    {
      currentActor: () => actor,
      authenticationRequired: () => required,
      findActiveAccount: (id) => (id === account.id ? account : null),
    },
    () => external,
  );
  return {
    policy,
    account,
    signOut: () => {
      actor = null;
    },
    manual: () => {
      required = false;
    },
    disableExternal: () => {
      external = false;
    },
  };
}

describe('OfficialSigningPolicy', () => {
  it('binds personal signatures to an immutable account ID rather than a supplied name', () => {
    const { policy, account } = setup();
    expect(policy.authorize({ officialName: 'Appointment name before rename', officialActorId: account.id })).toEqual({
      method: 'AUTHENTICATED',
      actorId: account.id,
      recordedBy: account.name,
      evidenceReference: null,
    });
    expect(() => policy.authorize({ officialName: account.name, officialActorId: 'another-account' })).toThrow(
      'not the appointed signer',
    );
    expect(() => policy.authorize({ officialName: account.name })).toThrow('Link this official');
    expect(policy.resolveAccount(account.id)).toEqual(account);
    expect(() => policy.resolveAccount('disabled-or-missing')).toThrow('active operator');
  });

  it('allows external records with evidence without misidentifying the recorder as the signer', () => {
    const { policy, account, disableExternal } = setup();
    const request = {
      method: 'EXTERNAL' as const,
      officialName: 'Other official',
      recordedBy: 'Forged recorder',
      evidenceReference: 'Signed form 12',
    };
    expect(policy.authorize(request)).toEqual({
      method: 'EXTERNAL',
      actorId: account.id,
      recordedBy: account.name,
      evidenceReference: 'Signed form 12',
    });
    expect(() => policy.authorize({ ...request, evidenceReference: ' ' })).toThrow('evidence');
    disableExternal();
    expect(() => policy.authorize(request)).toThrow('disabled');
  });

  it('distinguishes manual confirmations from authenticated signatures and enforces required sign-in', () => {
    const { policy, account, signOut, manual } = setup();
    signOut();
    expect(() => policy.authorize({ officialName: account.name })).toThrow('Sign in');
    expect(() =>
      policy.authorize({ method: 'EXTERNAL', officialName: account.name, evidenceReference: 'form' }),
    ).toThrow('Sign in');
    manual();
    expect(policy.authorize({ officialName: account.name })).toEqual({
      method: 'MANUAL',
      actorId: null,
      recordedBy: account.name,
      evidenceReference: null,
    });
    expect(() =>
      policy.authorize({ officialName: account.name, method: 'EXTERNAL', evidenceReference: 'form' }),
    ).toThrow('Recorder name');
    expect(
      policy.authorize({
        officialName: account.name,
        method: 'EXTERNAL',
        evidenceReference: 'form',
        recordedBy: 'Recorder',
      }),
    ).toMatchObject({ method: 'EXTERNAL', actorId: null, recordedBy: 'Recorder' });
  });
});
