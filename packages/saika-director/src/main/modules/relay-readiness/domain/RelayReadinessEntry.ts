export const RELAY_READINESS_PHASES = ['RELAY', 'SIGHTING', 'MATCH'] as const;
export const RELAY_READINESS_REQUIREMENTS = [
  'RANGE_EQUIPMENT_READY',
  'TARGET_MODE_CONFIRMED',
  'BACKUP_MEMORY_READY',
  'TARGET_WHITE_SURFACE_CLEAR',
  'TARGET_FRAME_MARKS_INDICATED',
  'CONTROL_SHEET_RENEWED',
  'BACKING_MATERIAL_CLEAR',
] as const;
export const RELAY_READINESS_STATES = ['CONFIRMED', 'REVOKED'] as const;
export const RELAY_READINESS_SOURCES = ['MANUAL', 'LANE_REPORTED', 'IMPORT'] as const;

export type RelayReadinessPhase = (typeof RELAY_READINESS_PHASES)[number];
export type RelayReadinessOperationalPhase = Exclude<RelayReadinessPhase, 'RELAY'>;
export type RelayReadinessRequirement = (typeof RELAY_READINESS_REQUIREMENTS)[number];
export type RelayReadinessState = (typeof RELAY_READINESS_STATES)[number];
export type RelayReadinessSource = (typeof RELAY_READINESS_SOURCES)[number];

export interface RelayReadinessEntryProps {
  id?: string;
  competitionId: string;
  relayNumber: number;
  laneId?: string | null;
  phase: RelayReadinessPhase;
  requirement: RelayReadinessRequirement;
  state: RelayReadinessState;
  source: RelayReadinessSource;
  statement: string;
  officialName: string;
  recordedAt?: Date;
}

/** Immutable confirmation or revocation. Corrections are new entries, never updates. */
export class RelayReadinessEntry {
  private constructor(
    readonly id: string,
    readonly competitionId: string,
    readonly relayNumber: number,
    readonly laneId: string | null,
    readonly phase: RelayReadinessPhase,
    readonly requirement: RelayReadinessRequirement,
    readonly state: RelayReadinessState,
    readonly source: RelayReadinessSource,
    readonly statement: string,
    readonly officialName: string,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: RelayReadinessEntryProps): RelayReadinessEntry {
    const laneId = optionalText(props.laneId);
    if (!Number.isInteger(props.relayNumber) || props.relayNumber < 1) {
      throw new Error('relayNumber must be a positive integer');
    }
    if (!RELAY_READINESS_PHASES.includes(props.phase)) throw new Error('phase is invalid');
    if (!RELAY_READINESS_REQUIREMENTS.includes(props.requirement)) throw new Error('requirement is invalid');
    if (!RELAY_READINESS_STATES.includes(props.state)) throw new Error('state is invalid');
    if (!RELAY_READINESS_SOURCES.includes(props.source)) throw new Error('source is invalid');
    const laneScoped = isLaneScopedReadinessRequirement(props.requirement);
    if (laneScoped && !laneId) throw new Error(`${props.requirement} must identify a lane`);
    if (!laneScoped && laneId)
      throw new Error(`${props.requirement} is a relay-wide confirmation and must not identify a lane`);
    if ((props.phase === 'RELAY') !== isRelayPhaseRequirement(props.requirement)) {
      throw new Error(
        `${props.requirement} must use the ${isRelayPhaseRequirement(props.requirement) ? 'RELAY' : 'operational'} phase`,
      );
    }
    const recordedAt = props.recordedAt ?? new Date();
    if (!Number.isFinite(recordedAt.getTime())) throw new Error('recordedAt must be valid');

    return new RelayReadinessEntry(
      props.id ? requiredText(props.id, 'id') : crypto.randomUUID(),
      requiredText(props.competitionId, 'competitionId'),
      props.relayNumber,
      laneId,
      props.phase,
      props.requirement,
      props.state,
      props.source,
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      new Date(recordedAt.getTime()),
    );
  }

  static reconstruct(
    props: Required<Omit<RelayReadinessEntryProps, 'laneId' | 'recordedAt'>> & {
      laneId: string | null;
      recordedAt: Date;
    },
  ): RelayReadinessEntry {
    return RelayReadinessEntry.create(props);
  }
}

export function isLaneScopedReadinessRequirement(requirement: RelayReadinessRequirement): boolean {
  return [
    'TARGET_MODE_CONFIRMED',
    'TARGET_WHITE_SURFACE_CLEAR',
    'TARGET_FRAME_MARKS_INDICATED',
    'CONTROL_SHEET_RENEWED',
    'BACKING_MATERIAL_CLEAR',
  ].includes(requirement);
}

export function isRelayPhaseRequirement(requirement: RelayReadinessRequirement): boolean {
  return [
    'RANGE_EQUIPMENT_READY',
    'BACKUP_MEMORY_READY',
    'TARGET_WHITE_SURFACE_CLEAR',
    'TARGET_FRAME_MARKS_INDICATED',
    'CONTROL_SHEET_RENEWED',
    'BACKING_MATERIAL_CLEAR',
  ].includes(requirement);
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
