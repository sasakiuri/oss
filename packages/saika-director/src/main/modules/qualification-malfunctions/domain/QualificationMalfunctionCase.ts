import type {
  QualificationMalfunctionCapability,
  QualificationMalfunctionClaimAssessment,
  QualificationMalfunctionClassification,
  RulePackIdentity,
} from '@sasakiuri/saika-rules';

export const QUALIFICATION_MALFUNCTION_REPORT_SOURCES = ['LANE_SIGNAL', 'DIRECTOR_MANUAL'] as const;
export const QUALIFICATION_MALFUNCTION_CLAIM_MODES = ['CLAIM', 'DOCUMENTATION_ONLY'] as const;
export const QUALIFICATION_MALFUNCTION_OFFICIAL_ROLES = [
  'RANGE_OFFICER',
  'CRO',
  'JURY_MEMBER',
  'RTS_OFFICER',
  'TECHNICAL_OFFICER',
] as const;
export const QUALIFICATION_MALFUNCTION_ENTRY_TYPES = [
  'NOTE',
  'INSPECTION_RECORDED',
  'CLASSIFIED',
  'REPAIR_STARTED',
  'REPAIR_EXTENDED',
  'REPAIR_COMPLETED',
  'REMEDY_AUTHORIZED',
  'EXECUTION_RECORDED',
  'SCORE_SETTLED',
  'SCORE_REOPENED',
  'COMPLETED',
  'VOID',
] as const;
export const QUALIFICATION_MALFUNCTION_REMEDIES = [
  'CONTINUE_WITHIN_ORIGINAL_TIME',
  'REPEAT_FULL_SERIES',
  'COMPLETE_REMAINING_SHOTS',
  'SCORE_UNFIRED_AS_MISS',
  'NO_FURTHER_ACTION',
] as const;

export type QualificationMalfunctionReportSource = (typeof QUALIFICATION_MALFUNCTION_REPORT_SOURCES)[number];
export type QualificationMalfunctionClaimMode = (typeof QUALIFICATION_MALFUNCTION_CLAIM_MODES)[number];
export type QualificationMalfunctionOfficialRole = (typeof QUALIFICATION_MALFUNCTION_OFFICIAL_ROLES)[number];
export type QualificationMalfunctionEntryType = (typeof QUALIFICATION_MALFUNCTION_ENTRY_TYPES)[number];
export type QualificationMalfunctionRemedy = (typeof QUALIFICATION_MALFUNCTION_REMEDIES)[number];
export type QualificationMalfunctionStatus =
  | 'OPEN'
  | 'INSPECTED'
  | 'CLASSIFIED'
  | 'REPAIRING'
  | 'REPAIRED'
  | 'RECOVERY_AUTHORIZED'
  | 'EXECUTED'
  | 'SETTLED'
  | 'COMPLETED'
  | 'VOID';

