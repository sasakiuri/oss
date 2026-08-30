export const ADJUDICATION_CASE_SCOPE_TYPES = ['EVENT', 'COMPETITION'] as const;
export const ADJUDICATION_CASE_CATEGORIES = [
  'SCORING',
  'RANGE_INCIDENT',
  'PROTEST',
  'MALFUNCTION',
  'TARGET_FAILURE',
  'COMMAND_ERROR',
  'FINAL',
  'OTHER',
] as const;
export const ADJUDICATION_CASE_ENTRY_TYPES = ['NOTE', 'REFERRED', 'RESOLVED', 'REOPENED', 'CLOSED', 'VOID'] as const;
export const ADJUDICATION_ARTIFACT_TYPES = [
  'SCORING_DECISION',
  'RANGE_INCIDENT_REPORT',
  'PROTEST',
  'RANGE_INTERRUPTION',
  'TARGET_EXAMINATION',
  'FINAL_OPERATION',
  'FINAL_RECOVERY',
  'OTHER',
] as const;
export const ADJUDICATION_LINK_RELATIONS = [
  'SOURCE',
  'EVIDENCE',
  'DECISION',
  'REPORT',
  'PROTEST',
  'RECOVERY',
  'RELATED',
] as const;

export type AdjudicationCaseScopeType = (typeof ADJUDICATION_CASE_SCOPE_TYPES)[number];
export type AdjudicationCaseCategory = (typeof ADJUDICATION_CASE_CATEGORIES)[number];
export type AdjudicationCaseEntryType = (typeof ADJUDICATION_CASE_ENTRY_TYPES)[number];
export type AdjudicationArtifactType = (typeof ADJUDICATION_ARTIFACT_TYPES)[number];
export type AdjudicationLinkRelation = (typeof ADJUDICATION_LINK_RELATIONS)[number];
export type AdjudicationCaseStatus = 'OPEN' | 'REFERRED' | 'RESOLVED' | 'CLOSED' | 'VOID';

export class AdjudicationCase {
  private constructor(
    readonly id: string,
    readonly scopeType: AdjudicationCaseScopeType,
    readonly scopeId: string,
    readonly category: AdjudicationCaseCategory,
    readonly subject: string,
    readonly summary: string,
    readonly openedBy: string,
    readonly openedAt: Date,
    readonly createdAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    scopeType: AdjudicationCaseScopeType;
    scopeId: string;
    category: AdjudicationCaseCategory;
    subject: string;
    summary: string;
    openedBy: string;
    openedAt?: Date;
    createdAt?: Date;
  }): AdjudicationCase {
    if (!ADJUDICATION_CASE_SCOPE_TYPES.includes(props.scopeType)) throw new Error('Adjudication scope is invalid');
    if (!ADJUDICATION_CASE_CATEGORIES.includes(props.category)) throw new Error('Adjudication category is invalid');
    return new AdjudicationCase(
      props.id ?? crypto.randomUUID(),
      props.scopeType,
      requiredText(props.scopeId, 'scopeId'),
      props.category,
      requiredText(props.subject, 'subject'),
      requiredText(props.summary, 'summary'),
      requiredText(props.openedBy, 'openedBy'),
      validDate(props.openedAt ?? new Date(), 'openedAt'),
      validDate(props.createdAt ?? new Date(), 'createdAt'),
    );
  }

  static reconstruct(
    props: Parameters<typeof AdjudicationCase.create>[0] & { id: string; createdAt: Date },
  ): AdjudicationCase {
    return AdjudicationCase.create(props);
  }
}

export class AdjudicationCaseEntry {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly type: AdjudicationCaseEntryType,
    readonly statement: string,
    readonly officialName: string,
    readonly ruleReference: string | null,
    readonly occurredAt: Date,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    caseId: string;
    type: AdjudicationCaseEntryType;
    statement: string;
    officialName: string;
    ruleReference?: string | null;
    occurredAt?: Date;
    recordedAt?: Date;
  }): AdjudicationCaseEntry {
    if (!ADJUDICATION_CASE_ENTRY_TYPES.includes(props.type)) throw new Error('Adjudication entry type is invalid');
    return new AdjudicationCaseEntry(
      props.id ?? crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.type,
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      optionalText(props.ruleReference),
      validDate(props.occurredAt ?? new Date(), 'occurredAt'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
    );
  }

  static reconstruct(
    props: Parameters<typeof AdjudicationCaseEntry.create>[0] & { id: string; recordedAt: Date },
  ): AdjudicationCaseEntry {
    return AdjudicationCaseEntry.create(props);
  }
}

