export const SANCTION_CLASSIFICATION_CODES = ['DSQ', 'DQB', 'AD_DSQ'] as const;
export const SANCTION_SCOPES = ['EVENT', 'CHAMPIONSHIP'] as const;
export const SANCTION_AUTHORITY_BASES = ['JURY_MAJORITY', 'POST_COMPETITION_CHECK', 'ANTI_DOPING_DECISION'] as const;
export const SANCTION_OFFICIAL_ROLES = ['JURY_MEMBER', 'EQUIPMENT_CONTROL_JURY', 'ANTI_DOPING_AUTHORITY'] as const;
export const SANCTION_AUTHORIZATION_MODES = ['MANUAL_ATTESTATION', 'AUTHENTICATED_SESSION'] as const;
export const SANCTION_DECISION_TYPES = ['IMPOSED', 'REVOKED'] as const;

export type SanctionClassificationCode = (typeof SANCTION_CLASSIFICATION_CODES)[number];
export type SanctionScope = (typeof SANCTION_SCOPES)[number];
export type SanctionAuthorityBasis = (typeof SANCTION_AUTHORITY_BASES)[number];
export type SanctionOfficialRole = (typeof SANCTION_OFFICIAL_ROLES)[number];
export type SanctionAuthorizationMode = (typeof SANCTION_AUTHORIZATION_MODES)[number];
export type SanctionDecisionType = (typeof SANCTION_DECISION_TYPES)[number];

export interface SanctionAuthorization {
  readonly basis: SanctionAuthorityBasis;
  readonly authorityReference: string;
  readonly officialName: string;
  readonly officialRole: SanctionOfficialRole;
  readonly officialActorId: string | null;
  readonly mode: SanctionAuthorizationMode;
}

export class SanctionDecision {
  private constructor(
    readonly id: string,
    readonly athleteIdentityId: string,
    readonly sourceEventId: string,
    readonly decisionType: SanctionDecisionType,
    readonly classificationCode: SanctionClassificationCode,
    readonly scope: SanctionScope,
    readonly authorization: SanctionAuthorization,
    readonly ruleReference: string,
    readonly incidentReportNumber: string | null,
    readonly publicRemark: string,
    readonly internalNote: string | null,
    readonly decidedAt: Date,
    readonly recordedAt: Date,
    readonly reversesDecisionId: string | null,
  ) {
    Object.freeze(this.authorization);
    Object.freeze(this);
  }

  static impose(props: {
    id?: string;
    athleteIdentityId: string;
    sourceEventId: string;
    classificationCode: SanctionClassificationCode;
    scope: SanctionScope;
    authorization: SanctionAuthorization;
    ruleReference: string;
    incidentReportNumber?: string | null;
    publicRemark: string;
    internalNote?: string | null;
    decidedAt?: Date;
    recordedAt?: Date;
  }): SanctionDecision {
    return SanctionDecision.build({ ...props, decisionType: 'IMPOSED', reversesDecisionId: null });
  }

  static revoke(
    imposed: SanctionDecision,
    props: {
      id?: string;
      authorization: SanctionAuthorization;
      ruleReference: string;
      reason: string;
      internalNote?: string | null;
      decidedAt?: Date;
      recordedAt?: Date;
    },
  ): SanctionDecision {
    if (imposed.decisionType !== 'IMPOSED') throw new Error('Only an imposed sanction can be revoked');
    return SanctionDecision.build({
      ...props,
      athleteIdentityId: imposed.athleteIdentityId,
      sourceEventId: imposed.sourceEventId,
      decisionType: 'REVOKED',
      classificationCode: imposed.classificationCode,
      scope: imposed.scope,
      incidentReportNumber: imposed.incidentReportNumber,
      publicRemark: props.reason,
      reversesDecisionId: imposed.id,
    });
  }

  static reconstruct(props: {
    id: string;
    athleteIdentityId: string;
    sourceEventId: string;
    decisionType: SanctionDecisionType;
    classificationCode: SanctionClassificationCode;
    scope: SanctionScope;
    authorization: SanctionAuthorization;
    ruleReference: string;
    incidentReportNumber: string | null;
    publicRemark: string;
    internalNote: string | null;
    decidedAt: Date;
    recordedAt: Date;
    reversesDecisionId: string | null;
  }): SanctionDecision {
    return SanctionDecision.build(props);
  }

