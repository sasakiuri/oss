import type { FinalRecoveryAllowanceSubject } from './FinalRecoveryAuthorizationPolicy';

export const FINAL_RECOVERY_PROCEDURE_PROFILES = [
  'RIFLE_PISTOL_10M_50M',
  'RIFLE_PISTOL_10M_50M_MIXED_TEAM',
  'PISTOL_25M_RAPID_FIRE',
  'PISTOL_25M_WOMEN',
  'GENERAL',
] as const;
export const FINAL_RECOVERY_INCIDENT_TYPES = [
  'MALFUNCTION',
  'EST_FAILURE',
  'INCORRECT_COMMAND',
  'IRREGULAR_CASE',
] as const;
export const FINAL_RECOVERY_PHASES = ['SIGHTING', 'MATCH_SINGLE', 'MATCH_SERIES', 'SHOOT_OFF', 'OTHER'] as const;
export const FINAL_RECOVERY_ENTRY_TYPES = [
  'NOTE',
  'STOP_RECORDED',
  'JURY_RULING',
  'REMEDY_AUTHORIZED',
  'RESUMED',
  'COMPLETED',
  'VOID',
] as const;
export const FINAL_RECOVERY_CLASSIFICATIONS = [
  'ALLOWABLE_MALFUNCTION',
  'NON_ALLOWABLE_MALFUNCTION',
  'TARGET_MALFUNCTION',
  'SHOT_CONFIRMED_MISS',
  'COMMAND_CONFIRMED',
  'COMMAND_NOT_CONFIRMED',
  'OTHER',
] as const;
export const FINAL_RECOVERY_REMEDIES = [
  'NONE',
  'FIRE_TEST_SHOT',
  'REPEAT_SINGLE_SHOT',
  'COMPLETE_SERIES',
  'REPEAT_SERIES',
  'COUNT_DISPLAYED_SHOTS',
  'MOVE_TO_RESERVE_TARGET',
  'RESTART_PREPARATION_AND_SIGHTING',
  'GRANT_TWO_MINUTE_SIGHTING',
  'RESET_TO_ORIGINAL_TIME',
  'RESTART_WITH_REMAINING_TIME_PLUS_60',
  'NULLIFY_EXTRA_SHOTS_WITHOUT_PENALTY',
  'APPLY_RULE_PENALTY',
  'CONTINUE',
  'OTHER',
] as const;

export type FinalRecoveryProcedureProfile = (typeof FINAL_RECOVERY_PROCEDURE_PROFILES)[number];
export type FinalRecoveryIncidentType = (typeof FINAL_RECOVERY_INCIDENT_TYPES)[number];
export type FinalRecoveryPhase = (typeof FINAL_RECOVERY_PHASES)[number];
export type FinalRecoveryEntryType = (typeof FINAL_RECOVERY_ENTRY_TYPES)[number];
export type FinalRecoveryClassification = (typeof FINAL_RECOVERY_CLASSIFICATIONS)[number];
export type FinalRecoveryRemedy = (typeof FINAL_RECOVERY_REMEDIES)[number];
export type FinalRecoveryStatus =
  'OPEN' | 'STOPPED' | 'RULING_RECORDED' | 'RECOVERY_AUTHORIZED' | 'RESUMED' | 'COMPLETED' | 'VOID';

export class FinalRecoveryCase {
  private constructor(
    readonly id: string,
    readonly competitionId: string,
    readonly eventId: string | null,
    readonly finalRunId: string | null,
    readonly scriptStepId: string | null,
    readonly scriptStepSnapshot: string | null,
    readonly procedureProfile: FinalRecoveryProcedureProfile,
    readonly incidentType: FinalRecoveryIncidentType,
    readonly phase: FinalRecoveryPhase,
    readonly affectedLaneIds: readonly string[],
    readonly summary: string,
    readonly openedBy: string,
    readonly occurredAt: Date,
    readonly createdAt: Date,
    readonly allowanceSubject: FinalRecoveryAllowanceSubject | null,
  ) {
    Object.freeze(this.affectedLaneIds);
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    competitionId: string;
    eventId?: string | null;
    finalRunId?: string | null;
    scriptStepId?: string | null;
    scriptStepSnapshot?: string | null;
    procedureProfile: FinalRecoveryProcedureProfile;
    incidentType: FinalRecoveryIncidentType;
    phase: FinalRecoveryPhase;
    affectedLaneIds: readonly string[];
    summary: string;
    openedBy: string;
    occurredAt?: Date;
    createdAt?: Date;
    allowanceSubject?: FinalRecoveryAllowanceSubject | null;
  }): FinalRecoveryCase {
    if (!FINAL_RECOVERY_PROCEDURE_PROFILES.includes(props.procedureProfile)) {
      throw new Error('Final recovery procedure profile is invalid');
    }
    if (!FINAL_RECOVERY_INCIDENT_TYPES.includes(props.incidentType))
      throw new Error('Final recovery incident type is invalid');
    if (!FINAL_RECOVERY_PHASES.includes(props.phase)) throw new Error('Final recovery phase is invalid');
    const laneIds = props.affectedLaneIds.map((value) => requiredText(value, 'affectedLaneId'));
    if (new Set(laneIds).size !== laneIds.length) throw new Error('Affected Lane IDs must be unique');
    return new FinalRecoveryCase(
      props.id ?? crypto.randomUUID(),
      requiredText(props.competitionId, 'competitionId'),
      optionalText(props.eventId),
      optionalText(props.finalRunId),
      optionalText(props.scriptStepId),
      optionalText(props.scriptStepSnapshot),
      props.procedureProfile,
      props.incidentType,
      props.phase,
      [...laneIds],
      requiredText(props.summary, 'summary'),
      requiredText(props.openedBy, 'openedBy'),
      validDate(props.occurredAt ?? new Date(), 'occurredAt'),
      validDate(props.createdAt ?? new Date(), 'createdAt'),
      normalizeSubject(props.allowanceSubject),
    );
  }

  static reconstruct(
    props: Parameters<typeof FinalRecoveryCase.create>[0] & { id: string; createdAt: Date },
  ): FinalRecoveryCase {
    return FinalRecoveryCase.create(props);
  }
}

