import { describe, expect, it } from 'vitest';
import { IssfFinalRecoveryAuthorizationPolicy } from '@/main/modules/final-recoveries/domain/FinalRecoveryAuthorizationPolicy';
import { FinalRecoveryCase, FinalRecoveryEntry } from '@/main/modules/final-recoveries/domain/FinalRecoveryCase';
import type { FinalRecoveryAuthorizationContext } from '@/main/modules/final-recoveries/domain/FinalRecoveryAuthorizationPolicy';

const policy = new IssfFinalRecoveryAuthorizationPolicy();
const recovery = (props: Partial<Parameters<typeof FinalRecoveryCase.create>[0]> = {}) =>
  FinalRecoveryCase.create({
    competitionId: 'competition',
    finalRunId: 'final',
    procedureProfile: 'PISTOL_25M_RAPID_FIRE',
    incidentType: 'MALFUNCTION',
    phase: 'MATCH_SERIES',
    affectedLaneIds: ['lane-1'],
    summary: 'Observed malfunction',
    openedBy: 'RO',
    allowanceSubject: { kind: 'ATHLETE', key: 'athlete-1', description: 'Finalist' },
    ...props,
  });
const ruling = (caseId: string, classification: 'ALLOWABLE_MALFUNCTION' | 'NON_ALLOWABLE_MALFUNCTION') =>
  FinalRecoveryEntry.create({
    caseId,
    type: 'JURY_RULING',
    classification,
    statement: 'Examined by RO',
    officialName: 'RO',
  });
function context(props: Partial<FinalRecoveryAuthorizationContext> = {}): FinalRecoveryAuthorizationContext {
  const value = recovery();
  return {
    recovery: value,
    entries: [ruling(value.id, 'ALLOWABLE_MALFUNCTION')],
    history: [],
    remedy: 'REPEAT_SERIES',
    ...props,
  };
}

describe('Final recovery authorization policy', () => {
  it('rejects firing after a non-allowable ruling but permits the independent penalty record', () => {
    const value = recovery();
    const input = context({ recovery: value, entries: [ruling(value.id, 'NON_ALLOWABLE_MALFUNCTION')] });
    expect(() => policy.assertAuthorized(input)).toThrow('ALLOWABLE ruling');
    expect(() => policy.assertAuthorized({ ...input, remedy: 'APPLY_RULE_PENALTY' })).not.toThrow();
  });

  it('does not grant another 25m refire after either an AM or a NAM, even on a reserve Lane', () => {
    for (const classification of ['ALLOWABLE_MALFUNCTION', 'NON_ALLOWABLE_MALFUNCTION'] as const) {
      const previous = recovery();
      const input = context({
        recovery: recovery({ affectedLaneIds: ['reserve-lane'] }),
        history: [{ recovery: previous, entries: [ruling(previous.id, classification)] }],
      });
      expect(() => policy.assertAuthorized(input)).toThrow('already used');
      expect(() => policy.assertAuthorized({ ...input, remedy: 'COUNT_DISPLAYED_SHOTS' })).not.toThrow();
    }
  });

  it('shares the allowance between Mixed Team partners without consuming it for an NAM', () => {
    const subject = { kind: 'TEAM' as const, key: 'team-1', description: 'Team One' };
    const previous = recovery({ procedureProfile: 'RIFLE_PISTOL_10M_50M_MIXED_TEAM', allowanceSubject: subject });
    const current = recovery({
      procedureProfile: previous.procedureProfile,
      allowanceSubject: subject,
      affectedLaneIds: ['lane-2'],
    });
    const input = context({
      recovery: current,
      remedy: 'COMPLETE_SERIES',
      history: [{ recovery: previous, entries: [ruling(previous.id, 'ALLOWABLE_MALFUNCTION')] }],
    });
    expect(() => policy.assertAuthorized(input)).toThrow('already used');
    expect(() =>
      policy.assertAuthorized({
        ...input,
        history: [{ recovery: previous, entries: [ruling(previous.id, 'NON_ALLOWABLE_MALFUNCTION')] }],
      }),
    ).not.toThrow();
    expect(() =>
      policy.assertAuthorized({
        ...input,
        recovery: recovery({
          procedureProfile: previous.procedureProfile,
          allowanceSubject: { ...subject, key: 'team-2' },
        }),
      }),
    ).not.toThrow();
  });

  it('requires a stable identity and the team identity kind for Mixed Team firing', () => {
    expect(() => policy.assertAuthorized(context({ recovery: recovery({ allowanceSubject: null }) }))).toThrow(
      'identity',
    );
    expect(() =>
      policy.assertAuthorized(context({ recovery: recovery({ procedureProfile: 'RIFLE_PISTOL_10M_50M_MIXED_TEAM' }) })),
    ).toThrow('team identity');
  });

  it('preserves local manual procedures and does not silently ignore unbound legacy claims', () => {
    const legacy = recovery({ allowanceSubject: null });
    const input = context({ history: [{ recovery: legacy, entries: [ruling(legacy.id, 'ALLOWABLE_MALFUNCTION')] }] });
    expect(() => policy.assertAuthorized(input)).toThrow('legacy');
    expect(() =>
      policy.assertAuthorized({
        ...input,
        recovery: recovery({ procedureProfile: 'GENERAL', allowanceSubject: null }),
      }),
    ).not.toThrow();
  });

  it('does not reuse another Final or a voided case, and refuses a second firing authorization in one case', () => {
    const prior = recovery({ finalRunId: 'other-final' });
    const input = context({ history: [{ recovery: prior, entries: [ruling(prior.id, 'ALLOWABLE_MALFUNCTION')] }] });
    expect(() => policy.assertAuthorized(input)).not.toThrow();
    const voidEntry = FinalRecoveryEntry.create({
      caseId: prior.id,
      type: 'VOID',
      statement: 'Wrong athlete',
      officialName: 'Jury',
    });
    expect(() =>
      policy.assertAuthorized({
        ...input,
        history: [{ recovery: recovery(), entries: [ruling(prior.id, 'ALLOWABLE_MALFUNCTION'), voidEntry] }],
      }),
    ).not.toThrow();
    const authorized = FinalRecoveryEntry.create({
      caseId: input.recovery.id,
      type: 'REMEDY_AUTHORIZED',
      remedy: 'REPEAT_SERIES',
      statement: 'Refire',
      officialName: 'Jury',
    });
    expect(() => policy.assertAuthorized({ ...input, entries: [...input.entries, authorized] })).toThrow(
      'already authorized',
    );
  });
});
