import type { ProtestCase, ProtestKind } from './ProtestCase';

export interface ProtestKindRequirement {
  readonly filingWindowMinutes: number | null;
  readonly expectedFeeEuro: number;
  readonly formRequired: boolean;
  readonly appealPermitted: boolean;
  readonly ruleReferences: string;
}

export type ProtestRequirements = Readonly<Record<ProtestKind, ProtestKindRequirement>>;

/** Versioned rule values consumed by the pure assessment policy. */
export const ISSF_2026_PROTEST_REQUIREMENTS: ProtestRequirements = Object.freeze({
  VERBAL: Object.freeze({
    filingWindowMinutes: null,
    expectedFeeEuro: 0,
    formRequired: false,
    appealPermitted: true,
    ruleReferences: 'ISSF 6.16.2–6.16.6',
  }),
  WRITTEN: Object.freeze({
    filingWindowMinutes: 20,
    expectedFeeEuro: 50,
    formRequired: true,
    appealPermitted: true,
    ruleReferences: 'ISSF 6.16.3–6.16.5',
  }),
  FINAL_VERBAL: Object.freeze({
    filingWindowMinutes: null,
    expectedFeeEuro: 0,
    formRequired: false,
    appealPermitted: false,
    ruleReferences: 'ISSF 6.17.1.13',
  }),
  APPEAL: Object.freeze({
    filingWindowMinutes: 30,
    expectedFeeEuro: 100,
    formRequired: true,
    appealPermitted: false,
    ruleReferences: 'ISSF 6.16.6',
  }),
});

export interface ProtestComplianceAssessment {
  deadlineAt: Date | null;
  withinDeadline: boolean | null;
  expectedFeeEuro: number;
  formRequired: boolean;
  appealPermitted: boolean;
  issues: string[];
  ruleReferences: string;
}

export interface IProtestPolicy {
  assess(protest: ProtestCase): ProtestComplianceAssessment;
}

export class IssfProtestPolicy implements IProtestPolicy {
  constructor(private readonly requirements: ProtestRequirements = ISSF_2026_PROTEST_REQUIREMENTS) {}

  assess(protest: ProtestCase): ProtestComplianceAssessment {
    const requirement = this.requirements[protest.kind];
    const filingWindowMinutes = requirement.filingWindowMinutes;
    const deadlineAt =
      filingWindowMinutes !== null && protest.triggeringDecisionAt
        ? new Date(protest.triggeringDecisionAt.getTime() + filingWindowMinutes * 60 * 1000)
        : null;
    const withinDeadline = deadlineAt ? protest.lodgedAt.getTime() <= deadlineAt.getTime() : null;
    const issues: string[] = [];
    if (filingWindowMinutes !== null && !protest.triggeringDecisionAt) {
      issues.push(`Record the triggering decision time for the ${filingWindowMinutes}-minute deadline`);
    }
    if (requirement.formRequired && !protest.formReference) {
      issues.push(`Record the ${protest.kind === 'APPEAL' ? 'Form AP' : 'Form P'} reference`);
    }
    if (
      (requirement.expectedFeeEuro > 0 && protest.feePaidEuro !== requirement.expectedFeeEuro) ||
      (requirement.expectedFeeEuro === 0 && protest.feePaidEuro !== null && protest.feePaidEuro !== 0)
    ) {
      issues.push(`Expected fee is EUR ${requirement.expectedFeeEuro}`);
    }
    if (withinDeadline === false && !protest.lateAcceptanceReason) {
      issues.push(`The filing is outside ${filingWindowMinutes} minutes; record the accepted exception or reject it`);
    }
    return {
      deadlineAt,
      withinDeadline,
      expectedFeeEuro: requirement.expectedFeeEuro,
      formRequired: requirement.formRequired,
      appealPermitted: requirement.appealPermitted,
      issues,
      ruleReferences: requirement.ruleReferences,
    };
  }
}