export class FinalRecoveryEntry {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly type: FinalRecoveryEntryType,
    readonly statement: string,
    readonly officialName: string,
    readonly ruleReference: string | null,
    readonly classification: FinalRecoveryClassification | null,
    readonly remedy: FinalRecoveryRemedy | null,
    readonly remainingTimeSeconds: number | null,
    readonly grantedTimeSeconds: number | null,
    readonly shotCount: number | null,
    readonly occurredAt: Date,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    caseId: string;
    type: FinalRecoveryEntryType;
    statement: string;
    officialName: string;
    ruleReference?: string | null;
    classification?: FinalRecoveryClassification | null;
    remedy?: FinalRecoveryRemedy | null;
    remainingTimeSeconds?: number | null;
    grantedTimeSeconds?: number | null;
    shotCount?: number | null;
    occurredAt?: Date;
    recordedAt?: Date;
  }): FinalRecoveryEntry {
    if (!FINAL_RECOVERY_ENTRY_TYPES.includes(props.type)) throw new Error('Final recovery entry type is invalid');
    if (props.classification && !FINAL_RECOVERY_CLASSIFICATIONS.includes(props.classification)) {
      throw new Error('Final recovery classification is invalid');
    }
    if (props.remedy && !FINAL_RECOVERY_REMEDIES.includes(props.remedy))
      throw new Error('Final recovery remedy is invalid');
    const classification = props.classification ?? null;
    const remedy = props.remedy ?? null;
    if (props.type === 'JURY_RULING' && !classification) throw new Error('A Jury ruling requires a classification');
    if (props.type !== 'JURY_RULING' && classification)
      throw new Error('Only a Jury ruling may include a classification');
    if (props.type === 'REMEDY_AUTHORIZED' && !remedy) throw new Error('A recovery authorization requires a remedy');
    if (props.type !== 'REMEDY_AUTHORIZED' && remedy)
      throw new Error('Only a recovery authorization may include a remedy');
    if (props.type !== 'REMEDY_AUTHORIZED' && (props.grantedTimeSeconds != null || props.shotCount != null)) {
      throw new Error('Granted time and shot count belong to a recovery authorization');
    }
    return new FinalRecoveryEntry(
      props.id ?? crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.type,
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      optionalText(props.ruleReference),
      classification,
      remedy,
      optionalNonNegativeInteger(props.remainingTimeSeconds, 'remainingTimeSeconds'),
      optionalNonNegativeInteger(props.grantedTimeSeconds, 'grantedTimeSeconds'),
      optionalNonNegativeInteger(props.shotCount, 'shotCount'),
      validDate(props.occurredAt ?? new Date(), 'occurredAt'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
    );
  }

  static reconstruct(
    props: Parameters<typeof FinalRecoveryEntry.create>[0] & { id: string; recordedAt: Date },
  ): FinalRecoveryEntry {
    return FinalRecoveryEntry.create(props);
  }
}

export function finalRecoveryStatus(entries: readonly FinalRecoveryEntry[]): FinalRecoveryStatus {
  let status: FinalRecoveryStatus = 'OPEN';
  for (const entry of entries) {
    switch (entry.type) {
      case 'STOP_RECORDED':
        status = 'STOPPED';
        break;
      case 'JURY_RULING':
        status = 'RULING_RECORDED';
        break;
      case 'REMEDY_AUTHORIZED':
        status = 'RECOVERY_AUTHORIZED';
        break;
      case 'RESUMED':
        status = 'RESUMED';
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

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function optionalNonNegativeInteger(value: number | null | undefined, name: string): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}

function normalizeSubject(
  subject: FinalRecoveryAllowanceSubject | null | undefined,
): FinalRecoveryAllowanceSubject | null {
  if (!subject) return null;
  if (subject.kind !== 'ATHLETE' && subject.kind !== 'TEAM')
    throw new Error('Invalid recovery allowance identity kind');
  return Object.freeze({
    kind: subject.kind,
    key: requiredText(subject.key, 'Allowance identity'),
    description: requiredText(subject.description, 'Allowance identity description'),
  });
}
