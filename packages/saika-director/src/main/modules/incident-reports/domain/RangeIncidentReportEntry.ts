export const INCIDENT_REPORT_OFFICIAL_ROLES = [
  'RANGE_OFFICER',
  'COMPETITION_JURY_MEMBER',
  'RTS_OFFICER',
  'RTS_JURY_MEMBER',
  'RANKING_TECHNICAL_OFFICER',
  'OTHER_OFFICIAL',
] as const;

export const INCIDENT_REPORT_ENTRY_TYPES = ['SIGNATURE', 'FORWARDED', 'NOTE', 'VOID'] as const;

export type IncidentReportOfficialRole = (typeof INCIDENT_REPORT_OFFICIAL_ROLES)[number];
export type IncidentReportEntryType = (typeof INCIDENT_REPORT_ENTRY_TYPES)[number];

interface CreateEntryBase {
  reportId: string;
  statement: string;
  officialName: string;
  recordedAt?: Date;
}

/** Immutable audit entry appended after a Range Incident Report is created. */
export class RangeIncidentReportEntry {
  private constructor(
    readonly id: string,
    readonly reportId: string,
    readonly type: IncidentReportEntryType,
    readonly officialRole: IncidentReportOfficialRole | null,
    readonly destination: string | null,
    readonly statement: string,
    readonly officialName: string,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static createSignature(
    props: CreateEntryBase & { officialRole: IncidentReportOfficialRole },
  ): RangeIncidentReportEntry {
    if (!INCIDENT_REPORT_OFFICIAL_ROLES.includes(props.officialRole)) {
      throw new Error('officialRole is invalid');
    }
    return this.createEntry('SIGNATURE', props, props.officialRole, null);
  }

  static createForwarding(props: CreateEntryBase & { destination: string }): RangeIncidentReportEntry {
    validateText(props.destination, 'destination');
    return this.createEntry('FORWARDED', props, null, props.destination.trim());
  }

  static createNote(props: CreateEntryBase): RangeIncidentReportEntry {
    return this.createEntry('NOTE', props, null, null);
  }

  static createVoid(props: CreateEntryBase): RangeIncidentReportEntry {
    return this.createEntry('VOID', props, null, null);
  }

  static reconstruct(props: {
    id: string;
    reportId: string;
    type: IncidentReportEntryType;
    officialRole: IncidentReportOfficialRole | null;
    destination: string | null;
    statement: string;
    officialName: string;
    recordedAt: Date;
  }): RangeIncidentReportEntry {
    return new RangeIncidentReportEntry(
      props.id,
      props.reportId,
      props.type,
      props.officialRole,
      props.destination,
      props.statement,
      props.officialName,
      new Date(props.recordedAt.getTime()),
    );
  }

  private static createEntry(
    type: IncidentReportEntryType,
    props: CreateEntryBase,
    officialRole: IncidentReportOfficialRole | null,
    destination: string | null,
  ): RangeIncidentReportEntry {
    validateText(props.reportId, 'reportId');
    validateText(props.statement, 'statement');
    validateText(props.officialName, 'officialName');
    const recordedAt = props.recordedAt ?? new Date();
    if (!Number.isFinite(recordedAt.getTime())) throw new Error('recordedAt must be valid');
    return new RangeIncidentReportEntry(
      crypto.randomUUID(),
      props.reportId,
      type,
      officialRole,
      destination,
      props.statement.trim(),
      props.officialName.trim(),
      new Date(recordedAt.getTime()),
    );
  }
}

export function isRangeIncidentReportVoided(entries: readonly RangeIncidentReportEntry[]): boolean {
  return entries.some((entry) => entry.type === 'VOID');
}

function validateText(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} is required`);
}
