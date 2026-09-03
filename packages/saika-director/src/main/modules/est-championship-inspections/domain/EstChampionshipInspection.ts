export const EST_INSPECTION_OUTCOMES = ['PASSED', 'FAILED'] as const;
export type EstInspectionOutcome = (typeof EST_INSPECTION_OUTCOMES)[number];

export class EstInspectionPlan {
  private constructor(
    readonly id: string,
    readonly championshipId: string,
    readonly versionNumber: number,
    readonly targetIdentifiers: readonly string[],
    readonly methodStatement: string,
    readonly createdBy: string,
    readonly createdAt: Date,
  ) {
    Object.freeze(this.targetIdentifiers);
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    championshipId: string;
    versionNumber: number;
    targetIdentifiers: readonly string[];
    methodStatement: string;
    createdBy: string;
    createdAt?: Date;
  }): EstInspectionPlan {
    if (!Number.isInteger(props.versionNumber) || props.versionNumber < 1) {
      throw new Error('versionNumber must be a positive integer');
    }
    const targetIdentifiers = [
      ...new Set(props.targetIdentifiers.map((value) => requiredText(value, 'targetIdentifier'))),
    ];
    if (targetIdentifiers.length === 0) throw new Error('At least one EST target must be included in the plan');
    return new EstInspectionPlan(
      props.id ?? crypto.randomUUID(),
      requiredText(props.championshipId, 'championshipId'),
      props.versionNumber,
      targetIdentifiers,
      requiredText(props.methodStatement, 'methodStatement'),
      requiredText(props.createdBy, 'createdBy'),
      validDate(props.createdAt ?? new Date(), 'createdAt'),
    );
  }

  static reconstruct(props: Parameters<typeof EstInspectionPlan.create>[0] & { id: string; createdAt: Date }) {
    return EstInspectionPlan.create(props);
  }
}

export class EstInspectionEntry {
  private constructor(
    readonly id: string,
    readonly planId: string,
    readonly targetIdentifier: string,
    readonly outcome: EstInspectionOutcome,
    readonly statement: string,
    readonly evidenceReference: string | null,
    readonly performedBy: string,
    readonly technicalDelegateName: string,
    readonly inspectedAt: Date,
    readonly recordedAt: Date,
    readonly revokedEntryId: string | null,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    planId: string;
    targetIdentifier: string;
    outcome: EstInspectionOutcome;
    statement: string;
    evidenceReference?: string;
    performedBy: string;
    technicalDelegateName: string;
    inspectedAt: Date;
    recordedAt?: Date;
    revokedEntryId?: string;
  }): EstInspectionEntry {
    if (!EST_INSPECTION_OUTCOMES.includes(props.outcome)) throw new Error('outcome is invalid');
    return new EstInspectionEntry(
      props.id ?? crypto.randomUUID(),
      requiredText(props.planId, 'planId'),
      requiredText(props.targetIdentifier, 'targetIdentifier'),
      props.outcome,
      requiredText(props.statement, 'statement'),
      optionalText(props.evidenceReference),
      requiredText(props.performedBy, 'performedBy'),
      requiredText(props.technicalDelegateName, 'technicalDelegateName'),
      validDate(props.inspectedAt, 'inspectedAt'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
      optionalText(props.revokedEntryId),
    );
  }

  static reconstruct(props: Parameters<typeof EstInspectionEntry.create>[0] & { id: string; recordedAt: Date }) {
    return EstInspectionEntry.create(props);
  }
}

export interface EstInspectionTargetAssessment {
  readonly targetIdentifier: string;
  readonly status: 'PENDING' | EstInspectionOutcome;
  readonly latestEntry: EstInspectionEntry | null;
}

export interface EstInspectionAssessment {
  readonly ready: boolean;
  readonly ruleReference: 'ISSF 6.3.2.8';
  readonly targets: readonly EstInspectionTargetAssessment[];
}

export interface IEstChampionshipInspectionPolicy {
  assess(plan: EstInspectionPlan, entries: readonly EstInspectionEntry[]): EstInspectionAssessment;
}

export class IssfEstChampionshipInspectionPolicy implements IEstChampionshipInspectionPolicy {
  assess(plan: EstInspectionPlan, entries: readonly EstInspectionEntry[]): EstInspectionAssessment {
    const revokedIds = new Set(entries.flatMap((entry) => (entry.revokedEntryId ? [entry.revokedEntryId] : [])));
    const targets: EstInspectionTargetAssessment[] = plan.targetIdentifiers.map((targetIdentifier) => {
      const latestEntry =
        entries
          .filter(
            (entry) =>
              entry.targetIdentifier === targetIdentifier && !entry.revokedEntryId && !revokedIds.has(entry.id),
          )
          .at(-1) ?? null;
      return {
        targetIdentifier,
        status: latestEntry?.outcome ?? 'PENDING',
        latestEntry,
      };
    });
    return {
      ready: targets.length > 0 && targets.every((target) => target.status === 'PASSED'),
      ruleReference: 'ISSF 6.3.2.8',
      targets,
    };
  }
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