export class QualificationMalfunctionCase {
  private constructor(
    readonly id: string,
    readonly competitionId: string,
    readonly eventId: string,
    readonly competitionTypeId: string,
    readonly rulePackIdentity: RulePackIdentity | null,
    readonly policySnapshot: QualificationMalfunctionCapability,
    readonly participantId: string,
    readonly participantNameSnapshot: string,
    readonly startNumberSnapshot: string | null,
    readonly laneId: string,
    readonly laneChannelSnapshot: number,
    readonly relayNumberSnapshot: number,
    readonly reportSource: QualificationMalfunctionReportSource,
    readonly sourceSignalId: string | null,
    readonly claimMode: QualificationMalfunctionClaimMode,
    readonly phase: 'SIGHTING' | 'MATCH',
    readonly stageId: string | null,
    readonly stageIndex: number,
    readonly seriesIndex: number,
    readonly seriesShotLimit: number | null,
    readonly recordedShots: number,
    readonly timedTargetProgramId: string | null,
    readonly exposureIndex: number | null,
    readonly laneSessionId: string | null,
    readonly laneSnapshotCapturedAt: Date | null,
    readonly exceptionalMatchPart: 1 | 2 | null,
    readonly existingClaimsInScope: number,
    readonly existingClaimsInPart: number | null,
    readonly claimAssessment: QualificationMalfunctionClaimAssessment,
    readonly summary: string,
    readonly openedBy: string,
    readonly occurredAt: Date,
    readonly createdAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    competitionId: string;
    eventId: string;
    competitionTypeId: string;
    rulePackIdentity?: RulePackIdentity | null;
    policySnapshot: QualificationMalfunctionCapability;
    participantId: string;
    participantNameSnapshot: string;
    startNumberSnapshot?: string | null;
    laneId: string;
    laneChannelSnapshot: number;
    relayNumberSnapshot: number;
    reportSource: QualificationMalfunctionReportSource;
    sourceSignalId?: string | null;
    claimMode: QualificationMalfunctionClaimMode;
    phase: 'SIGHTING' | 'MATCH';
    stageId?: string | null;
    stageIndex: number;
    seriesIndex: number;
    seriesShotLimit?: number | null;
    recordedShots: number;
    timedTargetProgramId?: string | null;
    exposureIndex?: number | null;
    laneSessionId?: string | null;
    laneSnapshotCapturedAt?: Date | null;
    exceptionalMatchPart?: 1 | 2 | null;
    existingClaimsInScope: number;
    existingClaimsInPart?: number | null;
    claimAssessment: QualificationMalfunctionClaimAssessment;
    summary: string;
    openedBy: string;
    occurredAt?: Date;
    createdAt?: Date;
  }): QualificationMalfunctionCase {
    if (!QUALIFICATION_MALFUNCTION_REPORT_SOURCES.includes(props.reportSource)) {
      throw new Error('Qualification malfunction report source is invalid');
    }
    if (!QUALIFICATION_MALFUNCTION_CLAIM_MODES.includes(props.claimMode)) {
      throw new Error('Qualification malfunction claim mode is invalid');
    }
    if (props.claimMode === 'CLAIM' && !props.claimAssessment.allowed) {
      throw new Error(`Qualification malfunction claim is not available: ${props.claimAssessment.reason}`);
    }
    const seriesShotLimit = optionalPositiveInteger(props.seriesShotLimit, 'seriesShotLimit');
    const recordedShots = nonNegativeInteger(props.recordedShots, 'recordedShots');
    if (seriesShotLimit !== null && recordedShots > seriesShotLimit) {
      throw new Error('recordedShots cannot exceed the series shot limit');
    }
    const exposureIndex = optionalNonNegativeInteger(props.exposureIndex, 'exposureIndex');
    const timedTargetProgramId = optionalText(props.timedTargetProgramId);
    if (exposureIndex !== null && !timedTargetProgramId) {
      throw new Error('An exposure index requires a timed-target program');
    }
    const exceptionalMatchPart = props.exceptionalMatchPart ?? null;
    if (exceptionalMatchPart !== null && props.phase !== 'MATCH') {
      throw new Error('An exceptional match part is only valid in MATCH');
    }
    const existingClaimsInPart = optionalNonNegativeInteger(props.existingClaimsInPart, 'existingClaimsInPart');
    if ((exceptionalMatchPart === null) !== (existingClaimsInPart === null)) {
      throw new Error('Exceptional match part and existing part claims must be recorded together');
    }
    if ((props.reportSource === 'LANE_SIGNAL') !== Boolean(props.laneSnapshotCapturedAt)) {
      throw new Error('Only a Lane signal may carry a live Lane snapshot timestamp');
    }
    const sourceSignalId = optionalText(props.sourceSignalId);
    if ((props.reportSource === 'LANE_SIGNAL') !== Boolean(sourceSignalId)) {
      throw new Error('A Lane signal case requires one source signal; a manual case must not carry one');
    }

    return new QualificationMalfunctionCase(
      props.id ?? crypto.randomUUID(),
      requiredText(props.competitionId, 'competitionId'),
      requiredText(props.eventId, 'eventId'),
      requiredText(props.competitionTypeId, 'competitionTypeId'),
      copyRulePackIdentity(props.rulePackIdentity ?? null),
      immutableCopy(props.policySnapshot),
      requiredText(props.participantId, 'participantId'),
      requiredText(props.participantNameSnapshot, 'participantNameSnapshot'),
      optionalText(props.startNumberSnapshot),
      requiredText(props.laneId, 'laneId'),
      positiveInteger(props.laneChannelSnapshot, 'laneChannelSnapshot'),
      positiveInteger(props.relayNumberSnapshot, 'relayNumberSnapshot'),
      props.reportSource,
      sourceSignalId,
      props.claimMode,
      props.phase,
      optionalText(props.stageId),
      nonNegativeInteger(props.stageIndex, 'stageIndex'),
      nonNegativeInteger(props.seriesIndex, 'seriesIndex'),
      seriesShotLimit,
      recordedShots,
      timedTargetProgramId,
      exposureIndex,
      optionalText(props.laneSessionId),
      props.laneSnapshotCapturedAt ? validDate(props.laneSnapshotCapturedAt, 'laneSnapshotCapturedAt') : null,
      exceptionalMatchPart,
      nonNegativeInteger(props.existingClaimsInScope, 'existingClaimsInScope'),
      existingClaimsInPart,
      immutableCopy(props.claimAssessment),
      requiredText(props.summary, 'summary'),
      requiredText(props.openedBy, 'openedBy'),
      validDate(props.occurredAt ?? new Date(), 'occurredAt'),
      validDate(props.createdAt ?? new Date(), 'createdAt'),
    );
  }

  static reconstruct(
    props: Parameters<typeof QualificationMalfunctionCase.create>[0] & { id: string; createdAt: Date },
  ): QualificationMalfunctionCase {
    return QualificationMalfunctionCase.create(props);
  }
}