export type AdjudicationCaseLinkOperation = 'ADD' | 'REMOVE';

export class AdjudicationCaseLink {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly operation: AdjudicationCaseLinkOperation,
    readonly artifactType: AdjudicationArtifactType,
    readonly artifactId: string,
    readonly relation: AdjudicationLinkRelation,
    readonly labelSnapshot: string,
    readonly statement: string,
    readonly officialName: string,
    readonly recordedAt: Date,
    readonly reversesLinkId: string | null,
  ) {
    Object.freeze(this);
  }

  static add(props: {
    id?: string;
    caseId: string;
    artifactType: AdjudicationArtifactType;
    artifactId: string;
    relation: AdjudicationLinkRelation;
    labelSnapshot: string;
    statement: string;
    officialName: string;
    recordedAt?: Date;
  }): AdjudicationCaseLink {
    return this.create('ADD', { ...props, reversesLinkId: null });
  }

  static remove(props: {
    id?: string;
    caseId: string;
    source: AdjudicationCaseLink;
    statement: string;
    officialName: string;
    recordedAt?: Date;
  }): AdjudicationCaseLink {
    if (props.source.operation !== 'ADD') throw new Error('Only an added artifact link can be removed');
    return this.create('REMOVE', {
      ...props,
      artifactType: props.source.artifactType,
      artifactId: props.source.artifactId,
      relation: props.source.relation,
      labelSnapshot: props.source.labelSnapshot,
      reversesLinkId: props.source.id,
    });
  }

  static reconstruct(props: {
    id: string;
    caseId: string;
    operation: AdjudicationCaseLinkOperation;
    artifactType: AdjudicationArtifactType;
    artifactId: string;
    relation: AdjudicationLinkRelation;
    labelSnapshot: string;
    statement: string;
    officialName: string;
    recordedAt: Date;
    reversesLinkId: string | null;
  }): AdjudicationCaseLink {
    return this.create(props.operation, props);
  }

  private static create(
    operation: AdjudicationCaseLinkOperation,
    props: {
      id?: string;
      caseId: string;
      artifactType: AdjudicationArtifactType;
      artifactId: string;
      relation: AdjudicationLinkRelation;
      labelSnapshot: string;
      statement: string;
      officialName: string;
      recordedAt?: Date;
      reversesLinkId: string | null;
    },
  ): AdjudicationCaseLink {
    if (!ADJUDICATION_ARTIFACT_TYPES.includes(props.artifactType)) throw new Error('Artifact type is invalid');
    if (!ADJUDICATION_LINK_RELATIONS.includes(props.relation)) throw new Error('Artifact relation is invalid');
    if ((operation === 'REMOVE') !== Boolean(props.reversesLinkId)) {
      throw new Error('A removed artifact link must identify the link it reverses');
    }
    return new AdjudicationCaseLink(
      props.id ?? crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      operation,
      props.artifactType,
      requiredText(props.artifactId, 'artifactId'),
      props.relation,
      requiredText(props.labelSnapshot, 'labelSnapshot'),
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
      props.reversesLinkId,
    );
  }
}

export function adjudicationCaseStatus(entries: readonly AdjudicationCaseEntry[]): AdjudicationCaseStatus {
  let status: AdjudicationCaseStatus = 'OPEN';
  for (const entry of entries) {
    switch (entry.type) {
      case 'REFERRED':
        status = 'REFERRED';
        break;
      case 'RESOLVED':
        status = 'RESOLVED';
        break;
      case 'REOPENED':
        status = 'OPEN';
        break;
      case 'CLOSED':
        status = 'CLOSED';
        break;
      case 'VOID':
        status = 'VOID';
        break;
      case 'NOTE':
        break;
    }
  }
  return status;
}

export function activeAdjudicationLinks(history: readonly AdjudicationCaseLink[]): AdjudicationCaseLink[] {
  const removedIds = new Set(
    history
      .filter((link) => link.operation === 'REMOVE')
      .flatMap((link) => (link.reversesLinkId ? [link.reversesLinkId] : [])),
  );
  return history.filter((link) => link.operation === 'ADD' && !removedIds.has(link.id));
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