  private static build(props: {
    id?: string;
    athleteIdentityId: string;
    sourceEventId: string;
    decisionType: SanctionDecisionType;
    classificationCode: SanctionClassificationCode;
    scope: SanctionScope;
    authorization: SanctionAuthorization;
    ruleReference: string;
    incidentReportNumber?: string | null;
    publicRemark: string;
    internalNote?: string | null;
    decidedAt?: Date;
    recordedAt?: Date;
    reversesDecisionId: string | null;
  }): SanctionDecision {
    if (!SANCTION_DECISION_TYPES.includes(props.decisionType)) throw new Error('decisionType is invalid');
    assertSanctionShape(props.classificationCode, props.scope, props.authorization);
    if ((props.decisionType === 'IMPOSED') !== (props.reversesDecisionId === null)) {
      throw new Error('Only REVOKED sanction decisions may reverse an imposed decision');
    }
    return new SanctionDecision(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      requiredText(props.athleteIdentityId, 'athleteIdentityId'),
      requiredText(props.sourceEventId, 'sourceEventId'),
      props.decisionType,
      props.classificationCode,
      props.scope,
      normalizeAuthorization(props.authorization),
      requiredText(props.ruleReference, 'ruleReference'),
      optionalText(props.incidentReportNumber),
      requiredText(props.publicRemark, 'publicRemark'),
      optionalText(props.internalNote),
      validDate(props.decidedAt ?? new Date(), 'decidedAt'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
      props.reversesDecisionId ? requiredText(props.reversesDecisionId, 'reversesDecisionId') : null,
    );
  }
}

export function getActiveSanctionDecisions(history: readonly SanctionDecision[]): SanctionDecision[] {
  const reversed = new Set(
    history.flatMap((decision) => (decision.reversesDecisionId ? [decision.reversesDecisionId] : [])),
  );
  return history
    .filter((decision) => decision.decisionType === 'IMPOSED' && !reversed.has(decision.id))
    .sort(compareDecisions);
}

export function selectEffectiveSanction(decisions: readonly SanctionDecision[]): SanctionDecision | null {
  return (
    [...decisions].sort((left, right) => {
      const priority =
        classificationPriority(right.classificationCode) - classificationPriority(left.classificationCode);
      return priority || compareDecisions(right, left);
    })[0] ?? null
  );
}

function assertSanctionShape(
  code: SanctionClassificationCode,
  scope: SanctionScope,
  authorization: SanctionAuthorization,
): void {
  if (!SANCTION_CLASSIFICATION_CODES.includes(code)) throw new Error('classificationCode is invalid');
  if (!SANCTION_SCOPES.includes(scope)) throw new Error('scope is invalid');
  if (code === 'DSQ' && scope !== 'EVENT') throw new Error('DSQ must apply to every phase of one event');
  if (code !== 'DSQ' && scope !== 'CHAMPIONSHIP') {
    throw new Error(`${code} must apply to every event in the Championship`);
  }
  if (code === 'DQB' && authorization.basis !== 'JURY_MAJORITY') {
    throw new Error('DQB requires a Jury-majority authority basis');
  }
  if (code === 'AD_DSQ' && authorization.basis !== 'ANTI_DOPING_DECISION') {
    throw new Error('AD-DSQ requires an anti-doping decision authority basis');
  }
  if (code === 'DSQ' && !['JURY_MAJORITY', 'POST_COMPETITION_CHECK'].includes(authorization.basis)) {
    throw new Error('DSQ requires a Jury-majority or post-competition-check authority basis');
  }
  if (authorization.basis === 'JURY_MAJORITY' && authorization.officialRole !== 'JURY_MEMBER') {
    throw new Error('A Jury-majority decision must be recorded by a Jury Member');
  }
  if (authorization.basis === 'POST_COMPETITION_CHECK' && authorization.officialRole !== 'EQUIPMENT_CONTROL_JURY') {
    throw new Error('A post-competition check must be recorded by Equipment Control Jury');
  }
  if (authorization.basis === 'ANTI_DOPING_DECISION' && authorization.officialRole !== 'ANTI_DOPING_AUTHORITY') {
    throw new Error('An anti-doping decision must be recorded by the anti-doping authority');
  }
}

function normalizeAuthorization(value: SanctionAuthorization): SanctionAuthorization {
  if (!SANCTION_AUTHORITY_BASES.includes(value.basis)) throw new Error('authorization basis is invalid');
  if (!SANCTION_OFFICIAL_ROLES.includes(value.officialRole)) throw new Error('officialRole is invalid');
  if (!SANCTION_AUTHORIZATION_MODES.includes(value.mode)) throw new Error('authorization mode is invalid');
  if (value.mode === 'AUTHENTICATED_SESSION' && !optionalText(value.officialActorId)) {
    throw new Error('Authenticated sanction authorization requires an actor ID');
  }
  if (value.mode === 'MANUAL_ATTESTATION' && optionalText(value.officialActorId)) {
    throw new Error('Manual sanction authorization cannot claim an authenticated actor ID');
  }
  return {
    basis: value.basis,
    authorityReference: requiredText(value.authorityReference, 'authorityReference'),
    officialName: requiredText(value.officialName, 'officialName'),
    officialRole: value.officialRole,
    officialActorId: optionalText(value.officialActorId),
    mode: value.mode,
  };
}

function classificationPriority(code: SanctionClassificationCode): number {
  if (code === 'AD_DSQ') return 3;
  if (code === 'DQB') return 2;
  return 1;
}

function compareDecisions(left: SanctionDecision, right: SanctionDecision): number {
  return left.decidedAt.getTime() - right.decidedAt.getTime() || left.id.localeCompare(right.id);
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