export class QualificationMalfunctionEntry {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly type: QualificationMalfunctionEntryType,
    readonly statement: string,
    readonly officialName: string,
    readonly officialRole: QualificationMalfunctionOfficialRole,
    readonly ruleReference: string | null,
    readonly classification: QualificationMalfunctionClassification | null,
    readonly causeCode: string | null,
    readonly remedy: QualificationMalfunctionRemedy | null,
    readonly shotsToFire: number | null,
    readonly repairSeconds: number | null,
    readonly artifactId: string | null,
    readonly occurredAt: Date,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    caseId: string;
    type: QualificationMalfunctionEntryType;
    statement: string;
    officialName: string;
    officialRole: QualificationMalfunctionOfficialRole;
    ruleReference?: string | null;
    classification?: QualificationMalfunctionClassification | null;
    causeCode?: string | null;
    remedy?: QualificationMalfunctionRemedy | null;
    shotsToFire?: number | null;
    repairSeconds?: number | null;
    artifactId?: string | null;
    occurredAt?: Date;
    recordedAt?: Date;
  }): QualificationMalfunctionEntry {
    if (!QUALIFICATION_MALFUNCTION_ENTRY_TYPES.includes(props.type)) {
      throw new Error('Qualification malfunction entry type is invalid');
    }
    if (!QUALIFICATION_MALFUNCTION_OFFICIAL_ROLES.includes(props.officialRole)) {
      throw new Error('Qualification malfunction official role is invalid');
    }
    if (props.remedy && !QUALIFICATION_MALFUNCTION_REMEDIES.includes(props.remedy)) {
      throw new Error('Qualification malfunction remedy is invalid');
    }
    const classification = props.classification ?? null;
    const causeCode = optionalText(props.causeCode);
    const remedy = props.remedy ?? null;
    const shotsToFire = optionalNonNegativeInteger(props.shotsToFire, 'shotsToFire');
    const repairSeconds = optionalPositiveInteger(props.repairSeconds, 'repairSeconds');
    if (props.type === 'CLASSIFIED' && (!classification || !causeCode)) {
      throw new Error('A classification entry requires a classification and cause code');
    }
    if (props.type !== 'CLASSIFIED' && (classification || causeCode)) {
      throw new Error('Only a classification entry may include a classification and cause code');
    }
    if (props.type === 'REMEDY_AUTHORIZED' && (!remedy || shotsToFire === null)) {
      throw new Error('A remedy authorization requires a remedy and shots-to-fire value');
    }
    if (props.type !== 'REMEDY_AUTHORIZED' && (remedy || shotsToFire !== null)) {
      throw new Error('Only a remedy authorization may include a remedy and shots-to-fire value');
    }
    if (props.type === 'REPAIR_EXTENDED' && repairSeconds === null) {
      throw new Error('A repair extension requires a positive duration');
    }
    if (props.type !== 'REPAIR_EXTENDED' && repairSeconds !== null) {
      throw new Error('Only a repair extension may include repair seconds');
    }
    const artifactId = optionalText(props.artifactId);
    if (props.type === 'SCORE_REOPENED' && !['RTS_OFFICER', 'JURY_MEMBER'].includes(props.officialRole))
      throw new Error('Only RTS or Jury may reopen settled scoring');
    if (
      (props.type === 'EXECUTION_RECORDED' || props.type === 'SCORE_SETTLED' || props.type === 'SCORE_REOPENED') &&
      !artifactId
    ) {
      throw new Error(`${props.type} requires an immutable artifact reference`);
    }

    return new QualificationMalfunctionEntry(
      props.id ?? crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.type,
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      props.officialRole,
      optionalText(props.ruleReference),
      classification,
      causeCode,
      remedy,
      shotsToFire,
      repairSeconds,
      artifactId,
      validDate(props.occurredAt ?? new Date(), 'occurredAt'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
    );
  }

  static reconstruct(
    props: Parameters<typeof QualificationMalfunctionEntry.create>[0] & { id: string; recordedAt: Date },
  ): QualificationMalfunctionEntry {
    return QualificationMalfunctionEntry.create(props);
  }
}

