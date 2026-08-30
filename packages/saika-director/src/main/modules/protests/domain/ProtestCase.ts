export const PROTEST_KINDS = ['VERBAL', 'WRITTEN', 'FINAL_VERBAL', 'APPEAL'] as const;
export const PROTEST_SCOPE_TYPES = ['COMPETITION', 'EVENT'] as const;
export type ProtestKind = (typeof PROTEST_KINDS)[number];
export type ProtestScopeType = (typeof PROTEST_SCOPE_TYPES)[number];

export interface ProtestCaseProps {
  id?: string;
  scopeType: ProtestScopeType;
  scopeId: string;
  kind: ProtestKind;
  parentProtestId?: string | null;
  subject: string;
  statement: string;
  lodgedBy: string;
  lodgedAt: Date;
  triggeringDecisionAt?: Date | null;
  formReference?: string | null;
  feePaidEuro?: number | null;
  lateAcceptanceReason?: string | null;
  openedBy: string;
  createdAt?: Date;
}

export class ProtestCase {
  private constructor(
    readonly id: string,
    readonly scopeType: ProtestScopeType,
    readonly scopeId: string,
    readonly kind: ProtestKind,
    readonly parentProtestId: string | null,
    readonly subject: string,
    readonly statement: string,
    readonly lodgedBy: string,
    readonly lodgedAt: Date,
    readonly triggeringDecisionAt: Date | null,
    readonly formReference: string | null,
    readonly feePaidEuro: number | null,
    readonly lateAcceptanceReason: string | null,
    readonly openedBy: string,
    readonly createdAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: ProtestCaseProps): ProtestCase {
    if (!PROTEST_KINDS.includes(props.kind)) throw new Error('Protest kind is invalid');
    if (!PROTEST_SCOPE_TYPES.includes(props.scopeType)) throw new Error('Protest scope is invalid');
    const parentProtestId = optionalText(props.parentProtestId);
    if ((props.kind === 'APPEAL') !== Boolean(parentProtestId)) {
      throw new Error('An appeal must identify its parent protest, and only an appeal may do so');
    }
    if (
      props.feePaidEuro !== undefined &&
      props.feePaidEuro !== null &&
      (!Number.isInteger(props.feePaidEuro) || props.feePaidEuro < 0)
    ) {
      throw new Error('feePaidEuro must be a non-negative integer');
    }
    return new ProtestCase(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      props.scopeType,
      requiredText(props.scopeId, 'scopeId'),
      props.kind,
      parentProtestId,
      requiredText(props.subject, 'subject'),
      requiredText(props.statement, 'statement'),
      requiredText(props.lodgedBy, 'lodgedBy'),
      validDate(props.lodgedAt, 'lodgedAt'),
      props.triggeringDecisionAt ? validDate(props.triggeringDecisionAt, 'triggeringDecisionAt') : null,
      optionalText(props.formReference),
      props.feePaidEuro ?? null,
      optionalText(props.lateAcceptanceReason),
      requiredText(props.openedBy, 'openedBy'),
      validDate(props.createdAt ?? new Date(), 'createdAt'),
    );
  }

  static reconstruct(props: ProtestCaseProps & { id: string; createdAt: Date }): ProtestCase {
    return ProtestCase.create(props);
  }
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}
function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
