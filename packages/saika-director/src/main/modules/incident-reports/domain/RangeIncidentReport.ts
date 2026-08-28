import { INCIDENT_REPORT_OFFICIAL_ROLES, type IncidentReportOfficialRole } from './RangeIncidentReportEntry';

export interface CreateRangeIncidentReportProps {
  eventId: string;
  serialNumber: string;
  eventName: string;
  occurredAt: Date;
  relayNumber?: number;
  firingPointNumber?: number;
  athleteName?: string;
  bibNumber?: string;
  nationality?: string;
  stage?: string;
  series?: string;
  details: string;
  ruleReferences: string;
  penalty?: string;
  scoreAmendmentReference?: string;
  initiatorRole: IncidentReportOfficialRole;
  initiatorName: string;
  createdAt?: Date;
}

/** Immutable facts captured when an ISSF Range Incident Report is initiated. */
export class RangeIncidentReport {
  private constructor(
    readonly id: string,
    readonly eventId: string,
    readonly serialNumber: string,
    readonly eventName: string,
    readonly occurredAt: Date,
    readonly relayNumber: number | null,
    readonly firingPointNumber: number | null,
    readonly athleteName: string | null,
    readonly bibNumber: string | null,
    readonly nationality: string | null,
    readonly stage: string | null,
    readonly series: string | null,
    readonly details: string,
    readonly ruleReferences: string,
    readonly penalty: string | null,
    readonly scoreAmendmentReference: string | null,
    readonly initiatorRole: IncidentReportOfficialRole,
    readonly initiatorName: string,
    readonly createdAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateRangeIncidentReportProps): RangeIncidentReport {
    validate(props);
    return new RangeIncidentReport(
      crypto.randomUUID(),
      props.eventId,
      props.serialNumber.trim(),
      props.eventName.trim(),
      new Date(props.occurredAt.getTime()),
      props.relayNumber ?? null,
      props.firingPointNumber ?? null,
      normalizeOptional(props.athleteName),
      normalizeOptional(props.bibNumber),
      normalizeOptional(props.nationality),
      normalizeOptional(props.stage),
      normalizeOptional(props.series),
      props.details.trim(),
      props.ruleReferences.trim(),
      normalizeOptional(props.penalty),
      normalizeOptional(props.scoreAmendmentReference),
      props.initiatorRole,
      props.initiatorName.trim(),
      validDate(props.createdAt, 'createdAt'),
    );
  }

  static reconstruct(props: {
    id: string;
    eventId: string;
    serialNumber: string;
    eventName: string;
    occurredAt: Date;
    relayNumber: number | null;
    firingPointNumber: number | null;
    athleteName: string | null;
    bibNumber: string | null;
    nationality: string | null;
    stage: string | null;
    series: string | null;
    details: string;
    ruleReferences: string;
    penalty: string | null;
    scoreAmendmentReference: string | null;
    initiatorRole: IncidentReportOfficialRole;
    initiatorName: string;
    createdAt: Date;
  }): RangeIncidentReport {
    return new RangeIncidentReport(
      props.id,
      props.eventId,
      props.serialNumber,
      props.eventName,
      new Date(props.occurredAt.getTime()),
      props.relayNumber,
      props.firingPointNumber,
      props.athleteName,
      props.bibNumber,
      props.nationality,
      props.stage,
      props.series,
      props.details,
      props.ruleReferences,
      props.penalty,
      props.scoreAmendmentReference,
      props.initiatorRole,
      props.initiatorName,
      new Date(props.createdAt.getTime()),
    );
  }
}

function validate(props: CreateRangeIncidentReportProps): void {
  for (const [name, value] of [
    ['eventId', props.eventId],
    ['serialNumber', props.serialNumber],
    ['eventName', props.eventName],
    ['details', props.details],
    ['ruleReferences', props.ruleReferences],
    ['initiatorName', props.initiatorName],
  ] as const) {
    if (value.trim().length === 0) throw new Error(`${name} is required`);
  }
  validDate(props.occurredAt, 'occurredAt');
  validPositiveInteger(props.relayNumber, 'relayNumber');
  validPositiveInteger(props.firingPointNumber, 'firingPointNumber');
  if (!INCIDENT_REPORT_OFFICIAL_ROLES.includes(props.initiatorRole)) {
    throw new Error('initiatorRole is invalid');
  }
}

function validPositiveInteger(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw new Error(`${name} must be positive`);
  }
}

function validDate(value: Date | undefined, name: string): Date {
  const date = value ?? new Date();
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} must be valid`);
  return new Date(date.getTime());
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