export function qualificationMalfunctionStatus(
  entries: readonly QualificationMalfunctionEntry[],
): QualificationMalfunctionStatus {
  let status: QualificationMalfunctionStatus = 'OPEN';
  for (const entry of entries) {
    switch (entry.type) {
      case 'INSPECTION_RECORDED':
        status = 'INSPECTED';
        break;
      case 'CLASSIFIED':
        status = 'CLASSIFIED';
        break;
      case 'REPAIR_STARTED':
      case 'REPAIR_EXTENDED':
        status = 'REPAIRING';
        break;
      case 'REPAIR_COMPLETED':
        status = 'REPAIRED';
        break;
      case 'REMEDY_AUTHORIZED':
        status = 'RECOVERY_AUTHORIZED';
        break;
      case 'SCORE_REOPENED':
      case 'EXECUTION_RECORDED':
        status = 'EXECUTED';
        break;
      case 'SCORE_SETTLED':
        status = 'SETTLED';
        break;
      case 'COMPLETED':
        status = 'COMPLETED';
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

export function latestQualificationMalfunctionClassification(
  entries: readonly QualificationMalfunctionEntry[],
): QualificationMalfunctionClassification | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const classification = entries[index]?.classification;
    if (classification) return classification;
  }
  return null;
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

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function optionalNonNegativeInteger(value: number | null | undefined, name: string): number | null {
  return value === undefined || value === null ? null : nonNegativeInteger(value, name);
}

function optionalPositiveInteger(value: number | null | undefined, name: string): number | null {
  return value === undefined || value === null ? null : positiveInteger(value, name);
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}

function copyRulePackIdentity(identity: RulePackIdentity | null): RulePackIdentity | null {
  return identity ? immutableCopy(identity) : null;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
