import {
  finalRecoveryStatus,
  type FinalRecoveryCase,
  type FinalRecoveryEntry,
  type FinalRecoveryRemedy,
} from './FinalRecoveryCase';

export interface FinalRecoveryAllowanceSubject {
  readonly kind: 'ATHLETE' | 'TEAM';
  readonly key: string;
  readonly description: string;
}

export interface FinalRecoveryAuthorizationContext {
  readonly recovery: FinalRecoveryCase;
  readonly entries: readonly FinalRecoveryEntry[];
  readonly history: readonly { recovery: FinalRecoveryCase; entries: readonly FinalRecoveryEntry[] }[];
  readonly remedy: FinalRecoveryRemedy;
}

/** Consumer-owned boundary; local procedures can supply a different policy. */
export interface IFinalRecoveryAuthorizationPolicy {
  assertAuthorized(context: FinalRecoveryAuthorizationContext): void;
}

const malfunctionFiring = new Set<FinalRecoveryRemedy>(['REPEAT_SINGLE_SHOT', 'REPEAT_SERIES', 'COMPLETE_SERIES']);

/** Validates an official remedy; never classifies a malfunction or applies a score. */
export class IssfFinalRecoveryAuthorizationPolicy implements IFinalRecoveryAuthorizationPolicy {
  assertAuthorized({ recovery, entries, history, remedy }: FinalRecoveryAuthorizationContext): void {
    if (recovery.procedureProfile === 'GENERAL') return;
    const ruling = [...entries].reverse().find((entry) => entry.type === 'JURY_RULING')?.classification;
    if (recovery.incidentType === 'INCORRECT_COMMAND' && remedy !== 'OTHER' && remedy !== 'CONTINUE') {
      if (ruling !== 'COMMAND_CONFIRMED')
        throw new Error('Confirm the incorrect command before authorizing its correction');
    }
    if (recovery.incidentType === 'EST_FAILURE' && remedy !== 'OTHER' && remedy !== 'CONTINUE') {
      if (ruling !== 'TARGET_MALFUNCTION' && !(recovery.phase === 'SIGHTING' && remedy === 'FIRE_TEST_SHOT')) {
        throw new Error('Confirm a target malfunction before authorizing EST recovery');
      }
    }
    if (recovery.incidentType !== 'MALFUNCTION') return;
    if (remedy === 'APPLY_RULE_PENALTY' && ruling !== 'NON_ALLOWABLE_MALFUNCTION') {
      throw new Error('The malfunction penalty requires a NON-ALLOWABLE ruling');
    }
    if (!malfunctionFiring.has(remedy)) return;
    if (ruling !== 'ALLOWABLE_MALFUNCTION') {
      throw new Error('Malfunction recovery firing requires an ALLOWABLE ruling');
    }
    if (
      entries.some((entry) => entry.type === 'REMEDY_AUTHORIZED' && entry.remedy && malfunctionFiring.has(entry.remedy))
    ) {
      throw new Error('Recovery firing is already authorized for this malfunction; use the existing authorization');
    }
    const subject = recovery.allowanceSubject;
    const expectedKind = recovery.procedureProfile === 'RIFLE_PISTOL_10M_50M_MIXED_TEAM' ? 'TEAM' : 'ATHLETE';
    if (!subject || subject.kind !== expectedKind) {
      throw new Error(
        `A confirmed ${expectedKind.toLowerCase()} identity is required before authorizing malfunction recovery`,
      );
    }
    const is25m =
      recovery.procedureProfile === 'PISTOL_25M_RAPID_FIRE' || recovery.procedureProfile === 'PISTOL_25M_WOMEN';
    for (const candidate of history) {
      if (
        candidate.recovery.id === recovery.id ||
        candidate.recovery.incidentType !== 'MALFUNCTION' ||
        candidate.recovery.phase === 'SIGHTING' ||
        finalRecoveryStatus(candidate.entries) === 'VOID'
      )
        continue;
      if (recovery.finalRunId && candidate.recovery.finalRunId && recovery.finalRunId !== candidate.recovery.finalRunId)
        continue;
      const other = candidate.recovery.allowanceSubject;
      // Unbound legacy records cannot prove an unused allowance, even after a Lane change.
      if (
        !other &&
        candidate.entries.some(
          (entry) =>
            entry.type === 'JURY_RULING' &&
            (entry.classification === 'ALLOWABLE_MALFUNCTION' || entry.classification === 'NON_ALLOWABLE_MALFUNCTION'),
        )
      ) {
        throw new Error('Review unbound legacy malfunction records before authorizing recovery');
      }
      if (other?.kind !== subject.kind || other.key !== subject.key) continue;
      if (
        candidate.entries.some(
          (entry) =>
            entry.type === 'JURY_RULING' &&
            (entry.classification === 'ALLOWABLE_MALFUNCTION' ||
              (is25m && entry.classification === 'NON_ALLOWABLE_MALFUNCTION')),
        )
      ) {
        throw new Error('The athlete or team has already used its malfunction allowance in this Final');
      }
    }
  }
}
