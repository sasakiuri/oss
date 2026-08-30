export const TARGET_EXAMINATION_SCOPE_TYPES = ['COMPETITION', 'EVENT'] as const;

export type TargetExaminationScopeType = (typeof TARGET_EXAMINATION_SCOPE_TYPES)[number];

export interface CreateTargetExaminationScopeLinkProps {
  caseId: string;
  scopeType: TargetExaminationScopeType;
  scopeId: string;
  linkedBy: string;
  note?: string;
  linkedAt?: Date;
}

/** Append-only association that keeps an examination independent of competition and event modules. */
export class TargetExaminationScopeLink {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly scopeType: TargetExaminationScopeType,
    readonly scopeId: string,
    readonly linkedBy: string,
    readonly note: string | null,
    readonly linkedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateTargetExaminationScopeLinkProps): TargetExaminationScopeLink {
    validateScopeType(props.scopeType);
    const linkedAt = props.linkedAt ?? new Date();
    if (!Number.isFinite(linkedAt.getTime())) throw new Error('linkedAt must be valid');
    return new TargetExaminationScopeLink(
      crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.scopeType,
      requiredText(props.scopeId, 'scopeId'),
      requiredText(props.linkedBy, 'linkedBy'),
      normalizeOptional(props.note),
      new Date(linkedAt.getTime()),
    );
  }

  static reconstruct(props: {
    id: string;
    caseId: string;
    scopeType: TargetExaminationScopeType;
    scopeId: string;
    linkedBy: string;
    note: string | null;
    linkedAt: Date;
  }): TargetExaminationScopeLink {
    validateScopeType(props.scopeType);
    return new TargetExaminationScopeLink(
      props.id,
      props.caseId,
      props.scopeType,
      props.scopeId,
      props.linkedBy,
      props.note,
      new Date(props.linkedAt.getTime()),
    );
  }
}

function validateScopeType(value: TargetExaminationScopeType): void {
  if (!TARGET_EXAMINATION_SCOPE_TYPES.includes(value)) throw new Error('scopeType is invalid');
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
