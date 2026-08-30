export const RANGE_INTERRUPTION_ENTRY_TYPES = [
  'PAUSE_APPLIED',
  'ENDED',
  'TIME_GRANTED',
  'RESUME_APPLIED',
  'MATCH_RESUMED',
  'NOTE',
  'CLOSED',
  'REOPENED',
  'VOID',
] as const;

export type RangeInterruptionEntryType = (typeof RANGE_INTERRUPTION_ENTRY_TYPES)[number];
export type RangeInterruptionStatus = 'OPEN' | 'ENDED' | 'GRANTED' | 'RESUMED' | 'CLOSED' | 'VOID';

export interface CreateRangeInterruptionEntryProps {
  caseId: string;
  type: RangeInterruptionEntryType;
  occurredAt: Date;
  statement: string;
  officialName: string;
  ruleReference?: string;
  lostTimeSeconds?: number;
  extensionSeconds?: number;
  authorizedRemainingSeconds?: number;
  unlimitedSightingShots?: boolean;
  incidentReportReference?: string;
  commandId?: string;
  recordedAt?: Date;
}

/** Structured, immutable audit entry for an interruption workflow. */
export class RangeInterruptionEntry {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly type: RangeInterruptionEntryType,
    readonly occurredAt: Date,
    readonly statement: string,
    readonly officialName: string,
    readonly ruleReference: string | null,
    readonly lostTimeSeconds: number | null,
    readonly extensionSeconds: number | null,
    readonly authorizedRemainingSeconds: number | null,
    readonly unlimitedSightingShots: boolean | null,
    readonly incidentReportReference: string | null,
    readonly commandId: string | null,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateRangeInterruptionEntryProps): RangeInterruptionEntry {
    if (!RANGE_INTERRUPTION_ENTRY_TYPES.includes(props.type)) throw new Error('entry type is invalid');
    validateStructuredFields(props);
    return new RangeInterruptionEntry(
      crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.type,
      validDate(props.occurredAt, 'occurredAt'),
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      normalizeOptional(props.ruleReference),
      props.lostTimeSeconds ?? null,
      props.extensionSeconds ?? null,
      props.authorizedRemainingSeconds ?? null,
      props.unlimitedSightingShots ?? null,
      normalizeOptional(props.incidentReportReference),
      normalizeOptional(props.commandId),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
    );
  }

  static reconstruct(props: {
    id: string;
    caseId: string;
    type: RangeInterruptionEntryType;
    occurredAt: Date;
    statement: string;
    officialName: string;
    ruleReference: string | null;
    lostTimeSeconds: number | null;
    extensionSeconds: number | null;
    authorizedRemainingSeconds: number | null;
    unlimitedSightingShots: boolean | null;
    incidentReportReference: string | null;
    commandId: string | null;
    recordedAt: Date;
  }): RangeInterruptionEntry {
    return new RangeInterruptionEntry(
      props.id,
      props.caseId,
      props.type,
      validDate(props.occurredAt, 'occurredAt'),
      props.statement,
      props.officialName,
      props.ruleReference,
      props.lostTimeSeconds,
      props.extensionSeconds,
      props.authorizedRemainingSeconds,
      props.unlimitedSightingShots,
      props.incidentReportReference,
      props.commandId,
      validDate(props.recordedAt, 'recordedAt'),
    );
  }
}

export interface RangeInterruptionState {
  status: RangeInterruptionStatus;
  dataHoldActive: boolean;
  endedEntry: RangeInterruptionEntry | null;
  grantEntry: RangeInterruptionEntry | null;
}

/** Derives workflow state exclusively from the append-only entry stream. */
export function getRangeInterruptionState(entries: readonly RangeInterruptionEntry[]): RangeInterruptionState {
  let operationalStatus: Exclude<RangeInterruptionStatus, 'CLOSED' | 'VOID'> = 'OPEN';
  let status: RangeInterruptionStatus = 'OPEN';
  let endedEntry: RangeInterruptionEntry | null = null;
  let grantEntry: RangeInterruptionEntry | null = null;

  for (const entry of entries) {
    switch (entry.type) {
      case 'ENDED':
        operationalStatus = 'ENDED';
        status = 'ENDED';
        endedEntry = entry;
        break;
      case 'TIME_GRANTED':
        operationalStatus = 'GRANTED';
        status = 'GRANTED';
        grantEntry = entry;
        break;
      case 'RESUME_APPLIED':
        operationalStatus = 'RESUMED';
        status = 'RESUMED';
        break;
      case 'CLOSED':
        status = 'CLOSED';
        break;
      case 'REOPENED':
        status = operationalStatus;
        break;
      case 'VOID':
        status = 'VOID';
        break;
      case 'PAUSE_APPLIED':
      case 'MATCH_RESUMED':
      case 'NOTE':
        break;
    }
  }

  return { status, dataHoldActive: status !== 'CLOSED' && status !== 'VOID', endedEntry, grantEntry };
}

function validateStructuredFields(props: CreateRangeInterruptionEntryProps): void {
  for (const [name, value] of [
    ['lostTimeSeconds', props.lostTimeSeconds],
    ['extensionSeconds', props.extensionSeconds],
    ['authorizedRemainingSeconds', props.authorizedRemainingSeconds],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new Error(`${name} must be non-negative`);
  }

  if (props.type === 'ENDED' && props.lostTimeSeconds === undefined) {
    throw new Error('lostTimeSeconds is required when ending an interruption');
  }
  if (props.type === 'TIME_GRANTED') {
    if (props.extensionSeconds === undefined || props.authorizedRemainingSeconds === undefined) {
      throw new Error('A time grant requires extensionSeconds and authorizedRemainingSeconds');
    }
    if (props.unlimitedSightingShots === undefined) {
      throw new Error('A time grant must state whether unlimited sighting shots are authorized');
    }
    if (!normalizeOptional(props.incidentReportReference)) {
      throw new Error('A Range Incident Report reference is required for a time grant');
    }
    if (!normalizeOptional(props.ruleReference)) throw new Error('A time grant requires a rule reference');
  }
  if (
    (props.type === 'PAUSE_APPLIED' || props.type === 'RESUME_APPLIED' || props.type === 'MATCH_RESUMED') &&
    !normalizeOptional(props.commandId)
  ) {
    throw new Error('commandId is required when recording an applied Lane command');
  }
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
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
