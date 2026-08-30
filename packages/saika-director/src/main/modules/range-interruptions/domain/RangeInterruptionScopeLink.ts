export const RANGE_INTERRUPTION_SCOPE_TYPES = ['COMPETITION', 'EVENT'] as const;

export type RangeInterruptionScopeType = (typeof RANGE_INTERRUPTION_SCOPE_TYPES)[number];

interface CreateRangeInterruptionScopeLinkProps {
  caseId: string;
  scopeType: RangeInterruptionScopeType;
  scopeId: string;
  linkedBy: string;
  note?: string;
  linkedAt?: Date;
}

/** Append-only link from an interruption record to an operational scope. */
export class RangeInterruptionScopeLink {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly scopeType: RangeInterruptionScopeType,
    readonly scopeId: string,
    readonly linkedBy: string,
    readonly note: string | null,
    readonly linkedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateRangeInterruptionScopeLinkProps): RangeInterruptionScopeLink {
    if (!RANGE_INTERRUPTION_SCOPE_TYPES.includes(props.scopeType)) throw new Error('scopeType is invalid');
    return new RangeInterruptionScopeLink(
      crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.scopeType,
      requiredText(props.scopeId, 'scopeId'),
      requiredText(props.linkedBy, 'linkedBy'),
      normalizeOptional(props.note),
      validDate(props.linkedAt ?? new Date(), 'linkedAt'),
    );
  }

  static reconstruct(props: {
    id: string;
    caseId: string;
    scopeType: RangeInterruptionScopeType;
    scopeId: string;
    linkedBy: string;
    note: string | null;
    linkedAt: Date;
  }): RangeInterruptionScopeLink {
    return new RangeInterruptionScopeLink(
      props.id,
      props.caseId,
      props.scopeType,
      props.scopeId,
      props.linkedBy,
      props.note,
      validDate(props.linkedAt, 'linkedAt'),
    );
  }
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
